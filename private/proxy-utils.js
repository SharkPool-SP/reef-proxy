/* Module Imports */
const zlib = require("zlib");
const puppeteer = require("puppeteer");

/* Local Imports */
const blockedUrls = require("./blocklist.json");
const TargetCache = require("./cacher.js");
const { applyTransformation } = require("./transformer.js");
const {
  MAX_CONTENT_LENGTH,
  sendResExceedsLimit,
  getContentLength,
  validateContentLength,
  watchResponseSize,
  removeExtraHeaders,
  decompressBody,
} = require("./pipeline-utils.js");

/* Setup */
const HEAD_CHECK_TIMEOUT = 5000; // 5 seconds max to fetch the HEAD
const CACHE_EXPIRES_SECS = 60 * 60; // expires after 1 hour
const DEBUG_MODE = process.env.DEBUG === "true" || process.env.DEBUG === "1";

const PROXY_OPTIONS = {
  router: (req) => getTargetUrl(req).origin,
  pathRewrite: (_, req) => {
    const url = getTargetUrl(req);
    return url.pathname + url.search;
  },
  changeOrigin: true,
  logLevel: "warn",
  selfHandleResponse: true,
  on: {
    proxyReq(proxyReq, req) {
      proxyReq.removeHeader("x-target-url");
      proxyReq.removeHeader("x-wait-seconds");
      proxyReq.removeHeader("x-transform");
      proxyReq.setHeader("accept-encoding", "identity");
    },
    async proxyRes(proxyRes, req, res) {
      watchResponseSize(proxyRes, res);

      res.statusCode = proxyRes.statusCode;
      const isOk = res.statusCode >= 200 && res.statusCode < 300;

      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (value !== undefined) res.setHeader(key, value);
      }

      res.setHeader(
        "Cache-Control",
        isOk
          ? `private, max-age=${CACHE_EXPIRES_SECS}, stale-while-revalidate=60`
          : "no-store",
      );

      removeExtraHeaders(proxyRes);

      const contentType = proxyRes.headers["content-type"] || "";
      const hasTransformation = Boolean(req.headers["x-transform"]);
      if (
        !hasTransformation &&
        !(isOk && TargetCache.isCacheable(contentType))
      ) {
        proxyRes.pipe(res);
        return;
      }

      const chunks = [];
      proxyRes.on("data", (chunk) => chunks.push(chunk));
      proxyRes.on("end", async () => {
        try {
          let body = Buffer.concat(chunks);

          const encoding = proxyRes.headers["content-encoding"];
          if (encoding) {
            try {
              body = decompressBody(encoding, body);

              res.removeHeader("content-encoding");
              res.removeHeader("content-length");
            } catch {
              // Preserve the content as-is if decompression fails
              body = Buffer.concat(chunks);
              res.setHeader("content-encoding", encoding);
            }
          }

          if (!hasTransformation && body.length > MAX_CONTENT_LENGTH) {
            sendResExceedsLimit(res);
            return;
          }

          let finalContentType = contentType;
          if (hasTransformation) {
            const { type, content } = await applyTransformation(
              "proxy",
              req,
              body,
              contentType,
            );

            body = content;
            finalContentType = type;

            // The transformed body has a new size.
            res.removeHeader("content-length");
            res.setHeader("Content-Type", type);
          }

          if (DEBUG_MODE) {
            console.log(`► SIZE (post-transform): ${body.length}`);
          }
          if (body.length > MAX_CONTENT_LENGTH) {
            sendResExceedsLimit(res);
            return;
          }

          if (isOk) {
            TargetCache.handleResponse(
              req,
              getTargetUrl(req),
              res.statusCode,
              finalContentType,
              body,
            );
          }

          res.end(body);
        } catch (e) {
          if (!res.headersSent) {
            res.status(400).json({ error: e.message || String(e) });
          } else {
            res.end();
          }
        }
      });
    },
  },
};

/**
 * Get the request's target url.
 *
 * @param {Request} req Express request object
 * @returns URL object of target
 */
const getTargetUrl = function (req) {
  const target = req.headers["x-target-url"] || req.query.url || req.query.u;
  if (!target) return null;

  try {
    if (target.startsWith("https://") || target.startsWith("http://")) {
      return new URL(target);
    }
  } catch {}

  return null;
};

/**
 * Validates that the user inputted a target url before moving onto the next function.
 *
 * @param {Request} req Express request object
 * @param {Response} res Express response object
 * @param {NextFunction} next Express next function
 */
const validateTargetUrl = function (req, res, next) {
  if (!getTargetUrl(req)) {
    res.status(400).json({
      error:
        "Missing proxy target destination/resource. See docs at '/help' or '/'",
    });
    return false;
  }

  return true;
};

/**
 * Performs a scrape request.
 *
 * @param {Request} req Express request object
 * @param {Response} res Express response object
 */
const handleScrape = async (req, res) => {
  const targetUrl = getTargetUrl(req);
  const waitTime = parseInt(
    req.headers["x-wait-seconds"] || req.query.wait || "0",
    10,
  );
  const scrapeDelay = 1000 * Math.max(0, Math.min(10, waitTime));

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto(targetUrl.href, { waitUntil: "networkidle2" });
    await new Promise((resolve) => setTimeout(resolve, scrapeDelay));

    const { type, content } = await applyTransformation(
      "scrape",
      req,
      page,
      "text/html",
    );
    await browser.close();

    const body = Buffer.from(content, "utf8");
    if (DEBUG_MODE) {
      console.log(`SIZE (SCRAPE-post-transform): ${body.length} - URL: ${targetUrl.href}`);
    }

    if (body.length > MAX_CONTENT_LENGTH) {
      sendResExceedsLimit(res);
      return;
    }

    res.setHeader("Content-Type", type);
    TargetCache.handleResponse(req, targetUrl, 200, type, body);
    res.status(200).send(body);
  } catch (e) {
    if (browser) await browser.close();
    res.status(500).json({ error: e.message || e });
  }
};

/**
 * General pipeline for every proxy route.
 * Check rate limit -> validate url -> check cache -> proxy access
 *
 * @param {Request} req Express request object
 * @param {Response} res Express response object
 * @param {NextFunction} next Express next function
 */
const requestHandler = async function (req, res, next) {
  const { proxyLimiter, scrapeLimiter, cache } = this;

  const limiterSuccess = req.url.startsWith("/scrape")
    ? scrapeLimiter.handleRequest(req, res)
    : proxyLimiter.handleRequest(req, res);
  if (!limiterSuccess) return;

  const urlValidated = validateTargetUrl(req, res);
  if (!urlValidated) return;

  const targetUrl = getTargetUrl(req);
  const isBlocked = blockedUrls.find((url) => {
    if (url.startsWith("http")) return targetUrl.href.startsWith(url);
    else return targetUrl.href.includes(url);
  });

  if (isBlocked) {
    res.status(403).json({
      error: `Target resource is blocked by Reef Proxy`,
    });
    return;
  }

  if (DEBUG_MODE) {
    console.log(`START TYPE: ${String(req.url).split("?")[0]} - URL: ${targetUrl.href}`);
  }

  if (req.method === "HEAD") {
    const contentLength = await getContentLength(targetUrl);
    res.setHeader("Content-Length", contentLength);
    res.status(200).end();
    return;
  }

  const hasNoCache = cache.handleRequest(req, res, targetUrl);
  if (!hasNoCache) return;

  const withinLimit = await validateContentLength(targetUrl, res);
  if (withinLimit) next();
};

module.exports = {
  PROXY_OPTIONS,
  getTargetUrl,
  validateTargetUrl,
  handleScrape,
  requestHandler,
};
