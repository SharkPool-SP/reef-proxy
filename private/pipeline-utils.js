/* Setup */
const HeatMap = require("./heat-map.js");
const { MAX_CONTENT_LENGTH, HEAD_CHECK_TIMEOUT } = require("./constants.js");

/**
 * Responds to the client that the requested resource exceeds the limit.
 *
 * @param {Response} res Express response object
 */
const sendResExceedsLimit = function (res) {
  if (res.headersSent) return;

  res.status(413).json({
    error: `Target resource exceeds ${MAX_CONTENT_LENGTH / (1024 * 1024)}MB limit. Try using our 'Transformation' API (refer to docs).`,
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
 * @param {Function} resultSizeCallback Callback that runs when the response size is fully read
 */
const watchResponseSize = function (proxyRes, res, resultSizeCallback) {
  let size = 0;
  proxyRes.on("data", (chunk) => {
    size += chunk.length;

    if (size > MAX_CONTENT_LENGTH) {
      proxyRes.destroy();
      sendResExceedsLimit(res);
    }
  });

  proxyRes.on("end", () => {
    resultSizeCallback(size);
  });
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

module.exports = {
  sendResExceedsLimit,
  getContentLength,
  validateContentLength,
  watchResponseSize,
  decompressBody,
};
