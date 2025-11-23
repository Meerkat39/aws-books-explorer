// backend/lambda/run_test.js
// Clean local runner for the lambda handler. Use this instead of the problematic test_invoke_local.js
try {
  require("dotenv").config();
} catch (e) {}

const { handler } = require("./index");

if (process.argv[2] && !process.env.GOOGLE_BOOKS_API_KEY) {
  process.env.GOOGLE_BOOKS_API_KEY = process.argv[2];
}

(async () => {
  try {
    const res = await handler({ queryStringParameters: { q: "harry potter" } });
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("invoke error:", err);
    process.exitCode = 1;
  }
})();
