const PROXY_OPTIONS = {
  router: req => getTargetUrl(req).origin,
  pathRewrite: (_, req) => {
    const url = getTargetUrl(req);
    return url.pathname + url.search;
  },
  changeOrigin: true,
  logLevel: "debug",
  on: {
    proxyReq(proxyReq, req) {
      proxyReq.removeHeader("x-target-url");
    }
  }
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

module.exports = {
  PROXY_OPTIONS,
  getTargetUrl,
  validateTargetUrl,
};
