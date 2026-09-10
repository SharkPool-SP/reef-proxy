module.exports = {
  PORT: process.env.PORT || 3030,
  MAX_REQUESTS: process.env.MAX_REQUESTS || 50, // MAX_REQUESTS per REQUEST_TIMEOUT
  MAX_SCRAPES: process.env.MAX_SCRAPES || 10, // MAX_SCRAPES per REQUEST_TIMEOUT
  MAX_CONTENT_LENGTH: process.env.MAX_CONTENT_LENGTH || 20 * 1024 * 1024, // We wont accept resources above MAX_CONTENT_LENGTH (20MB)
  DEBUG_MODE: process.env.DEBUG === "true" || process.env.DEBUG === "1",

  REQUEST_TIMEOUT: 60 * 60 * 1000, // expires after 1 hour
  CACHE_EXPIRES_SECS: 60 * 60, // expires after 1 hour
  CLEANUP_CYCLE: 15 * 60 * 1000, // 15 minutes
  HEAD_CHECK_TIMEOUT: 5000, // 5 seconds max to fetch a resource's HEAD
};
