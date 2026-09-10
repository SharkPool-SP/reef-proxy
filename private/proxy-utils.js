const { CACHE_EXPIRES_SECS } = require("./constants.js");

/**
 * Validates that the user inputted a target url before moving onto the next function.
 *
 * @param {Request} req Express request object
 * @param {Response} res Express response object
 */
const validateTargetUrl = function (req, res) {
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
 * Remove headers from our proxy.
 *
 * @param {Request} req Express request object
 */
const cleanupHeaders = function (req) {
  req.removeHeader("x-target-url");
  req.removeHeader("x-wait-seconds");
  req.removeHeader("x-transform");
  req.setHeader("accept-encoding", "identity");
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
 * Cleans up and transfers the response headers from the proxy to the client.
 *
 * @param {Response} res Express response object (proxy)
 * @param {Response} res Express response object (to-client)
 * @returns {Boolean} True if the response is OK (2xx), false otherwise
 */
const setupResponseHeaders = function (proxyRes, res) {
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

  return isOk;
};

module.exports = {
  validateTargetUrl,
  getTargetUrl,
  cleanupHeaders,
  removeExtraHeaders,
  setupResponseHeaders,
};
