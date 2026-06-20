# kindle-bookshelf

`kindle-purchase-index`のCSVを検索・閲覧する、モバイル対応の個人用本棚です。

## 機能

- 木製本棚風の表示と漫画シリーズ集約（同一シリーズを1エントリにまとめ、最新巻・所持巻数を表示）
- タイトル・著者・ASIN・購入日・ジャンルでの全文検索
- 漫画のみ・コメントあり絞り込み、購入日（新/旧）・タイトル・著者・ジャンル順ソート
- 全冊数・漫画作品数・書籍数のライブラリサマリー
- 漫画ごとのコメントをブラウザへ保存（複数追加・編集・削除・スレッド表示）
- ブラウザから直接CSVを読み込む機能

## ローカル起動

```cmd
cd /d D:\kindle\kindle-bookshelf
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-kindle-csv.ps1
python -m http.server 8000
```

`sync-kindle-csv.ps1` は `kindle-purchase-index\csv\kindle-web-library.csv` を `data\kindle-web-library.csv` へコピーします。

<http://localhost:8000> を開きます。

漫画カードの吹き出しアイコンからコメントを追加・編集できます。投稿・更新時刻付きの履歴をスレッド表示し、同じブラウザの `localStorage` へ保存します。

## CSV

`sync-kindle-csv.ps1` と `upload-cloudflare-data.ps1` が検証する必須列：

```csv
purchased_at,title,author,asin,cover_url,is_manga
```

アプリが認識する全列（別名も受け付けます）：

| 列 | 別名 | 内容 |
|---|---|---|
| `purchased_at` | `purchase_date`, `order_date` | 購入日（YYYY-MM-DD） |
| `title` | `product_name` | タイトル |
| `title_kana` | `title_yomi`, `reading` | タイトルよみがな（ソート用、省略可） |
| `author` | `authors`, `creator` | 著者 |
| `category` | `type`, `book_type` | ジャンル（`漫画`を含む値は `is_manga` と同等） |
| `asin` | — | ASIN |
| `cover_url` | `cover_image`, `image_url`, `cover` | 表紙画像URL |
| `is_manga` | `manga`, `is_comic` | 漫画フラグ（true/1/yes/y） |

購入履歴CSVはGit管理対象外です。

## Cloudflare へのデプロイ

画面はPages、CSVは非公開R2へ配置します。

### 前提条件

- [Node.js](https://nodejs.org/) がインストール済みで `npx` が使えること

### 初回セットアップ

**1. Wrangler にログイン**

```cmd
cd /d D:\kindle\kindle-bookshelf
npx wrangler login
```

ブラウザが開くので Cloudflare アカウントで認証します。

**2. R2 を有効化**

Cloudflare Dashboard で R2 を有効化します（初回のみ）。

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 左メニューの **R2 Object Storage** を開く
3. **Enable R2** ボタンをクリックして有効化する

> R2 は無効だと `code: 10042` エラーになります。

**3. R2 バケットを作成**

```cmd
npx wrangler r2 bucket create kindle-bookshelf-data
```

R2 の公開アクセスは有効にしません。

**3. Pages プロジェクトを作成**

```cmd
npx wrangler pages project create kindle-bookshelf
```

プロジェクト名の例は `kindle-bookshelf`、本番ブランチは `main` です。

**4. 画面を初回デプロイ**

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-pages.ps1
npx wrangler pages deploy --project-name kindle-bookshelf
```

> R2 バインド（変数名 `BOOKS_BUCKET` → バケット `kindle-bookshelf-data`）は
> リポジトリ直下の `wrangler.toml` で定義済みです。デプロイ時に自動で付与されるため
> Dashboard での手動バインドは不要です。
>
> `/api/books` を返す Pages Functions のソースは `functions\` ディレクトリにあり、
> `wrangler.toml` の `pages_build_output_dir` を使ってデプロイ時に自動コンパイルされます。
> `npx wrangler pages deploy` は位置引数なしで実行してください（`pages_build_output_dir` が
> 出力ディレクトリ `dist` を解決します）。

**5. CSV を初回アップロード**

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-cloudflare-data.ps1
```

> アップロードは **本番（リモート）R2** に対して行います。`upload-cloudflare-data.ps1` は
> `wrangler r2 object put` に `--remote` を付けています。これが無いと Wrangler は
> ローカルの R2 シミュレータ（`.wrangler\state`）に書き込み、本番には反映されず
> `/api/books` が「CSV was not found」（HTTP 404）を返します。

### 随時更新

**CSV だけ更新する場合**（本の追加・同期後）

```cmd
cd /d D:\kindle\kindle-bookshelf
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-cloudflare-data.ps1
```

**画面も更新する場合**（HTML / CSS / JS を変更した時）

```cmd
cd /d D:\kindle\kindle-bookshelf
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-pages.ps1
npx wrangler pages deploy --project-name kindle-bookshelf
```

詳細は [docs/cloudflare-pages.md](docs/cloudflare-pages.md) を参照してください。
