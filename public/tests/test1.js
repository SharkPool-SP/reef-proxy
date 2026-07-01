const proxy = "http://localhost:3030";

async function test(type, output, urlParams, opt_urlHeaders) {
  const url = `${proxy}/${type}${urlParams ?? ""}`;
  const response = await fetch(url, opt_urlHeaders);

  if (!response.ok) {
    console.error({ type, urlParams, opt_urlHeaders });
    throw new Error("Test failed!");
  }

  const result = await response[output ?? "text"]();
  console.log("result:", result);
}

// NOTE: Special thanks to 'Newgrounds.com'
/**
 * Test 1: GET '/get'
 *
 * Simply retrieve another site's content. You can only use URL params here.
 * In this test we get scrape audio data from the Audio Portal.
 */
// GET test
test("get", "text", "?url=https://www.newgrounds.com/audio/listen/1559071");
test("get", "text", "?u=https://www.newgrounds.com/audio/listen/1559071");

// NOTE: Special thanks to 'terrific.tools/youtube/extract-title-description'
/**
 * Test 2: POST '/post'
 *
 * Retrieve another site's content. You have both the ability to use URL params
 * and pass fetch options like a Body & Headers.
 * In this test we get get a YouTube video's description.
 */
test(
  "post",
  "json",
  "?u=https://terrific.tools/api/youtube/get-video-details",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ videoId: "dQw4w9WgXcQ" }),
  },
);
test("post", "json", undefined, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-target-url": "https://terrific.tools/api/youtube/get-video-details",
  },
  body: JSON.stringify({ videoId: "dQw4w9WgXcQ" }),
});

// NOTE: Thanks to me (SharkPool-SP) 'sharkpools-extensions.vercel.app'.
/**
 * Test 3: SCRAPE '/scrape'
 *
 * Open a site as a user, wait a specified amount of seconds, and extract the HTML content.
 * You can only use URL params here. This feature is specifically for sites that dynamically load content.
 */
test("scrape", "text", "?wait=3&u=https://sharkpools-extensions.vercel.app/");
