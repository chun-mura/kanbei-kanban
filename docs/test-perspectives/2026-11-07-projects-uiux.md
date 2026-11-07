# プロジェクトとUI/UXのテスト観点

対象: a5946a4。既存の自動テスト17件、UIの確認記録と照合。

## 正常系
- must: プロジェクト作成・改名、初期3列、別プロジェクトの独立したカード操作。projects.test.tsでカバー済み。
- must: カードとラベルの保存、レイアウト保存。routes.test.tsでカバー済み。

## 境界値
- must / BVA・ECP適用: プロジェクト名の空白、空、最大長超過、文字列以外。projects.test.tsでカバー済み。
- must / ECP適用: 不正なID・存在しないID・別プロジェクトのID。projects.test.tsでカバー済み。
- should / BVA適用: 有効な80文字の名前、UIの40文字の列名と120文字のカード名。境界ぴったりの自動テストは未追加。
- should: 長文・375px幅でページ全体が横へはみ出さない。375px幅のDOM寸法を手動確認済み。

## 異常系
- must: 不正なラベル色、空タイトル、カードの残る列削除を拒否。routes.test.tsでカバー済み。
- should: 保存成功後に表示取得のみ失敗しても、再保存せず再取得へ誘導する。コードレビュー済み、通信障害のE2E自動テストなし。
- should: 保存中の連打、通信失敗後の再試行。フォーム制御は実装確認済み、E2E自動テストなし。

## 状態遷移
- must: 旧DB移行、再起動、意図的な空ボードの維持。実SQLiteを使うprojects.test.tsでカバー済み。
- must: モーダル内の操作に限定し、閉じると元のカードへフォーカス復帰。Chromeで手動確認済み。ネイティブdialogの意味構造はui.test.tsでカバー済み。
- should: 未保存編集から閉じる・Escape・ページ離脱時の確認、日本語IME確定Enter。実装確認済み、全経路のE2E自動テストなし。
- should: ラベル削除後のカード削除・Undo、列移動後の表示取得失敗。独立レビューで修正と解消を確認済み、E2E自動テストなし。

## 回帰
- must: 既存API経由のカード・ラベル・列とレイアウト操作。routes.test.tsとlayout.test.tsでカバー済み。
- should: ヘッダーのラベル付き選択欄とボタンの下端揃え、スマホの折り返し。CSS修正とビルド確認済み、最新のヘッダー修正後の実画面再計測は未実施。

## フレームワーク結合
- must: DrizzleとSQLiteの実接続、トランザクション移行、Honoの実ルーティングをmockなしで実行。projects.test.tsとroutes.test.tsでカバー済み。
- should: Reactのイベント処理、日本語IME、ブラウザ標準dialogの全キー操作。SSRテストは意味構造のみ。実機・VoiceOverの網羅検証なし。

## セキュリティ
- must: 別プロジェクトIDを指定した読み書き・ラベル・レイアウト操作を拒否。実Hono/SQLiteのprojects.test.tsでカバー済み。
- must: 制約外の入力を拒否。routes.test.tsとprojects.test.tsでカバー済み。

負荷・性能テストは今回のコミット範囲外。
