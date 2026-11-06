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

## npm

```bash
npm install
npm run dev
```

ブラウザで http://127.0.0.1:5173 を開きます。APIは 127.0.0.1:8787 だけで待ちます。こちらは他の Vite アプリとポートが重なることがあります。

`npm test` で保存ルールのテスト、`npm start` でビルド済みの画面を 8787 から配信します。
