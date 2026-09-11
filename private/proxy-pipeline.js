/* Module Imports */
const zlib = require("zlib");
const puppeteer = require("puppeteer");

/* Local Imports */
const blockedUrls = require("./blocklist.json");
const HeatMap = require("./heat-map.js");
const TargetCache = require("./cacher.js");

const { applyTransformation } = require("./transformer.js");
const {
  validateTargetUrl,
  getTargetUrl,
  cleanupHeaders,
  removeExtraHeaders,
  setupResponseHeaders,
} = require("./proxy-utils.js");
const {
  MAX_CONTENT_LENGTH,
  sendResExceedsLimit,
  getContentLength,
  validateContentLength,
  watchResponseSize,
  decompressBody,
} = require("./pipeline-utils.js");

/* Setup */
const { DEBUG_MODE } = require("./constants.js");

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
      cleanupHeaders(proxyReq);
    },
    async proxyRes(proxyRes, req, res) {
      removeExtraHeaders(proxyRes);
      const isOk = setupResponseHeaders(proxyRes, res);
      const targetUrl = getTargetUrl(req);

      const contentType = proxyRes.headers["content-type"] || "";
      const hasTransformation = Boolean(req.headers["x-transform"]);
      const willDirectlyPipe = !hasTransformation &&
        !(isOk && TargetCache.isCacheable(contentType));

      watchResponseSize(proxyRes, res, (contentLength) => {
        if (willDirectlyPipe) {
          HeatMap.handleResponse(req, res, targetUrl.href, contentLength);
        }
      });

      if (willDirectlyPipe) {
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

          responseHandler(req, res, body, {
            isOk,
            contentType: finalContentType,
            targetUrl: targetUrl,
          });
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
    responseHandler(req, res, body, {
      isScrape: true,
      contentType: type,
      targetUrl,
    });
  } catch (e) {
    if (browser) await browser.close();
    res.status(500).json({ error: e.message || e });
  }
};

/**
 * General pipeline for every proxy route request.
 * Check rate limit -> validate url -> check cache -> proxy access
 *
 * @param {Request} req Express request object
 * @param {Response} res Express response object
 * @param {NextFunction} next Express next function
 */
const requestHandler = async function (req, res, next) {
  const { proxyLimiter, scrapeLimiter } = this;

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

  const isNotHeatFlagged = HeatMap.handleRequest(req, res, targetUrl.href);
  if (!isNotHeatFlagged) {
    res.status(429).json({
      error: `Too many requests to this resource from your IP addresss. Please wait a while before trying again. Consider using our 'Transformation' API (refer to docs) to reduce the size of the resource.`,
    });
    return;
  }

  if (DEBUG_MODE) {
    console.log(
      `TYPE: ${String(req.url).split("?")[0]} - URL: ${targetUrl.href}`,
    );
  }

  if (req.method === "HEAD") {
    const contentLength = await getContentLength(targetUrl);
    res.setHeader("Content-Length", contentLength);
    res.status(200).end();
    return;
  }

  const hasNoCache = TargetCache.handleRequest(req, res, targetUrl);
  if (!hasNoCache) return;

  const withinLimit = await validateContentLength(targetUrl, res);
  if (withinLimit) next();
};

/**
 * General pipeline for every proxy route response.
 * Check rate limit -> validate url -> check cache -> proxy access
 *
 * @param {Request} req Express request object
 * @param {Response} res Express response object
 * @param {*} body Response body
 * @param {Object} data Additional data for response handling
 */
const responseHandler = async function (req, res, body, data = {}) {
  if (body.length > MAX_CONTENT_LENGTH) {
    sendResExceedsLimit(res);
    return;
  }

  HeatMap.handleResponse(req, res, data.targetUrl.href, body.length);

  if (data.isScrape) {
    res.setHeader("Content-Type", data.contentType);
    TargetCache.handleResponse(
      req,
      data.targetUrl,
      200,
      data.contentType,
      body,
    );
    res.status(200).send(body);
  } else {
    if (data.isOk) {
      TargetCache.handleResponse(
        req,
        getTargetUrl(req),
        res.statusCode,
        data.contentType,
        body,
      );
    }

    res.end(body);
  }
};

module.exports = {
  PROXY_OPTIONS,
  getTargetUrl,
  validateTargetUrl,
  handleScrape,
  requestHandler,
  responseHandler,
};
