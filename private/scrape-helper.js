/* Module Imports */
const puppeteer = require("puppeteer");

/* Setup */
const BROWSER_OPTIONS = {
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
};

const PAGE_OPTIONS = {
  waitUntil: "networkidle2",
};

let browserInstance = null;

/**
 * Closes the Puppeteer browser instance if it exists.
 */
const closeBrowser = async function () {
  if (browserInstance) {
    await browserInstance.close();
  }
};

/**
 * Opens a new Puppeteer page and navigates to the specified URL.
 *
 * @param {String} url URL of page to open
 * @returns The Puppeteer page instance
 */
const newPage = async function (url) {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch(BROWSER_OPTIONS);
  }

  const page = await browserInstance.newPage();
  await page.goto(url, PAGE_OPTIONS);

  return page;
};

module.exports = {
  closeBrowser,
  newScrapePage: newPage,
};
