// backend/lambda/index.js
// Node 18+ を想定した Lambda ハンドラ。
// - Google Books API を呼び出して簡易整形した結果を返す。
// - 環境変数 `GOOGLE_BOOKS_API_KEY` を優先して使い、未設定時は
//   `GOOGLE_BOOKS_SECRET_NAME` で指定された Secrets Manager の Secret を参照する。
// - Secrets はコンテナ単位でキャッシュされるので、更新時は関数の再起動が必要。
const AWS = require("aws-sdk");

let _cachedApiKey = null;

/**
 * Secrets Manager から API キーを取得してキャッシュする補助関数
 * - secretName: Secrets Manager の SecretId（例: "aws-books-explorer/GoogleBooks"）
 * - 返却値は文字列（API キー）または null
 * - SecretString が JSON の場合は { GOOGLE_BOOKS_API_KEY: "..." } の形を想定
 * - 取得後は `_cachedApiKey` に保存して同じコンテナ内では再利用する
 */
async function getApiKeyFromSecret(secretName) {
  if (!secretName) return null; // 引数未指定なら即座に null
  if (_cachedApiKey) return _cachedApiKey; // キャッシュがあれば再利用

  // AWS SDK の SecretsManager クライアントを作成（環境変数でリージョン指定可能）
  const client = new AWS.SecretsManager({
    region:
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      "ap-northeast-1",
  });

  // Secret を取得（例外は呼び出し元で受ける）
  const data = await client.getSecretValue({ SecretId: secretName }).promise();
  const secretString = data.SecretString;
  let parsed;
  try {
    // Secret が JSON 文字列で格納されている可能性を考慮
    parsed = JSON.parse(secretString);
  } catch (e) {
    // JSON でなければ plain text（API キーのみ）として扱う
    parsed = { GOOGLE_BOOKS_API_KEY: secretString };
  }

  // いくつかのフィールド名に対応して API キーを抽出
  _cachedApiKey =
    parsed.GOOGLE_BOOKS_API_KEY || parsed.apiKey || parsed.API_KEY || null;

  // デバッグ用にマスクしてログ出力（本番では注意）
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
  // リクエストから検索クエリ q を取り出す。未指定時は 'node' をデフォルトにする。
  const q =
    (event && event.queryStringParameters && event.queryStringParameters.q) ||
    "node";

  // API キーの決定ロジック:
  // 1) 環境変数 GOOGLE_BOOKS_API_KEY があればそれを使う
  // 2) なければ Secrets Manager の指定名前で取得する
  let key = process.env.GOOGLE_BOOKS_API_KEY || null;
  if (!key && process.env.GOOGLE_BOOKS_SECRET_NAME) {
    try {
      key = await getApiKeyFromSecret(process.env.GOOGLE_BOOKS_SECRET_NAME);
    } catch (e) {
      // 秘密取得に失敗しても処理は継続（匿名アクセスで API を呼ぶ）
      console.error("Failed to read secret:", e);
    }
  }

  // デバッグ用にキーの出所とマスク表示（本番でのフル出力は厳禁）
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

  // Google Books API の URL を組み立て（キーがあればクエリに付与）
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
    q
  )}${key ? `&key=${encodeURIComponent(key)}` : ""}`;

  try {
    // 一時的なネットワークエラーを吸収するための簡易リトライ実装
    // - retries 回まで試行、失敗時はバックオフで待機して再試行する
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    async function fetchWithRetry(input, init, retries = 3, backoff = 300) {
      let lastErr;
      for (let i = 0; i < retries; i++) {
        try {
          return await fetch(input, init);
        } catch (e) {
          lastErr = e;
          // ログは簡潔にして、原因解析に必要な情報のみ出す
          console.warn(`fetch attempt ${i + 1} failed: ${e.message}`);
          if (i < retries - 1) await wait(backoff * (i + 1));
        }
      }
      throw lastErr;
    }

    const res = await fetchWithRetry(url, undefined, 3, 300);

    // Google API がエラーを返したら本文の一部をログに出す（デバッグのため）
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

    // 正常時は JSON をパースして、フロントで使いやすい最小フィールドに整形して返す
    const json = await res.json();
    const items = (json.items || []).slice(0, 10).map((i) => ({
      id: i.id,
      title: (i.volumeInfo && i.volumeInfo.title) || null,
      authors: (i.volumeInfo && i.volumeInfo.authors) || [],
      publishedDate: (i.volumeInfo && i.volumeInfo.publishedDate) || null,
    }));
    return { statusCode: 200, body: JSON.stringify({ items }) };
  } catch (err) {
    // 例外時は 500 を返しつつログにエラーを出す
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};
