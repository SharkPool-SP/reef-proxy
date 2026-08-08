const zlib = require("zlib");
const TargetCache = require("./cacher.js");

const MAX_CONTENT_LENGTH = 30 * 1024 * 1024; // We wont accept/return resources above 30MB
const HEAD_CHECK_TIMEOUT = 5000; // 5 seconds max to fetch the HEAD
const CACHE_EXPIRES_SECS = 60 * 60; // expires after 1 hour
const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1";

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
    },
    proxyRes(proxyRes, req, res) {
      watchResponseSize(proxyRes, res);

      res.statusCode = proxyRes.statusCode;
      const isOk = res.statusCode >= 200 && res.statusCode < 300;

      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (value !== undefined) res.setHeader(key, value);
      }

      // Only tell clients to cache successful responses
      res.setHeader(
        "Cache-Control",
        isOk
          ? `private, max-age=${CACHE_EXPIRES_SECS}, stale-while-revalidate=60`
          : "no-store",
      );

      removeExtraHeaders(proxyRes);

      // We should only cache text-like MIMEs, others can be streamed.
      const contentType = proxyRes.headers["content-type"] || "";
      if (!(isOk && TargetCache.isCacheable(contentType))) {
        proxyRes.pipe(res);
        return;
      }

      const chunks = [];
      proxyRes.on("data", (chunk) => chunks.push(chunk));
      proxyRes.on("end", () => {
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

        if (body.length > MAX_CONTENT_LENGTH) {
          sendResExceedsLimit(res);
          return;
        }

        TargetCache.handleResponse(
          req,
          getTargetUrl(req),
          res.statusCode,
          contentType,
          body,
        );
        res.end(body);
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

  return new URL(target);
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
      error: "Missing proxy target destination. See docs at '/help' or '/'",
    });
    return false;
  }

  return true;
};

/**
 * Responds to the client that the requested resource exceeds the limit.
 *
 * @param {Response} res Express response object
 */
const sendResExceedsLimit = function (res) {
  if (res.headersSent) return;

  res.status(413).json({
    error: `Target response exceeds ${MAX_CONTENT_LENGTH / (1024 * 1024)}MB limit`,
  });
};

/**
 * Fetches the content length of a target resource using a HEAD request.
 *
 * @param {URL} targetUrl
 * @returns Content length of the target resource, or null if it cannot be determined
 */
const getContentLength = async function (targetUrl) {
  try {
    const headRes = await fetch(targetUrl.href, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(HEAD_CHECK_TIMEOUT),
    });

    const length = headRes.headers.get("content-length");
    return length ? Number(length) : null;
  } catch {
    // HEAD is unsupported/blocked/timed out... just let it request
    return null;
  }
};

/**
 * HEAD-check target to reject oversized responses before proxying.
 *
 * @param {URL} targetUrl
 * @param {Response} res Express response object
 * @returns {Promise<boolean>} whether the request may proceed
 */
const validateContentLength = async function (targetUrl, res) {
  const length = await getContentLength(targetUrl);
  if (length !== null && length > MAX_CONTENT_LENGTH) {
    sendResExceedsLimit(res);
    return false;
  }

  return true;
};

/**
 * Monitors a proxied response stream and terminates it if it exceeds the maximum allowed size.
 *
 * @param {IncomingMessage} proxyRes Response stream received
 * @param {Response} res Express response object
 */
const watchResponseSize = function (proxyRes, res) {
  let size = 0;
  proxyRes.on("data", (chunk) => {
    size += chunk.length;

    if (size > MAX_CONTENT_LENGTH) {
      proxyRes.destroy();
      sendResExceedsLimit(res);
    }
  });
};

/**
 * Remove unnecessary headers to save some Bandwidth/payload size.
 *
 * @param {Response} res Express response object
 */
const removeExtraHeaders = function (res) {
  delete res.headers["set-cookie"];
  delete res.headers["cookie"];
  delete res.headers["x-runtime"];
  delete res.headers["server"];
  delete res.headers["x-powered-by"];
  delete res.headers["report-to"];
  delete res.headers["nel"];
  delete res.headers["cf-ray"];
  delete res.headers["cf-cache-status"];
  delete res.headers["alt-svc"];
};

/**
 * Decompresses a response body for cache.
 *
 * @param {String} encoding Encoding used on content
 * @param {*} body Content to decompress
 * @returns Decompressed body
 */
const decompressBody = (encoding, body) => {
  switch (encoding) {
    case "gzip":
    case "x-gzip":
      return zlib.gunzipSync(body);
    case "br":
      return zlib.brotliDecompressSync(body);
    case "deflate":
      return zlib.inflateSync(body);
    default:
      return body;
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

  const limiterSuccess = proxyLimiter.handleRequest(req, res);
  if (!limiterSuccess) return;

  const urlValidated = validateTargetUrl(req, res);
  if (!urlValidated) return;

  const targetUrl = getTargetUrl(req);
  if (DEBUG) {
    console.log(targetUrl.href);
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
  MAX_CONTENT_LENGTH,
  getTargetUrl,
  validateTargetUrl,
  sendResExceedsLimit,
  removeExtraHeaders,
  requestHandler,
};
