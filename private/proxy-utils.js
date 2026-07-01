const PROXY_OPTIONS = {
  router: (req) => getTargetUrl(req).origin,
  pathRewrite: (path, req) => {
    const urlObj = getTargetUrl(req);

    return urlObj.pathname + urlObj.search;
  },
  changeOrigin: true,
  logLevel: "debug",
  on: {
    proxyReq: (proxyReq, req, res) => {
      proxyReq.removeHeader("x-target-url");

      if (req.body && Object.keys(req.body).length > 0) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader("Content-Type", "application/json");
        proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
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
    return;
  }

  next();
};

/**
 * Checks if an inputted value is an object.
 *
 * @param {*} value Value to be checked
 * @returns True if the passed argument is an object
 */
const isValidObject = function (value) {
  return value && typeof value == "object" && !Array.isArray(value);
};

module.exports = {
  PROXY_OPTIONS,
  getTargetUrl,
  validateTargetUrl,
  isValidObject,
};
