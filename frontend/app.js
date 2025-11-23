const apiBase = ""; // 空にすると相対パス。デプロイ後は API のベース URL を入れてください
const form = document.getElementById("searchForm");
const qInput = document.getElementById("q");
const results = document.getElementById("results");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = qInput.value.trim();
  if (!q) return;
  results.innerHTML = "読み込み中...";
  try {
    const url = `${apiBase}/books?q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("APIエラー: " + res.status);
    const json = await res.json();
    render(json.items || []);
  } catch (err) {
    results.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
});

function render(items) {
  if (!items.length) {
    results.innerHTML = "<div>該当する結果がありません</div>";
    return;
  }
  results.innerHTML = items
    .map(
      (i) => `
    <article class="item">
      <h2>${escapeHtml(i.title || "無題")}</h2>
      <p class="meta">${escapeHtml((i.authors || []).join(", "))} ${
        i.publishedDate ? "・" + escapeHtml(i.publishedDate) : ""
      }</p>
    </article>
  `
    )
    .join("");
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>\"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
