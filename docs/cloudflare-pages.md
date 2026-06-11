# Cloudflareでの配置と随時更新

## 推奨構成

```text
Amazon取得: Windows上のログイン済みChrome
  ↓
kindle-purchase-index/csv/kindle-web-library.csv
  ↓ CSVだけ上書き
非公開Cloudflare R2
  ↓ R2バインディング
Pages Function /api/books
  ↓
Cloudflare Pagesの本棚画面
  ↓
Cloudflare Accessで閲覧者を制限
```

画面とデータを分離します。HTML、CSS、JavaScriptを変更した時だけPagesをデプロイし、本の追加時はR2上のCSVだけを更新します。

Amazonからの取得は認証済みブラウザとCookieに依存するため、Cloudflare Workers Cronへ移さずWindows側で実行します。

## 初回設定

### 1. Wranglerへログイン

```cmd
cd /d D:\kindle\kindle-bookshelf
npx wrangler login
```

### 2. R2バケットを作成

```cmd
npx wrangler r2 bucket create kindle-bookshelf-data
```

R2の公開アクセスは有効にしません。

### 3. Pagesプロジェクトを作成

```cmd
npx wrangler pages project create
```

プロジェクト名の例は `kindle-bookshelf`、本番ブランチは `main` です。

### 4. 画面とPages Functionを配置

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-pages.ps1
npx wrangler pages deploy .\dist --project-name kindle-bookshelf
```

`functions/api/books.js` は `/api/books` として同時に配置されます。

### 5. PagesへR2をバインド

Cloudflare Dashboardで次を設定します。

1. Workers & PagesからPagesプロジェクトを開く。
2. Settings > Bindings > Add > R2 bucketを選ぶ。
3. Variable nameを `BOOKS_BUCKET` にする。
4. R2 bucketで `kindle-bookshelf-data` を選ぶ。
5. 設定後、Pagesをもう一度デプロイする。

### 6. 最初のCSVをアップロード

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-cloudflare-data.ps1
```

サイトの `/api/books` を開き、CSVが返ることを確認します。

## 随時更新

Kindle CSVを取得した後、次のコマンドだけでCloudflare上の本棚データを更新できます。

```cmd
cd /d D:\kindle\kindle-bookshelf
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-cloudflare-data.ps1
```

アップロード先のオブジェクトは同じキーで丸ごと置き換わります。ページを再読み込みすると、更新後のCSVを再検証して新しい一覧へ切り替わります。

バケット名を変更した場合:

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-cloudflare-data.ps1 -BucketName my-bucket
```

## 自動更新

Windowsタスクスケジューラで、次の順序を実行します。

1. デバッグポート付きの専用Chromeを起動し、ログイン済みKindle Libraryを開く。
2. `kindle-purchase-index/scripts/export-kindle-web-library.js` を実行する。
3. `scripts/upload-cloudflare-data.ps1` を実行する。
4. 成功・失敗ログをローカルへ保存する。

Amazonのセッション期限切れ、二段階認証、画面変更が発生した場合はローカルで再ログインが必要です。CookieやAmazon認証情報をCloudflareへ保存しません。

## 画面を更新する場合

HTML、CSS、JavaScript、Pages Functionを変更した時だけ実行します。

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-pages.ps1
npx wrangler pages deploy .\dist --project-name kindle-bookshelf
```

通常のCSV更新ではこのPagesデプロイは不要です。

## 閲覧制限

CSVには購入履歴が含まれるため、Cloudflare AccessでPagesのホスト名全体を認証対象にします。

```text
books.example.com/*
```

許可ポリシーには自分のメールアドレスだけを登録します。HTMLと `/api/books` の両方を同じAccessアプリケーションで保護してください。

カスタムドメインだけをAccessで保護しても、既定の `<project>.pages.dev` が公開されたままだと `/api/books` へ迂回できます。カスタムドメインと `pages.dev` の両方にAccessを適用するか、`pages.dev` からカスタムドメインへ転送して迂回経路がないことを確認します。Pagesの「Enable access policy」はプレビューデプロイだけを保護し、本番の `<project>.pages.dev` は対象外なので注意してください。

## Pagesを毎回再配置する方式との比較

Pages Direct UploadへCSVを含める方式も動作しますが、データ変更のたびにサイト全体の新しいデプロイが作成されます。R2分離方式なら約1.4MBのCSV一つだけを更新でき、画面のデプロイ履歴と購入履歴の更新履歴を分けられます。
