// backend/lambda/index.js
// Node 18+ を想定した最小の Lambda ハンドラ（fetch を使用）
exports.handler = async (event) => {
  const q =
    (event && event.queryStringParameters && event.queryStringParameters.q) ||
    "node";
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
    q
  )}${key ? `&key=${encodeURIComponent(key)}` : ""}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
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
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  }
};
