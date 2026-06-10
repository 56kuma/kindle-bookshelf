# kindle-bookshelf

手動で取得・整形したKindle購入リストCSVを、検索しやすい本棚として表示する静的ウェブページです。

## 起動方法

ローカルHTTPサーバーを起動してブラウザから開きます。

```powershell
python -m http.server 8000
```

<http://localhost:8000> を開いてください。

## CSV形式

`data/books.csv` を次の形式で差し替えると、起動時にその内容が表示されます。

```csv
purchased_at,cover_image,title,author,category
2026-05-24,assets/covers/sample.svg,本のタイトル,作者名,漫画
```

- `purchased_at`: 購入日。`YYYY-MM-DD` を推奨
- `cover_image`: 表紙画像のURL、またはHTMLから見たローカル画像パス
- `title`: タイトル
- `author`: 作者
- `category`: 本の種類。「マンガのみ」絞り込みでは `漫画`、`マンガ`、`コミック`、`manga`、`comic` をマンガとして扱う

画面の「CSVを読み込む」からファイルを選び、一時的に内容を確認することもできます。選択したCSVや検索内容が外部へ送信されることはありません。

## 主な機能

- タイトル、作者、購入日の部分一致検索
- マンガのみのワンタップ絞り込み
- 購入日、タイトル、作者による並び替え
- CSVファイルのブラウザ内プレビュー
- スマートフォンを優先したレスポンシブ表示
