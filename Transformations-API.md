# Transformation API

You can use the Transformation API to return only the portion of the response you need for text-like resources.

Transformations are specified using the `x-transform` request header. The header contains a JSON object with a transformation `type` and an array of `args`.

**Example:**

```http
x-transform: {
  "type": "substring",
  "args": [0, 100]
}
```

> **Note:** Transformations are only applied to text-like resources. If the transformation is invalid, unsupported for the endpoint, or not transformable, the API will return the original response (except for an explicitly invalid transformation command).

## Proxy transformations

The `/get` & `/post` endpoints currently supports the following transformations:

| Transformation   | Arguments      | Description                                                                |
| ---------------- | -------------- | -------------------------------------------------------------------------- |
| `substring`      | `[start, end]` | Returns a portion of the response between the specified character indexes. |
| `indexed_string` | `[start, end]` | Finds two strings and returns the content between their indexes.           |

### `substring`

Returns a portion of the response using character indexes.

```http
x-transform: {
  "type": "substring",
  "args":[x, y]
}
```

For example, if the response contains:

```text
Hello, this is a very long response...
```

Using `args: [0, 5]` returns:

```text
Hello
```

Both indexes are optional. The default `start` is `0`, while the default `end` is the length of the response.

### `indexed_string`

Returns the content beginning at the first occurrence of the first argument and ending at the first occurrence of the second argument.

```http
x-transform: {
  "type": "indexed_string",
  "args":[<body>, </body>]
}
```

This is useful when you know the markers surrounding the content you want but do not know their exact character positions.

If the starting string cannot be found, the starting position falls back to the beginning of the response.

If the ending string cannot be found, the transformation returns everything from the starting point to the end of the response.

For example, if the response contains:

```text
Hello, this is a very long response...
```

Using `args: ["Hello,", "long"]` returns:

```text
this is a very
```

## Scrape transformations

The `/scrape` endpoint supports DOM-based transformations. This allows you to select elements from the rendered page.

| Transformation | Arguments    | Description                                                   |
| -------------- | ------------ | ------------------------------------------------------------- |
| `query`        | `[selector]` | Returns the first element matching a CSS selector.            |
| `query_all`    | `[selector]` | Returns all elements matching a CSS selector as a JSON array. |

### `query`

Returns the `outerHTML` of the first element matching the supplied CSS selector.

```http
x-transform: {
  "type": "query",
  "args": [".my-class"]
}
```

If no matching element is found, an empty response is returned.

The resulting content type is:

```http
Content-Type: text/html
```

### `query_all`

Returns the `outerHTML` of every element matching the supplied CSS selector.

```http
x-transform: {
  "type": "query_all",
  "args": [".my-class"]
}
```

If no elements match the selector, an empty JSON array is returned.

The resulting content type is:

```http
Content-Type: application/json
```

## Request format

The complete `x-transform` header follows this format:

```json
{
  "type": "transformation_name",
  "args": []
}
```

`type` specifies the transformation command to execute, while `args` contains the arguments required by that transformation.

## Why use transformations?

Transformations are particularly useful when you only need a small portion of a large response. Instead of downloading an entire HTML document or text resource and processing it yourself, you can ask the proxy to perform the extraction and return only the required content.

This can significantly reduce **outgoing bandwidth**, especially when working with large HTML or text responses.

Please use this as it helps keep our free service up and running! Unfortunately, we only have a limited amount of bandwidth.
