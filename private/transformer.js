/**
 * Transformations allow people to specify the content they want to return.
 * In turn, this helps lower outgoing bandwidth for this proxy.
 *
 * We currently only support applying transformations on text-like content.
 */

/**
 * @example
 * Sample transformation request header format:
 * {
 *    type: "substring",
 *    args: [0, 100]
 * }
 */

const { substring, indexedString } = require("./transformers/strings.js");
const { jsonGet } = require("./transformers/json.js");
const { query, queryAll } = require("./transformers/queries.js");

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
 * Enum for Transform types.
 * @readonly
 * @enum {String}
 */
const Transform = Object.freeze({
  SUBSTRING: "substring",
  INDEXED_STRING: "indexed_string",
  JSON: "json",
  QUERY: "query",
  QUERY_ALL: "query_all",
});

/**
 * Allowed transformations for each type of request.
 * @readonly
 * @enum {Array<String>}
 */
// prettier-ignore
const ALLOWED_TRANSFORMS = Object.freeze({
  proxy: [
    Transform.SUBSTRING,
    Transform.INDEXED_STRING,
    Transform.JSON,
  ],
  scrape: [
    Transform.QUERY,
    Transform.QUERY_ALL,
  ],
});

/**
 * All supported transformations and their handlers.
 *
 * @param {Array} args Arguments for the transformation
 * @param {*} content The content to transform
 */
const TRANSFORMATIONS = {
  /**
   * @returns {Object} A portion of text using a specified start and end point
   */
  [Transform.SUBSTRING]: substring,

  /**
   * @returns {Object} A portion of text using a specified start and end string
   */
  [Transform.INDEXED_STRING]: indexedString,

  /**
   * @returns {Object} An object containing requested key-value pairs.
   */
  [Transform.JSON]: jsonGet,

  /**
   * @returns {Object} A query-selected html element.
   */
  [Transform.QUERY]: query,

  /**
   * @returns {Object} An array of query-selected html elements.
   */
  [Transform.QUERY_ALL]: queryAll,
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
