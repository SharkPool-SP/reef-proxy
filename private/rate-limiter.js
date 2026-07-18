/**
 * RateLimiter limits the number of requests a user can make from their IP address.
 */
class RateLimiter {
  constructor(maxReqs, timeout) {
    this.MAX_REQUESTS = Number(maxReqs);
    this.REQ_TIMEOUT = Number(timeout);
    this.handleRequest = this.handleRequest.bind(this);
    this._limiter = new Map();
    this._limiterInit = true;
  }

  scheduledCleanup() {
    if (!this._limiterInit) return;

    const now = Date.now();
    for (const [key, record] of this._limiter.entries()) {
      if (now > record.exp) this._limiter.delete(key);
    }
  }

  handleRequest(req, res) {
    if (!this._limiterInit) {
      res.status(500).send("Server Error: Rate limiter has not initialized!");
      return false;
    }

    const ipIdentifier = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const key = Buffer.from(ipIdentifier).toString("base64");

    const now = Date.now();
    const record = this._limiter.get(key);
    if (record === undefined) {
      this._limiter.set(key, {
        cnt: 1,
        exp: now + this.REQ_TIMEOUT,
      });
    } else {
      if (now > record.exp) {
        record.cnt = 1;
        record.exp = now + this.REQ_TIMEOUT;
      } else if (record.cnt >= this.MAX_REQUESTS) {
        res.status(429).send("Rate Limit Exceeded. Please try again later.");
        return false;
      } else {
        record.cnt++;
      }
    }

    return true;
  }
}

module.exports = RateLimiter;
