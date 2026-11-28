/**
 * Definitions for json transformation functions.
 */

function jsonGet(args, content) {
  try {
    const json = JSON.parse(content.toString());
    if (json == null || typeof json !== "object") {
      throw new Error("Content is not valid JSON");
    }

    const result = {};
    for (const key of args) {
      if (Array.isArray(key)) {
        let subJson = json;
        for (const subKey of key) {
          if (subKey in subJson) {
            subJson = subJson[subKey];
          } else {
            subJson = null;
            break;
          }
        }

        if (subJson !== null) {
          result[key.join(".")] = subJson;
        }
      } else if (key in json) {
        result[key] = json[key];
      }
    }

    return {
      type: "application/json",
      content: JSON.stringify(result),
    };
  } catch {
    return {
      type: "application/json",
      content: "{}",
    };
  }
}

module.exports = { jsonGet };
