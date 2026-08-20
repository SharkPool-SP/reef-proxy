/**
 * Transformations allow people to specify the content they want to return.
 * In turn, this helps lower outgoing bandwidth for this proxy.
 *
 * We currently only support applying transformations on text-like content.
 */

const TRANSFORMABLE_TYPES = new Set([
  "application/javascript",
  "application/x-javascript",
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/xhtml+xml",
  "application/rss+xml",
  "application/atom+xml",
  "application/manifest+json",
  "application/sql",
  "application/graphql",
  "image/svg+xml",
]);

/**
 * All supported transformations and their handlers.
 */
const TRANSFORMATIONS = {
  /* Returns a portion of text using a specified start and end point */
  substring: (args, content) => {
    const string = content.toString();
    const start = Math.max(0, args[0] ?? 0);
    const end = Math.min(string.length, args[1] ?? string.length);

    return {
      type: "text/plain",
      content: Buffer.from(string.substring(start, end)),
    };
  },
  /* Returns a portion of text using a specified start and end point */
  indexed_string: (args, content) => {
    const string = content.toString();
    const start = Math.max(0, string.indexOf(args[0])) + String(args[0]).length;
    let end = string.indexOf(args[1], start);
    if (end === -1) end = string.length;

    return {
      type: "text/plain",
      content: Buffer.from(string.substring(start, end)),
    };
  },
  /* These are for our "scrape" endpoint, working directly with Puppeteer. */
  /** Query select a matching element */
  query: async (args, content) => {
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
  },
  /** Query select all matching elements */
  query_all: async (args, content) => {
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
  },
};

const ALLOWED_TRANSFORMS = {
  proxy: ["substring", "indexed_string"],
  scrape: ["query", "query_all"],
};

/**
 * Checks if the content type of a response body is transformable.
 *
 * @private
 * @param {String} contentType Content type of body
 * @returns True if content can be transformed
 */
const _isContentTransformable = function (contentType) {
  const type = contentType.split(";")[0].toLowerCase();

  if (type.startsWith("text/")) return true;
  return TRANSFORMABLE_TYPES.has(type);
};

/**
 * Sample transformation request header format:
 * {
 *    type: "substring",
 *    args: [0, 100]
 * }
 */

/**
 * Decodes the transformation data in a request.
 *
 * @private
 * @param {Request} req Express request object
 * @returns Decoded transform data if exists, otherwise null
 */
const _decodeTransformData = function (req) {
  const rawTransforms = req.headers["x-transform"];
  if (!rawTransforms) return null;

  try {
    const transforms = JSON.parse(rawTransforms);
    if (typeof transforms === "object" && !Array.isArray(transforms)) {
      if (!transforms.type) {
        return null;
      }

      if (!transforms.args || !Array.isArray(transforms.args)) {
        return null;
      }

      return transforms;
    }
  } catch {}

  return null;
};

/**
 * Quick return back to caller if the transform request is missing/not allowed.
 *
 * @private
 * @param {proxy|scrape} type Type of request
 * @param {*} content Unaltered response body
 * @param {String} contentType Content type of body
 * @returns Object containing the original body and its type
 */
const _failSafeResponse = async function (type, content, contentType) {
  if (type === "scrape") {
    content = await content.content();
  }

  return { type: contentType, content };
};

/**
 * Applies a transformation on a response body. Helps us lower bandwidth.
 *
 * @param {proxy|scrape} type Type of request
 * @param {Request} req Express request object
 * @param {*} content Unaltered response body
 * @param {String} contentType Content type of body
 * @returns Object containing the transformed body and its type
 */
const applyTransformation = async function (type, req, content, contentType) {
  const data = _decodeTransformData(req);
  const isTransformable = _isContentTransformable(contentType);

  if (data && isTransformable) {
    const command = String(data.type).toLowerCase();

    if (ALLOWED_TRANSFORMS[type].includes(command)) {
      const transformed = await TRANSFORMATIONS[command](data.args, content);
      return {
        type: transformed.type ?? contentType,
        content: transformed.content,
      };
    }

    return {
      type: "application/json",
      content: `{ "error": "Illegal or non-existent transformation command for type: '${type}'. See docs." }`,
    };
  }

  return await _failSafeResponse(type, content, contentType);
};

module.exports = { applyTransformation };
