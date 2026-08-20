/* Setup */
const MAX_CONTENT_LENGTH = 30 * 1024 * 1024; // We wont accept/return resources above 30MB

/**
 * Responds to the client that the requested resource exceeds the limit.
 *
 * @param {Response} res Express response object
 */
const sendResExceedsLimit = function (res) {
  if (res.headersSent) return;

  res.status(413).json({
    error: `Target resource exceeds ${MAX_CONTENT_LENGTH / (1024 * 1024)}MB limit`,
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

module.exports = {
  sendResExceedsLimit,
  getContentLength,
  validateContentLength,
  watchResponseSize,
  removeExtraHeaders,
  decompressBody,
};
