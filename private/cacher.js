/**
 * TargetCache temporarily caches responses to save bandwidth.
 */
class TargetCache {
  static CACHEABLES = [
    "text/html",
    "application/json",
    "text/plain",
    "text/css",
    "text/javascript",
    "application/javascript",
    "application/ecmascript",
    "application/ld+json",
    "image/svg+xml",
    "text/markdown",
    "text/csv",
    "text/xml",
    "application/xml",
  ];
  static CACHE_TIMEOUT = 0;

  static _cache = new Map();
  static initialized = false;

  static _genCacheID(req, targetUrl) {
    const encoders = [req.path, targetUrl.href, JSON.stringify(req.body)];
    return Buffer.from(encoders.join("|"), "utf8").toString("base64");
  }

  static isCacheable(contentType) {
    const mimeType = contentType.split(";")[0];
    return TargetCache.CACHEABLES.indexOf(mimeType) > -1;
  }

  static init(timeout) {
    TargetCache.CACHE_TIMEOUT = Number(timeout);
    TargetCache.initialized = true;
  }

  static scheduledCleanup() {
    if (!TargetCache.initialized) return;

    const now = Date.now();
    for (const [key, record] of this._cache.entries()) {
      if (now > record.exp) this._cache.delete(key);
    }
  }

  static handleRequest(req, res, targetUrl) {
    if (!TargetCache.initialized) {
      res.status(500).send("Server Error: Target Cache has not initialized!");
      return false;
    }

    const cacheID = TargetCache._genCacheID(req, targetUrl);
    if (TargetCache._cache.has(cacheID)) {
      const cached = TargetCache._cache.get(cacheID);

      if (Date.now() > cached.exp) {
        TargetCache._cache.delete(cacheID);
      } else {
        if (cached.contentType) {
          res.setHeader("Content-Type", cached.contentType);
        }

        res.status(cached.status).send(cached.data);
        return false;
      }
    }

    return true;
  }

  static handleResponse(req, targetUrl, status, contentType, data) {
    if (status < 200 || status >= 300) return;

    const cacheID = TargetCache._genCacheID(req, targetUrl);
    TargetCache._cache.set(cacheID, {
      exp: Date.now() + TargetCache.CACHE_TIMEOUT,
      status,
      contentType,
      data,
    });
  }
}

module.exports = TargetCache;
