# kindle-bookshelf

* `kindle-purchase-index`のCSVを検索・閲覧する、モバイル対応の個人用本棚です。
* まずは家庭内用で作成

## 機能

- 木製本棚風の表示と漫画シリーズ集約（同一シリーズを1エントリにまとめ、最新巻・所持巻数を表示）
- タイトル・著者・ASIN・購入日・ジャンルでの全文検索
- ジャンル絞り込みとコメントあり絞り込み、購入日（新/旧）・タイトル・著者・ジャンル順ソート
  - ジャンルは Amazon Kindleストアのカテゴリー準拠：漫画 / 小説・文芸 / ライトノベル / ビジネス・経済 / コンピュータ・IT / 暮らし・健康・子育て / 趣味・実用 / 歴史・地理 / 人文・思想 / 科学・テクノロジー / 語学・資格 / その他
  - CSVに `genre` / `category` 列があればその値を使用。無い場合はタイトルのキーワードから自動推定（漫画は `is_manga` で判定）
- 全冊数・漫画作品数・書籍数のライブラリサマリー
- 漫画ごとのコメントを Cloudflare D1 DB へ保存（誰でもWebから投稿・編集・削除・スレッド表示）

## 未実装（ネタ）
- コメントにプラスして漫画のおすすめ度合いを★5個で判別


## ローカル起動

```cmd
cd /d D:\kindle\kindle-bookshelf
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-kindle-csv.ps1
python -m http.server 8000
```

`sync-kindle-csv.ps1` は `kindle-purchase-index\csv\kindle-web-library.csv` を `data\kindle-web-library.csv` へコピーします。

<http://localhost:8000> を開きます。

漫画カードの吹き出しアイコンからコメントを追加・編集できます。投稿・更新時刻付きの履歴をスレッド表示します。

- **本番（Cloudflare Pages）**: `/api/comments` 経由で Cloudflare D1 へ保存。誰でもブラウザから投稿できます。
- **ローカル（localhost）**: D1 API に接続できないため `localStorage` へフォールバックします。

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
| `genre` | `ジャンル` | ジャンル（省略可。`category` より優先。無ければタイトルからAmazon準拠の12ジャンルを自動推定） |
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

**4. D1 データベースを作成**

```cmd
npx wrangler d1 create kindle-comments
```

出力された `database_id` を `wrangler.toml` の `[[d1_databases]]` セクションに貼り付けます。

```toml
[[d1_databases]]
binding = "COMMENTS_DB"
database_name = "kindle-comments"
database_id = "ここに貼り付ける"
```

マイグレーションを本番 D1 に適用します。

```cmd
npx wrangler d1 execute kindle-comments --remote --file=migrations/0001_comments.sql
```

**5. Pages プロジェクトを作成**

```cmd
npx wrangler pages project create kindle-bookshelf
```

プロジェクト名の例は `kindle-bookshelf`、本番ブランチは `main` です。

**6. 画面を初回デプロイ**

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

**7. CSV を初回アップロード**

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-cloudflare-data.ps1
```

> アップロードは **本番（リモート）R2** に対して行います。`upload-cloudflare-data.ps1` は
> `wrangler r2 object put` に `--remote` を付けています。これが無いと Wrangler は
> ローカルの R2 シミュレータ（`.wrangler\state`）に書き込み、本番には反映されず
> `/api/books` が「CSV was not found」（HTTP 404）を返します。

### CI/CD

**未設定です。** push しても自動デプロイはされません。画面の反映は下記「随時更新」のとおり `wrangler pages deploy` を手動実行してください。

GitHub Actions で自動化する場合は `.github/workflows/deploy.yml` を作成し、リポジトリの **Settings → Secrets and variables → Actions** へ `CLOUDFLARE_API_TOKEN`（Pages デプロイ権限）と `CLOUDFLARE_ACCOUNT_ID` を登録する必要があります。

### 自動同期

`scripts\sync-all.ps1` がエクスポート → 検証 → R2アップロード → ローカルコピーを一括実行します。

```cmd
cd /d D:\kindle\kindle-bookshelf
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-all.ps1
```

- Amazonセッション切れは終了コード2で中断しトースト通知。`kindle-purchase-index` で `npm run export` を手動実行して再ログイン
- 冊数が前回比5%超減なら中止（`-Force` で無視）。CSVに変更がなければアップロードをスキップ
- `-SkipExport` で取得済みCSVから実行。ログと状態は `.sync\`（Git管理外）
- 実行履歴（成功/失敗、直近10件）は画面トップの「同期ログ」アコーディオンに表示（R2の `sync-status.json` を `/api/sync-status` 経由で取得）

毎日06:00の自動実行を登録（初回のみ。時刻変更は `-At "21:00"`）:

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-sync-task.ps1
```

削除は `Unregister-ScheduledTask -TaskName KindleBookshelfSync`。

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
