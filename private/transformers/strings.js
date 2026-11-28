/**
 * Definitions for string transformation functions.
 */

function substring(args, content) {
  const string = content.toString();
  const start = Math.max(0, args[0] ?? 0);
  const end = Math.min(string.length, args[1] ?? string.length);

  return {
    type: "text/plain",
    content: Buffer.from(string.substring(start, end)),
  };
}

function indexedString(args, content) {
  const string = content.toString();
  const start = Math.max(0, string.indexOf(args[0])) + String(args[0]).length;
  let end = string.indexOf(args[1], start);
  if (end === -1) end = string.length;

  return {
    type: "text/plain",
    content: Buffer.from(string.substring(start, end)),
  };
}

module.exports = { substring, indexedString };
