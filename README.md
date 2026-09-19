# Reef Proxy Documentation

**Reef Proxy** is a free CORS proxy that provides multiple methods for fetching and scraping web resources. This page documents all available endpoints and how to use them.

## Support Reef Proxy

**Reef Proxy is a free service.** Running and maintaining the proxy **requires** ongoing server costs. If you find it useful, please consider supporting us with a donation.

**[All Donation Options](https://sharkpool-sp.github.io/donations/)**

**[Buy Me a Coffee](https://buymeacoffee.com/sharkpool)**

---

### 🛈 Rate Limits and Privacy

Reef Proxy temporarily stores your IP address solely for rate limiting. IP addresses are not permanently stored or shared.

Our proxy also implements usage caps to maintain our service per client:

- **Standard Requests**: 50 GET or POST requests per hour
- **Scrape Endpoint**: 10 scraping requests per hour
- **Payload Size Cap**: Requests larger than 25MB are automatically aborted

<details>
    <summary>Related API Errors</summary>

---

If you exceed the rate limit, Reef Proxy will respond with the HTTP status `429 Too Many Requests` with the error:
```json
{"error": "Rate Limit Exceeded. Please try again later."}
```

Requests will continue to be blocked until your rate limit window resets.

If your request exceeds the max response payload size, Reef Proxy will respond with the HTTP status `413 Content Too Large` with the error:
```json
{"error": "Target resource exceeds 25MB limit. ..."}
```

If you repeatedly request a heavy resource (e.g., files larger than a few megabytes), the resource will be flagged. Reaching the threshold will cause Reef Proxy to temporarily block further requests for that specific resource from your IP address.

Subsequent requests will return HTTP status `429 Too Many Requests` with the error:

```json
{"error": "Too many requests to this resource from your IP address. Please wait a while before trying again. Consider using our 'Transformation' API (refer to docs) to reduce the size of the resource."}
```
</details>

---

Please follow best practices when using our proxy. Cache responses when possible, check response headers before downloading resources, and avoid requesting unnecessarily large files. This helps reduce bandwidth and keeps the proxy available for everyone. :)

## Available Endpoints

- `/get` - Performs a GET request to the target URL.
- `/post` - Performs a POST request to the target URL.
- `/scrape` - Loads and returns the rendered HTML of a webpage.

### 🛈 Specifying the Target URL

Every request must include the target URL using one of the following methods:

**Query parameter:** `?url=https://example.com`

**Request header:** `"x-target-url": https://example.com`

<details>
    <summary>Related API Errors</summary>

---

If no target URL is provided, Reef Proxy responds with HTTP status `400 Bad Request` and the error message:

```json
{"error": "Missing proxy target destination/resource. ..."}
```

If the target URL provided is blocked on Reef Proxy (typically for being known to be large or NSFW), the response will be HTTP status `403 Forbidden` and the error message:

```json
{"error": "Target resource is blocked by Reef Proxy"}
```

</details>

---

### /get

Sends a standard HTTP GET request to the specified URL and returns the response. Additional query parameters are forwarded to the target URL.

### /post

Sends an HTTP POST request to the specified URL. Request headers and the request body are forwarded to the target whenever possible.

### /scrape

Opens the requested webpage in a browser and returns the rendered HTML after waiting for the page to load.

Use the optional wait query parameter to specify how many seconds to wait before the page is scraped.

`/scrape?url=https://example.com&wait=5`

The wait value must be between 0 and 10 seconds. If omitted, Reef Proxy uses the default wait time.

---

### HEAD Support

You can use the `HEAD` method with our `/get` or `/post` routes to retrieve response headers without downloading the response body. This includes `Content-Length`.

---

### Transformation API

**You** can help lower bandwidth usage (and keep our service up) by using our **Transformation API**!
If you are fetching a **text-like resource** (such as text, HTML, JavaScript, CSS, etc.), you can use
the Transformation API to return only the portion of the response you need.

Read more **[here](./Transformations-API.md)**.
