# サーバーレス SPA と Lambda で Google Books API を叩く学習メモ

## 📅 学習日時

2025 年 11 月 24 日

## ✅ 結論

- S3 にホスティングした静的 SPA（フロント）から HTTP API (API Gateway) 経由で Lambda を呼び、Lambda が Google Books API を叩いて結果を返す一連のフローをコンソール操作のみで構築・確認できた。
- 重要なポイント：CORS 設定、Lambda の環境変数か Secrets Manager の運用方針、及び公開 API の濫用対策（API Key / Usage Plan）が鍵。

## 🧠 詳細（このアプリの一連の流れ）

1.  ユーザーがブラウザで静的 SPA を開き、検索語を入力して「検索」ボタンを押す。
2.  SPA（`frontend/app.js`）は `apiBase` に設定された HTTP API のベース URL に対して `/books?q=...` の GET リクエストを送る。
3.  API Gateway (HTTP API) はリクエストを受け、統合先として設定した Lambda を同期で呼び出す。
4.  Lambda（Node.js 18、ファイル `backend/lambda/index.js`）は次を行う：
    - 環境変数 `GOOGLE_BOOKS_API_KEY` を優先して読み取る。未設定なら `GOOGLE_BOOKS_SECRET_NAME` を使って Secrets Manager から取り出すロジックがある（今回は環境変数で運用）。
    - Google Books API を呼ぶ（キーがあればクエリに付与）。
    - `fetchWithRetry` を使い一時的なネットワークエラーに対してリトライする（現在デフォルト: retries=5, backoff=1000ms）。
    - レスポンスを整形し、CORS ヘッダ付きで JSON を返す。

## 🔧 実施したコンソール／ローカル操作（主要コマンド）

- Lambda 確認・環境変数設定（コンソール）
  - `GOOGLE_BOOKS_API_KEY` を Lambda の環境変数として設定
- API のテスト（ローカル端末）

```bash
# CORS プリフライト
curl -i -X OPTIONS 'https://7jhpn9k8cd.execute-api.ap-northeast-1.amazonaws.com/' \
  -H 'Origin: http://aws-books-explorer-frontend-20251123.s3-website-ap-northeast-1.amazonaws.com' \
  -H 'Access-Control-Request-Method: GET'

# 実際の GET リクエスト
curl -i 'https://7jhpn9k8cd.execute-api.ap-northeast-1.amazonaws.com/books?q=node'
```

期待値：OPTIONS は 204/200 と `Access-Control-Allow-Origin`、GET は 200 と JSON `{ items: [...] }` が返る。

- フロント反映（S3 へアップロード）

```bash
git add frontend/app.js
git commit -m "Point frontend to deployed API endpoint"
aws s3 cp frontend/ s3://your-frontend-bucket/ --recursive
# CloudFront 使用時
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"
```

## 🐞 トラブルと対処（学び）

1.  ESM / CommonJS の不整合

    - 症状: Lambda のログで `require is not defined` のような ImportModuleError
    - 原因: ハンドラや package.json の `type` によるモジュール解釈の違い
    - 対処: ハンドラは CommonJS 形式で保ち、デプロイ時の設定（handler の参照）を確認

2.  `aws-sdk` が見つからない

    - 症状: デプロイ時に Lambda が `Cannot find module 'aws-sdk'` を出す
    - 対処: 関数のバンドルに `aws-sdk` を含める（今回ローカルで `npm install aws-sdk` を実行しテスト）。注意: Lambda 実行環境には v2 の aws-sdk が既にあるが、デプロイ方法により明示的に含める必要がある場合がある。

3.  Google API の 400 (API key not valid)

    - 症状: Google Books API が 400 を返す
    - 対処: Secrets 値（または環境変数）に正しい API キーが入っているか確認。

4.  一時的なソケット/TLS エラー

    - 対処: `fetchWithRetry` の導入で短期的な安定化（リトライとバックオフ）を実装

5.  フロントが古い `app.js` を読み込んで 404

    - 症状: ブラウザでのリクエストが S3 の静的サイト URL を叩いていて 404
    - 対処: ブラウザをハードリフレッシュ（Ctrl+F5）、または S3 に最新版をアップロード、CloudFront を使っている場合はインバリデーション

6.  ログにシークレットやマスクを出力していた
    - 対処: デバッグ用に追加していたマスク表示やキー出所を出す console.log/console.info を削除（`backend/lambda/index.js` を修正）してログに機密が出ないようにした

## 🔒 セキュリティ・運用上の注意（短く）

- 秘密の保管: 長期運用なら `Secrets Manager` を使い、Lambda 実行ロールに対して `secretsmanager:GetSecretValue` を特定 Secret の ARN に限定した最小権限ポリシーを割り当てる。
- ログ: 絶対にキーやマスク表示を CloudWatch に残さない。今回、マスク出力部分は削除済み。
- 鍵のローテーション: Secrets Manager を使えばローテーションが容易。運用手順を作る。
- 公開 API の濫用対策: API Gateway の `API Key + Usage Plan` か、Cognito / Lambda Authorizer を検討する。

## 次回の課題（優先順）

1.  Secrets Manager への移行（IAM ポリシーの最小化とローテーション設計）
2.  API の保護（API Key + Usage Plan の導入、もしくは Cognito）
3.  CloudWatch のアラーム設定（5xx、タイムアウトなど）
4.  IaC（`template.yaml` を整備して再現性あるデプロイ）と CI/CD（GitHub Actions）

## 補足（参考コマンドまとめ）

- API テスト（プリフライト）

```bash
curl -i -X OPTIONS 'https://<api-id>.execute-api.<region>.amazonaws.com/' \
  -H 'Origin: http://your-frontend-origin' \
  -H 'Access-Control-Request-Method: GET'
```

- 本文取得テスト

```bash
curl -i 'https://<api-id>.execute-api.<region>.amazonaws.com/books?q=node'
```

- S3 へ静的ファイルをアップロード

```bash
aws s3 cp frontend/ s3://your-frontend-bucket/ --recursive
```

## 最後に（メモ保存場所とルール）

- このメモは `docs/learning_notes/` に保存しました。ルールは `docs/rules/learning-notes-guide.md` に従っています。
- 必要ならこのメモを英語化したり、各トラブルの具体的なログ抜粋・再現手順を追加できます。

---

作成者: 学習セッション記録（自動生成補助）
