# kindle-bookshelf

`kindle-purchase-index`のCSVを検索・閲覧する、モバイル対応の個人用本棚です。

## 機能

- 木製本棚風の表示と漫画シリーズ集約
- タイトル・著者・ASIN・購入日検索
- 漫画・コメントあり絞り込み、購入日・タイトル・著者・ジャンル順
- 最新巻、購入日、所持巻数を表示
- 漫画ごとのコメントをブラウザへ保存

## ローカル起動

```cmd
cd /d D:\kindle\kindle-bookshelf
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-kindle-csv.ps1
python -m http.server 8000
```

<http://localhost:8000> を開きます。

漫画カードの吹き出しアイコンからコメントを追加・編集できます。投稿・更新時刻付きの履歴を吹き出し表示し、同じURLを開いたブラウザの`localStorage`へ保存します。

## CSV

```csv
purchased_at,title,author,asin,cover_url,is_manga
```

購入履歴CSVはGit管理対象外です。

## Cloudflare

画面はPages、CSVは非公開R2へ配置します。

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-pages.ps1
npx wrangler pages deploy .\dist

powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-cloudflare-data.ps1
```

R2バインディング名は`BOOKS_BUCKET`です。詳細は[docs/cloudflare-pages.md](docs/cloudflare-pages.md)を参照してください。
