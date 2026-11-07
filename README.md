# 勘兵衛

このMacのブラウザで使う、自分専用の看板です。データは `data/kanban.db` に残ります。

## Docker

他の npm アプリが使いがちな 3000 や 5173、8787 は使いません。Mac の localhost だけに出します。

```bash
docker compose up --build
```

ブラウザで http://127.0.0.1:18473 を開きます。`npm run dev` は止めてから起動してください。同じ `data/kanban.db` を両方から書くと壊れます。

18473 が埋まっているときは、別のポートを指定します。

```bash
KANBEI_PORT=18474 docker compose up --build
```

## Dockerで開発（ホットリロード）

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

http://127.0.0.1:18473 を開きます。通常モードと同じサービスを開発モードに切り替え、既存の `data/kanban.db` を引き継ぎます。同じディレクトリから実行してください。`npm run dev` は止めておいてください。

`src/client` の React・CSS を保存すると、コンテナの再ビルドなしでブラウザに自動反映されます。初回の切り替え時だけ、開いていた画面を再読み込みしてください。
ホストのソースを読み取り専用でマウントし、ファイル変更を250ミリ秒間隔で確認します。APIはコンテナ内部で起動し、Vite経由で接続します。

依存パッケージ・Dockerfile・Compose設定を変更した場合は、上のコマンドで再ビルドしてください。
別のポートを使う場合は、先頭に `KANBEI_PORT=18474` を付けます。

ログ確認と停止:

```bash
docker compose -f docker-compose.dev.yml logs -f
docker compose -f docker-compose.dev.yml down
```

通常モードに戻す場合:

```bash
docker compose up -d --build
```

## npm

```bash
npm install
npm run dev
```

ブラウザで http://127.0.0.1:5173 を開きます。APIは 127.0.0.1:8787 だけで待ちます。こちらは他の Vite アプリとポートが重なることがあります。

`npm test` で保存ルールのテスト、`npm start` でビルド済みの画面を 8787 から配信します。

## プロジェクト

画面上部の「＋ 作成」から名前を入力すると、新しいプロジェクトを作成できます。
選択欄でプロジェクトを切り替えられ、最後に開いたものを次回も表示します。
選択中のプロジェクトは「名前を変更」から改名できます。
各プロジェクトには「未着手・進行中・完了」の3列が用意され、列・カード・ラベル・控えはそれぞれ独立しています。

更新前のデータは、初回起動時に「既存のプロジェクト」へ自動で引き継ぎます。
Dockerで利用中の場合は `docker compose up -d --build` で更新し、画面を再読み込みしてください。
