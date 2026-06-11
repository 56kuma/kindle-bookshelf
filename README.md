# kindle-bookshelf

購入済みKindle本を検索・閲覧する、モバイル対応の静的ウェブページです。

## 主な機能

- タイトル、著者、ASIN、購入日の部分一致検索
- 漫画のみの絞り込み
- 購入日、タイトル、著者による並び替え
- Amazonの表紙画像と商品ページへのリンク
- 6,000冊以上でも軽く動く段階描画
- 手元のCSVを選択して一時的に表示

## データを同期する

`kindle-purchase-index` で生成したCSVを本棚へコピーします。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-kindle-csv.ps1
```

同期先は `data/kindle-web-library.csv` です。このファイルには個人の購入履歴が含まれるため、Gitの管理対象から除外しています。

## ローカルで起動する

```powershell
python -m http.server 8000
```

ブラウザーで <http://localhost:8000> を開きます。

## CSV形式

```csv
purchased_at,title,author,asin,cover_url,is_manga
2026-06-06,本のタイトル,著者名,B012345678,https://example.com/cover.jpg,true
```

## Cloudflare Pages

画面はCloudflare Pages、購入履歴CSVは非公開R2バケットへ分離します。通常のデータ更新ではPagesを再デプロイせず、CSVだけをR2へ上書きします。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-pages.ps1
npx wrangler pages deploy .\dist

powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\upload-cloudflare-data.ps1
```

Pages Functionsの `/api/books` がR2からCSVを読み込みます。Cloudflare側でR2バインディング `BOOKS_BUCKET` を設定し、購入履歴を外部公開しない場合はCloudflare AccessでPagesのホスト名全体を認証必須にしてください。

詳しい構成と日次更新手順は [docs/cloudflare-pages.md](docs/cloudflare-pages.md) を参照してください。
