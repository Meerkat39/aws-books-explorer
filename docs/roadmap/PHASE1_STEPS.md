# フェーズ 1 — バックエンド基本実装: ステップバイステップ

目的: Lambda で Google Books API を呼ぶ最小構成を作り、ローカルで動作確認する。

前提:

- AWS CLI（任意）/ Git が使えること
- Node.js 18+ または Python 3.8+ がローカルに入っていること

各ステップは手で確実に実行できる小単位に分けています。

---

## ステップ 0 — 作業ディレクトリ準備

1. プロジェクトルートでバックエンド用ディレクトリを作成

```bash
mkdir -p backend/lambda
cd backend/lambda
```

2. 作業ブランチ（任意）

```bash
git checkout -b feat/backend-sample
```

---

## ステップ 1 — Node.js ラムダ（最小実装）

1. `index.js` を作成（Node 18+ の `fetch` を利用）

```javascript
// backend/lambda/index.js
exports.handler = async (event) => {
  const q =
    (event.queryStringParameters && event.queryStringParameters.q) || "node";
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}`
  );
  const json = await res.json();
  const items = (json.items || [])
    .slice(0, 10)
    .map((i) => ({ id: i.id, title: i.volumeInfo.title }));
  return { statusCode: 200, body: JSON.stringify({ items }) };
};
```

2. ローカルで簡易実行確認（Node があれば）

```bash
node -e "(async()=>{const h=require('./index.js').handler;const r=await h({ queryStringParameters:{ q:'harry potter' } });console.log(r);})()"
```

期待出力（例）: JSON を含むオブジェクトが表示される。`statusCode:200` と `body` を確認。

---

## ステップ 2 — Python ラムダ（代替）

1. `handler.py` を作成（標準ライブラリのみで行う簡易版）

```python
# backend/lambda/handler.py
import json
import urllib.request
import urllib.parse

def handler(event, context=None):
    q = (event.get('queryStringParameters') or {}).get('q', 'python')
    url = 'https://www.googleapis.com/books/v1/volumes?q=' + urllib.parse.quote(q)
    with urllib.request.urlopen(url) as r:
        data = json.load(r)
    items = [{'id': i.get('id'), 'title': i.get('volumeInfo', {}).get('title')} for i in (data.get('items') or [])][:10]
    return { 'statusCode': 200, 'body': json.dumps({'items': items}) }

if __name__ == '__main__':
    print(handler({'queryStringParameters': {'q': 'harry potter'}}))
```

2. ローカル実行

```bash
python backend/lambda/handler.py
```

---

## ステップ 3 — ローカルから API 呼び出しの流れを確認

- Lambda を直接呼ぶ簡易テストスクリプトを作成する（Node / Python ともに上の `handler` を import / run する小スクリプト）。
- 期待: `statusCode:200` と `body` が得られる。

例（Node の簡易テストファイル `test_invoke.js`）

```javascript
// backend/lambda/test_invoke.js
const { handler } = require("./index");
(async () => {
  const res = await handler({ queryStringParameters: { q: "aws sam" } });
  console.log(res);
})();
```

実行:

```bash
node backend/lambda/test_invoke.js
```

---

## ステップ 4 — API Gateway に繋ぐ（簡易案）

- 手動で AWS コンソールを使うか、`SAM` / `Serverless Framework` / `CDK` を使って API を作成します。
- まずはローカルで動くことを確認し、次に `sam init` や `serverless create` でテンプレート化するのが学習効率が良い。

短い例（SAM を使う場合の流れ）

```bash
# 1. プロジェクトルートで SAM テンプレートを用意
# 2. sam build
# 3. sam deploy --guided
```

（詳細は次のフェーズでテンプレ化します）

---

## ステップ 5 — 最低限のセキュリティ注意点

- Google API キーを使う場合はコードに直書きしない（環境変数や Secrets Manager を利用）。
- Lambda 実行ロールは最小権限にする（最初は実験用の広い権限でも良いが、学習の最後に見直す）。

---

## ステップ 6 — 学習メモ作成（振り返り）

- 実行後、`docs/learning_notes/` に学習メモを残してください。ファイル名はルールに従い、例:`2025-11-22_phase1_lambda.md`。
- メモには以下を含めると良い:
  - 学習日時
  - 結論（動いた/つまづいた点）
  - 実行コマンドと期待出力

---

完了したら次は「API Gateway に接続して動作確認」か「SAM テンプレート化」を選んでください。選択に応じて、私がサンプルテンプレートやデプロイ手順を作成します。
