/* Module Imports */
const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");

require("dotenv").config();

/* Local Imports */
const {
  PROXY_OPTIONS,
  getTargetUrl,
  validateTargetUrl,
  isValidObject,
} = require("./private/proxy-utils.js");
const RateLimiter = require("./private/rate-limiter.js");

const PORT = process.env.PORT || 3030;
const MAX_REQUESTS = process.env.MAX_REQUESTS || 50; // MAX_REQUESTS per REQUEST_TIMEOUT
const REQUEST_TIMEOUT = 60 * 60 * 1000; // expires after 1 hour
const PUBLIC_ROUTE = __dirname + "/public/";

const limiter = new RateLimiter(MAX_REQUESTS, REQUEST_TIMEOUT);
const app = express();

/* Setup */
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
  cors({
    origin: "*",
    allowedHeaders: ["Content-Type", "Authorization", "x-target-url"],
  }),
);

/* API */
// GET request
app.get(
  "/get",
  limiter.handleRequest,
  validateTargetUrl,
  createProxyMiddleware(PROXY_OPTIONS),
);

// POST request
app.post(
  "/post",
  limiter.handleRequest,
  validateTargetUrl,
  (req, res, next) => {
    if (isValidObject(req.body)) createProxyMiddleware(PROXY_OPTIONS);
    else {
      res.status(400).json({
        error: "Request body must be an object containing request options!",
      });
    }
  },
);

// SCRAPE request
app.get(
  "/scrape",
  limiter.handleRequest,
  validateTargetUrl,
  async (req, res) => {
    const targetUrl = getTargetUrl(req);
    const waitTime = parseInt(
      req.headers["x-wait-seconds"] || req.query.wait || "0",
      10,
    );
    const scrapeDelay = 1000 * Math.max(0, Math.min(10, waitTime));

    let browser;
    try {
      browser = await puppeteer.launch({
        executablePath: puppeteer.executablePath(),
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
        ],
      });

      const page = await browser.newPage();
      await page.goto(targetUrl.href, { waitUntil: "networkidle2" });
      await new Promise((resolve) => setTimeout(resolve, scrapeDelay));

      const htmlContent = await page.evaluate(
        () => document.documentElement.innerHTML,
      );

      await browser.close();
      res.setHeader("Content-Type", "text/html");
      res.send(htmlContent);
    } catch (e) {
      if (browser) await browser.close();
      res.status(500).json({ error: e.message || e });
    }
  },
);

/* Pages */
app.get("/", (req, res) => {
  res.sendFile(PUBLIC_ROUTE + "pages/docs.html");
});

app.get("/help", (req, res) => {
  res.sendFile(PUBLIC_ROUTE + "pages/docs.html");
});

app.use((req, res) => {
  res.status(404);
  res.send(
    `Invalid route! Documentation is availiable here: <a href="/help">'/help'</a>`,
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
