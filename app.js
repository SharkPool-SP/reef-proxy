/* Module Imports */
const express = require("express");
const compression = require("compression");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");

require("dotenv").config();

/* Local Imports */
const {
  PROXY_OPTIONS,
  handleScrape,
  requestHandler,
} = require("./private/proxy-utils.js");
const RateLimiter = require("./private/rate-limiter.js");
const TargetCache = require("./private/cacher.js");

/* Setup */
const PORT = process.env.PORT || 3030;
const MAX_REQUESTS = process.env.MAX_REQUESTS || 50; // MAX_REQUESTS per REQUEST_TIMEOUT
const MAX_SCRAPES = process.env.MAX_SCRAPES || 10; // MAX_SCRAPES per REQUEST_TIMEOUT
const REQUEST_TIMEOUT = 60 * 60 * 1000; // expires after 1 hour
const CLEANUP_CYCLE = 15 * 60 * 1000; // 15 minutes
const PUBLIC_ROUTE = __dirname + "/public/";

// Caches
const proxyLimiter = new RateLimiter(MAX_REQUESTS, REQUEST_TIMEOUT);
const scrapeLimiter = new RateLimiter(MAX_SCRAPES, REQUEST_TIMEOUT);
TargetCache.init(REQUEST_TIMEOUT);

// Automate cleanup for cached data
setInterval(() => {
  proxyLimiter.scheduledCleanup();
  scrapeLimiter.scheduledCleanup();
  TargetCache.scheduledCleanup();
}, CLEANUP_CYCLE);

const proxyMiddleware = createProxyMiddleware(PROXY_OPTIONS);
const handleRequest = requestHandler.bind({
  proxyLimiter,
  scrapeLimiter,
  cache: TargetCache,
});

const app = express();

/* Route Setup */
app.use("/get", express.json());
app.use("/scrape", express.json());
app.use("/get", express.urlencoded({ extended: false }));
app.use("/scrape", express.urlencoded({ extended: false }));

app.use((req, _res, next) => {
  // Allow req.query to be writable as express ver 5.x disables writing to req.query
  Object.defineProperty(req, "query", {
    ...Object.getOwnPropertyDescriptor(req, "query"),
    value: req.query,
    writable: true,
  });
  next();
});

app.use(
  compression({
    level: 6,
    filter(req, res) {
      const type = res.getHeader("Content-Type");

      if (typeof type === "string") {
        const isCompressible = /text|json|javascript|xml|svg/i.test(type);
        if (isCompressible) {
          return compression.filter(req, res);
        }
      }

      return false;
    },
  }),
);

app.use(
  cors({
    origin: "*",
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-target-url",
      "x-wait-seconds",
      "x-transform",
    ],
  }),
);

/* API */
// GET request
app.get("/get", handleRequest, proxyMiddleware);
app.head("/get", handleRequest, proxyMiddleware);

// POST request
app.post("/post", handleRequest, proxyMiddleware);
app.head("/post", handleRequest, proxyMiddleware);

// SCRAPE request
app.get("/scrape", handleRequest, handleScrape);

/* Pages */
const routeDocs = (_, res) => res.sendFile(PUBLIC_ROUTE + "pages/docs.html");
app.get("/", routeDocs);
app.get("/help", routeDocs);

app.get("/wakeup-service", (req, res) => {
  res.status(200);
  res.send("");
});

app.use((req, res) => {
  res.status(404);
  res.send(
    `Invalid route! Documentation is availiable here: <a href="/help">'/help'</a>`,
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
