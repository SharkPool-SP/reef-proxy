# Reef Proxy Documentation

**Reef Proxy** is a free CORS proxy that provides multiple methods for fetching and scraping web resources. This page documents all available endpoints and how to use them.

## Support Reef Proxy

Reef Proxy is a free service. Running and maintaining the proxy requires ongoing server costs. If you find it useful, please consider supporting us with a donation.

**[Donate with PayPal](https://www.paypal.com/donate/?business=AGLGGVQWUBUFE&no_recurring=0&item_name=Help+pay+for+my+College+Education&currency_code=CAD)**

**[Buy Me a Coffee](https://buymeacoffee.com/sharkpool)**

Alternatively, contact me on GitHub or Discord to discuss E-Transfers.

### 🛈 Rate Limits and Privacy

Reef Proxy temporarily stores your IP address solely for rate limiting. IP addresses are not permanently stored or shared.

Our proxy also implements usage caps to maintain our service per client:

- **Standard Requests**: 50 GET or POST requests per hour
- **Scrape Endpoint**: 10 scraping requests per hour
- **Payload Size Cap**: Requests larger than 30MB are automatically aborted

## Available Endpoints

- `/get` - Performs a GET request to the target URL.
- `/post` - Performs a POST request to the target URL.
- `/scrape` - Loads and returns the rendered HTML of a webpage.

### 🛈 Specifying the Target URL

Every request must include the target URL using one of the following methods:

**Query parameter:** `?url=https://example.com`

**Request header:** `"x-target-url": https://example.com`

### /get

Sends a standard HTTP GET request to the specified URL and returns the response. Additional query parameters are forwarded to the target URL.

### /post

Sends an HTTP POST request to the specified URL. Request headers and the request body are forwarded to the target whenever possible.

### /scrape

Opens the requested webpage in a browser and returns the rendered HTML after waiting for the page to load.

Use the optional wait query parameter to specify how many seconds to wait before the page is scraped.

`/scrape?url=https://example.com&wait=5`

The wait value must be between 0 and 10 seconds. If omitted, Reef Proxy uses the default wait time.
