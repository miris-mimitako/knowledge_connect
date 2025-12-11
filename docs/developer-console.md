# Obsidian開発者ツールの開き方

Obsidianで開発者ツール（コンソール）を開く方法：

## 方法1: キーボードショートカット

- **Windows/Linux**: `Ctrl + Shift + I`
- **Mac**: `Cmd + Option + I`

## 方法2: コマンドパレットから

1. `Ctrl + P`（Mac: `Cmd + P`）でコマンドパレットを開く
2. 「Open Developer Tools」または「開発者ツールを開く」と入力
3. 選択して実行

## 方法3: 設定から有効化

1. **設定**（`Ctrl + ,`）を開く
2. **About** → **Advanced** セクション
3. **Developer mode** を有効化
4. その後、キーボードショートカットで開く

## コンソールで確認すべきログ

Worker初期化の確認のために、以下のログを探してください：

### 正常な場合のログ順序：

1. `[SearchService] Starting initialization...`
2. `[SearchService] WorkerManager created`
3. `[SearchWorkerManager] Initializing worker from: search-worker.js`
4. `[SearchWorkerManager] Worker instance created, waiting for INIT_DB_DONE...`
5. `[SearchWorkerManager] Sending INIT_DB message to worker...`
6. `[SearchWorker] Worker script loaded and ready`
7. `[SearchWorker] Received message: INIT_DB`
8. `[SearchWorker] Starting DB initialization...`
9. `[SearchWorker] Orama DB created successfully`
10. `[SearchWorker] INIT_DB_DONE message sent successfully`
11. `[SearchWorkerManager] Received message from worker: INIT_DB_DONE`
12. `[SearchService] Worker ready after XXXms`

### エラーの場合：

- `[SearchWorker] Worker error:` - Workerのロードエラー
- `[SearchWorker] DB initialization error:` - DB初期化エラー
- `[SearchService] Worker initialization timeout` - タイムアウトエラー

## トラブルシューティング

### Workerファイルが見つからない場合

- プラグインディレクトリ（`.obsidian/plugins/knowledge-connect/`）に`search-worker.js`が存在するか確認
- ファイルサイズが0バイトでないか確認（148KB程度が正常）

### Workerがメッセージを受信していない場合

- コンソールに`[SearchWorker] Worker script loaded and ready`が表示されているか確認
- 表示されていない場合、Workerファイルの読み込みに失敗している可能性

### INIT_DB_DONEが返ってこない場合

- `[SearchWorker] Starting DB initialization...`の後にエラーが表示されていないか確認
- Oramaの初期化でエラーが発生している可能性

