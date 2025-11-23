**目的**

- `template.yaml`（SAM テンプレート）を行ごとに解説し、各フィールドがどのような CloudFormation / 実リソースに対応するかを明確にする学習メモ。
- 日付: 2025-11-23

**ファイル全体の役割（概観）**

- `template.yaml` は SAM (Serverless Application Model) 形式の IaC です。SAM はこのテンプレートを CloudFormation へ変換して AWS リソースを作成します。

---

1. ヘッダ部分

- `AWSTemplateFormatVersion: "2010-09-09"`
  - CloudFormation テンプレートのフォーマットバージョン。通常は変更不要。
- `Transform: AWS::Serverless-2016-10-31`
  - SAM の変換を有効にするための宣言。SAM の `Resources: AWS::Serverless::Function` 等を CloudFormation に変換するトランスフォームを指定する。
- `Description: aws-books-explorer - SAM template for Lambda + API Gateway`
  - テンプレートの説明（任意）。CloudFormation コンソールや出力で確認しやすくするために書く。

2. Globals セクション

- `Globals: Function: Timeout: 10`
  - このテンプレート内のすべての SAM `Function` リソースにデフォルトで適用されるプロパティ。ここではタイムアウトを 10 秒に設定している（個別の Function に上書き可能）。

3. Resources セクション（重要）

- `BooksFunction:`

  - Type: `AWS::Serverless::Function` — SAM 固有のリソースタイプ。SAM がこれを CloudFormation の `AWS::Lambda::Function` 等へ変換する。

  Properties（各プロパティの意味）

  - `FunctionName: books-function`
    - Lambda の実際の関数名。CloudFormation でこの名前を使って作成される（固有にするか注意）。
  - `CodeUri: backend/lambda`
    - デプロイするコードの場所。`sam build` がこのフォルダをパッケージし、S3 にアップロードして Lambda に展開する。
  - `Handler: index.handler`
    - Lambda のエントリポイント。`index.js` の `exports.handler` を呼ぶ。
  - `Runtime: nodejs18.x`
    - 実行環境。Node.js 18 ランタイムを使用することを示す。
  - `MemorySize: 128`
    - Lambda に割り当てるメモリ。値を増やすと CPU も増えるがコストが上がる。
  - `Policies:`
    - `- AWSLambdaBasicExecutionRole` は組み込みポリシーで、Lambda が CloudWatch Logs に書き込める等の基本権限を付与する。
    - 必要に応じて `iam:PassRole` や `secretsmanager:GetSecretValue` 等を追加する（後述）。
  - `Environment: Variables: GOOGLE_BOOKS_API_KEY: ""`
    - 環境変数を定義。空文字列になっているため、デプロイ時に値を渡すか、Secrets Manager 参照に置き換えるのが推奨。
  - `Events: GetBooksApi: Type: Api` とその `Properties` (Path, Method)
    - API Gateway のエンドポイントを定義する SAM の方法。ここでは `GET /books` が作られ、このエンドポイントで Lambda をトリガーする。

4. Outputs セクション

- `ApiUrl:`
  - Description: `Invoke URL for API`
  - Value: `!Sub "https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/books"`
    - CloudFormation の出力として、作成された API Gateway の実際の URL を `ApiUrl` として取得できるようにしている（`sam deploy` がこの出力をターミナルに表示する）。

---

**テンプレートを改修するときのポイント（実践メモ）**

- 環境変数の扱い

  - 簡易: `Environment.Variables.GOOGLE_BOOKS_API_KEY` に直接値を入れる（デプロイ時に `aws lambda update-function-configuration` で上書きすることも可能だが安全ではない）。
  - 推奨: Secrets Manager に移行。方法は 2 通り:
    1. CloudFormation の動的参照を利用して `GOOGLE_BOOKS_API_KEY` に Secrets を紐付ける。
    2. 環境変数に Secret 名のみを入れ、Lambda 実行時に SDK から `GetSecretValue` を呼ぶ（より柔軟）。

- IAM ポリシー

  - 現在は `AWSLambdaBasicExecutionRole` のみを付与している。Secrets Manager を使う場合は `secretsmanager:GetSecretValue` を許可するポリシーを追加する必要がある。
  - SAM の `Policies` には組み込みポリシー名か、カスタムのポリシードキュメントを指定できる。

- API の認証
  - `Events` に定義した API はデフォルトで公開（認証なし）になる。公開を制限するには:
    - API Key + Usage Plan を追加（簡易）
    - Cognito User Pool を使って OAuth2 / JWT ベースの認証を追加（SPA 向け）
    - Lambda Authorizer（カスタムロジック）を設定

**よく使う変更例（テンプレートのパッチ的例）**

- Secrets Manager 参照（Environment を動的参照に置き換える例）:

  ```yaml
  Environment:
    Variables:
      GOOGLE_BOOKS_API_KEY: "{{resolve:secretsmanager:aws-books-explorer/GoogleBooks:SecretString:GOOGLE_BOOKS_API_KEY}}"
  ```

- Lambda 実行ロールに Secrets 読取を追加する例（Policies に明示的追加）:
  ```yaml
  Policies:
    - AWSLambdaBasicExecutionRole
    - Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Action:
            - secretsmanager:GetSecretValue
          Resource: arn:aws:secretsmanager:ap-northeast-1:<your-account-id>:secret:aws-books-explorer/GoogleBooks-*
  ```

**確認用コマンド（template.yaml を元に作られたリソースを検査）**

- スタックの Outputs:
  ```bash
  aws cloudformation describe-stacks --stack-name aws-books-explorer --profile dev --region ap-northeast-1 --query 'Stacks[0].Outputs' --output table
  ```
- Lambda 設定（環境変数の確認）:
  ```bash
  aws lambda get-function-configuration --function-name books-function --profile dev --region ap-northeast-1
  ```

---

