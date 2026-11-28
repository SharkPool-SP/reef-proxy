/**
 * Definitions for html transformation functions.
 */

async function query(args, content) {
  try {
    const element = await content.$eval(
      String(args[0]),
      (element) => element.outerHTML,
    );

    return {
      type: "text/html",
      content: element,
    };
  } catch {
    return {
      type: "text/html",
      content: "",
    };
  }
}

async function queryAll(args, content) {
  try {
    const elements = await content.$$eval(String(args[0]), (elements) =>
      elements.map((e) => e.outerHTML),
    );

    return {
      type: "application/json",
      content: JSON.stringify(elements),
    };
  } catch {
    return {
      type: "application/json",
      content: "[]",
    };
  }
}

module.exports = { query, queryAll };
