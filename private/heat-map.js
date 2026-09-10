/**
 * Heat Map tracks requests and prevents users from repeatedly sending too
 * many requests to a heavy resource from their IP address.
 *
 * Essentially, if a user requests a resource that is bigger than a certain
 * size, they can only re-request it a certain number of times before they
 * are temporarily blocked for any future access to the resource.
 */
const { DEBUG_MODE, MAX_CONTENT_LENGTH } = require("./constants.js");

class HeatMap {
  static init() {
    /** @type {Map<String, Map<String, Number> >} */
    HeatMap._heatedIPs = new Map();

    HeatMap._heaterInit = true;
  }

  static scheduledCleanup() {
    if (HeatMap._heaterInit) {
      HeatMap._heatedIPs.clear();
    }
  }

  static getIpKeyFromRequest(req) {
    const ipIdentifier = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const key = Buffer.from(ipIdentifier).toString("base64");

    return key;
  }

  static handleRequest(req, res, targetUrl) {
    if (!HeatMap._heaterInit) {
      res.status(500).send("Server Error: Heat mapper has not initialized!");
      return false;
    }

    const key = HeatMap.getIpKeyFromRequest(req);

    if (HeatMap._heatedIPs.has(key)) {
      const flaggedResources = HeatMap._heatedIPs.get(key);
      if (flaggedResources.has(targetUrl)) {
        const requestsLeft = flaggedResources.get(targetUrl);
        if (requestsLeft <= 0) {
          if (DEBUG_MODE) {
            console.log(`HEAT BLOCK: ${targetUrl}`);
          }

          return false;
        }
      }
    }

    return true;
  }

  static handleResponse(req, res, targetUrl, contentLength) {
    if (!HeatMap._heaterInit) {
      res.status(500).send("Server Error: Heat mapper has not initialized!");
      return false;
    }

    // As of right now, we only flag requests larger than 1 MB
    let isFlagged = false;
    let requestsLeft;
    if (contentLength > MAX_CONTENT_LENGTH / 20) {
      isFlagged = true;

      switch (true) {
        case contentLength > MAX_CONTENT_LENGTH / 2:
          requestsLeft = 0;
          break;
        case contentLength > MAX_CONTENT_LENGTH / 4:
          requestsLeft = 2;
          break;
        case contentLength > MAX_CONTENT_LENGTH / 5:
          requestsLeft = 3;
          break;
        default:
          requestsLeft = 10;
      }
    }

    if (isFlagged) {
      if (DEBUG_MODE) {
        console.log(`FLAG HEAT: ${targetUrl} - SIZE: ${contentLength}`);
      }

      const key = HeatMap.getIpKeyFromRequest(req);

      if (HeatMap._heatedIPs.has(key)) {
        const flaggedResources = HeatMap._heatedIPs.get(key);

        if (flaggedResources.has(targetUrl)) {
          flaggedResources.set(targetUrl, flaggedResources.get(targetUrl) - 1);
        } else {
          flaggedResources.set(targetUrl, requestsLeft);
        }
      } else {
        HeatMap._heatedIPs.set(key, new Map([[targetUrl, requestsLeft]]));
      }
    }
  }
}

module.exports = HeatMap;
