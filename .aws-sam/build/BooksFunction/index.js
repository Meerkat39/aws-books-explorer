// backend/lambda/index.js
// Node 18+ を想定した Lambda ハンドラ。Secrets Manager から Google API キーを取得して使用する。
const AWS = require("aws-sdk");

let _cachedApiKey = null;
async function getApiKeyFromSecret(secretName) {
  if (!secretName) return null;
  if (_cachedApiKey) return _cachedApiKey;
  const client = new AWS.SecretsManager({
    region:
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      "ap-northeast-1",
  });
  const data = await client.getSecretValue({ SecretId: secretName }).promise();
  const secretString = data.SecretString;
  let parsed;
  try {
    parsed = JSON.parse(secretString);
  } catch (e) {
    parsed = { GOOGLE_BOOKS_API_KEY: secretString };
  }
  _cachedApiKey =
    parsed.GOOGLE_BOOKS_API_KEY || parsed.apiKey || parsed.API_KEY || null;
  if (_cachedApiKey) {
    const masked =
      _cachedApiKey.length > 8
        ? _cachedApiKey.slice(0, 4) + "..." + _cachedApiKey.slice(-4)
        : "****";
    console.info(`Retrieved secret for ${secretName}, key mask=${masked}`);
  } else {
    console.info(`Secret ${secretName} found but no recognizable key field`);
  }
  return _cachedApiKey;
}

exports.handler = async (event) => {
  const q =
    (event && event.queryStringParameters && event.queryStringParameters.q) ||
    "node";

  // 優先順位: 環境変数 GOOGLE_BOOKS_API_KEY -> Secrets Manager (GOOGLE_BOOKS_SECRET_NAME)
  let key = process.env.GOOGLE_BOOKS_API_KEY || null;
  if (!key && process.env.GOOGLE_BOOKS_SECRET_NAME) {
    try {
      key = await getApiKeyFromSecret(process.env.GOOGLE_BOOKS_SECRET_NAME);
    } catch (e) {
      console.error("Failed to read secret:", e);
    }
  }
  // Log source of key (masked) for debugging (do NOT log full key)
  const mask = (s) => {
    if (!s) return null;
    return s.length > 8 ? s.slice(0, 4) + "..." + s.slice(-4) : "****";
  };
  if (key) {
    const src = process.env.GOOGLE_BOOKS_API_KEY ? "env" : "secretsmanager";
    console.info(
      `Google Books API key present (source=${src}, mask=${mask(key)})`
    );
  } else {
    console.info(
      "No Google Books API key found; requests will be unauthenticated"
    );
  }

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
    q
  )}${key ? `&key=${encodeURIComponent(key)}` : ""}`;
  try {
    // fetch with simple retry to handle transient network errors
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    async function fetchWithRetry(input, init, retries = 3, backoff = 300) {
      let lastErr;
      for (let i = 0; i < retries; i++) {
        try {
          return await fetch(input, init);
        } catch (e) {
          lastErr = e;
          console.warn(`fetch attempt ${i + 1} failed: ${e.message}`);
          if (i < retries - 1) await wait(backoff * (i + 1));
        }
      }
      throw lastErr;
    }

    const res = await fetchWithRetry(url, undefined, 3, 300);
    if (!res.ok) {
      const text = await res.text();
      console.error("Google Books API responded with non-OK status", {
        status: res.status,
        statusText: res.statusText,
        bodySnippet: text ? text.slice(0, 1000) : null,
      });
      return {
        statusCode: res.status,
        body: JSON.stringify({ message: "Google Books API error" }),
      };
    }
    const json = await res.json();
    const items = (json.items || []).slice(0, 10).map((i) => ({
      id: i.id,
      title: (i.volumeInfo && i.volumeInfo.title) || null,
      authors: (i.volumeInfo && i.volumeInfo.authors) || [],
      publishedDate: (i.volumeInfo && i.volumeInfo.publishedDate) || null,
    }));
    return { statusCode: 200, body: JSON.stringify({ items }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};
