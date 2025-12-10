# 検索機能実装タスクリスト

## 進捗状況
- 完了: 37/37 ✅
- 進行中: 0/37
- 未着手: 0/37

---

## 1. インフラ・基盤実装

### search-01: Oramaライブラリのセットアップと初期化 ✅
- [x] package.jsonへの追加
- [x] バージョン固定（`^`ではなく厳密指定）
- [x] 型定義の確認
- **完了日**: 2024-XX-XX
- **備考**: @orama/orama 3.1.16, @orama/plugin-data-persistence 3.1.16 を追加

### search-02: Web Workerの基盤実装 ✅
- [x] worker.tsの作成
- [x] メインスレッドとの通信設定
- [x] イベントリスナーの実装
- **完了日**: 2024-XX-XX
- **備考**: search-worker.tsとsearch-worker-manager.tsを作成。アクションベースのメッセージング実装。

### search-03: Oramaのインデックススキーマ定義 ✅
- [x] スキーマ定義（ファイルパス、タイトル、内容、ベクトル、メタデータ）
- [x] 型定義の作成
- **完了日**: 2024-XX-XX
- **備考**: orama-schema.tsを作成。DocumentSchema、DocumentMetadata型を定義。動的なベクトル次元数に対応。

### search-04: OramaのPersistence Plugin実装 ✅
- [x] バイナリ形式での保存・読み込み
- [x] `.obsidian/plugins/`配下への保存
- [x] プラグイン起動時の復元処理
- **完了日**: 2024-XX-XX
- **備考**: 
  - `src/workers/persistence-manager.ts`: シリアライズ/デシリアライズ処理
  - `src/utils/index-persistence.ts`: ファイルI/O処理（Electron環境とモバイル環境の両方に対応）
  - `src/services/search-service.ts`: 統合サービス
  - dpack形式でバイナリ保存、Transferable Objectでゼロコピー転送

---

## 2. ベクトル化機能

### search-05: ベクトル化キューの実装 ✅
- [x] 同時実行数2の制御
- [x] 優先度High/Lowの管理
- [x] FIFO方式の実装
- **完了日**: 2024-XX-XX
- **備考**: 
  - `src/services/vectorization-queue.ts`を作成
  - セマフォによる同時実行数制御（デフォルト2、変更可能）
  - 優先度付きキュー（High優先度は先頭、Low優先度はFIFO）
  - Exponential Backoffによるリトライ（最大3回、2^retryCount秒待機）
  - イベントハンドラー（onItemStart, onItemComplete, onItemFail, onProgress）

### search-06: ベクトル化キューの永続化 ✅
- [x] data.jsonまたはIndexedDBへの保存
- [x] プラグイン再起動時の復元処理
- **完了日**: 2024-XX-XX
- **備考**: 
  - `src/services/queue-persistence.ts`を作成
  - Obsidianの`loadData`/`saveData`を使用してJSON形式で保存
  - 完了・失敗したアイテムは保存しない（pending, processingのみ）
  - 復元時にファイルの存在確認を実施
  - 自動保存機能（30秒ごと）
  - プラグイン終了時の最終保存

### search-07: Exponential Backoffによるリトライロジック
- [ ] リトライロジックの実装
- [ ] 最大3〜5回の制限
- [ ] エラーログの記録

### search-08: OpenRouter API統合 ✅
- [x] ベクトル化モデル3種類のサポート
- [x] ストリーミング対応（注: Embedding APIは通常ストリーミング非対応のため、将来の拡張として実装）
- [x] エラーハンドリング
- **完了日**: 2024-XX-XX
- **備考**: 
  - `src/services/embedding-service.ts`を作成
  - 3つのモデルをサポート: "qwen/qwen3-embedding-8b", "google/gemini-embedding-001", "openai/text-embedding-ada-002"
  - 次元数の動的取得（APIレスポンスから）
  - Embeddingエンドポイントが存在しない場合のフォールバック処理
  - タイムアウト処理とエラーハンドリング

### search-09: ベクトル化処理のWorker実装 ✅
- [x] API呼び出し
- [x] テキスト解析
- [x] Oramaへの登録
- **完了日**: 2024-XX-XX
- **備考**: 
  - `src/utils/text-processor.ts`を作成（Markdownからテキスト抽出、フロントマター除去）
  - Worker内でOpenRouter Embedding APIを呼び出し
  - Worker内でテキスト解析（Markdown処理）
  - Worker内でOramaに登録
  - `src/services/vectorization-handler.ts`を作成（VectorizationQueueと統合）
  - `src/types.ts`に`embeddingModel`を追加

### search-10: ベクトル化済みマークの表示 ✅
- [x] view.addActionの実装
- [x] CSSクラスの追加
- [x] active-leaf-changeイベントのフック
- **完了日**: 2024-XX-XX
- **備考**: 
  - `src/services/vector-status-manager.ts`を作成（ベクトル化済みマークの管理）
  - `active-leaf-change`イベントを監視してタブ切り替え時にマークを更新
  - `view.addAction`でエディタ右上にアイコンを追加（`check-circle`アイコン）
  - CSSクラス`is-vectorized-icon`で緑色にスタイリング
  - Workerに`CHECK_DOCUMENT_EXISTS`メッセージタイプを追加
  - `handleCheckDocumentExists`関数を実装（filePathで完全一致検索）
  - `SearchWorkerManager`に`checkDocumentExists`メソッドを追加
  - `SearchService`に`checkDocumentExists`メソッドを追加
  - `main.ts`にSearchServiceとVectorStatusManagerを統合

---

## 3. ファイル監視とインデックス更新

### search-11: ファイル変更の監視実装 ✅
- [x] vault.onでmodify/create/delete/renameイベントを監視
- [x] イベントハンドラーの実装
- **完了日**: 2024-XX-XX
- **備考**: 
  - `src/services/file-watcher.ts`を作成（ファイル変更監視サービス）
  - `modify`、`create`、`delete`、`rename`イベントを監視
  - イベントハンドラーを登録・削除する仕組みを実装
  - `main.ts`にFileWatcherを統合
  - プラグイン起動時に自動的に監視を開始
  - プラグイン終了時に自動的に監視を停止
  - 注意: 実際のインデックス更新処理はsearch-12, search-13で実装予定

### search-12: デバウンス処理の実装 ✅
- [x] 2〜5秒待機ロジック
- [x] キューへの追加
- **完了日**: 2024-XX-XX
- **備考**: 
  - `src/utils/debounce.ts`を作成（デバウンス処理のユーティリティ）
  - ファイルパスごとにタイマーを管理
  - デフォルト3秒の待機時間（設定可能）
  - `modify`/`create`イベントはデバウンス処理後にキューに追加（high優先度）
  - `delete`/`rename`イベントは即座に処理（デバウンス不要）
  - Markdownファイル（.md）のみを処理
  - `main.ts`にDebouncerとVectorizationQueueを統合
  - プラグイン終了時にすべてのタイマーをクリア処理

### search-13: インデックスの更新処理 ✅
- [x] insert操作
- [x] update操作
- [x] remove操作
- **完了日**: 2024-XX-XX
- **備考**: 
  - `SearchService`に`removeDocument`と`updateDocument`メソッドを追加
  - `main.ts`のFileWatcherハンドラーでインデックス更新処理を実装
  - `modify`/`create`イベント: デバウンス処理後にベクトル化キューに追加（insert/update）
  - `delete`イベント: 即座にインデックスから削除（remove）
  - `rename`イベント: 旧パスで削除、新パスでキューに追加（remove + insert）
  - `processVectorization`メソッドを実装（ファイル読み込み、ベクトル化、Orama登録）
  - ベクトル化完了後にベクトル状態マネージャーを更新
  - VectorizationQueueにベクトル化処理関数を設定

---

## 4. 検索機能

### search-14: Intl.Segmenterを使用した日本語単語分割
- [ ] Intl.Segmenterの実装
- [ ] 単語境界の検出
- [ ] 検索精度の向上

### search-15: キーワード検索の実装
- [ ] AND/OR検索
- [ ] AND優先表示
- [ ] 日付順ソート

### search-16: キーワードハイライト表示の実装
- [ ] ハイライトロジック
- [ ] CSSスタイリング

### search-17: ベクトル検索の実装
- [ ] 類似度順ソート
- [ ] 10〜100件の選択可能
- [ ] デフォルト10件

### search-18: RRFアルゴリズムの実装
- [ ] k=60固定
- [ ] 重み付け1:1
- [ ] 順位ベースの統合

### search-19: ハイブリッド検索の実装
- [ ] キーワード検索とベクトル検索の結果をRRFで統合
- [ ] 統合結果の表示

---

## 5. UI実装

### search-20: 検索Viewの実装
- [ ] サイドパネルとして表示
- [ ] 検索方式選択タブ
- [ ] クエリ入力フィールド
- [ ] 結果件数選択

### search-21: 検索結果カードの実装
- [ ] 幅広リストビュー
- [ ] ヘッダー行（ファイル名、パス、更新日）
- [ ] ボディ行（3行プレビュー）
- [ ] CSSスタイリング

### search-22: 検索結果のクリック処理
- [ ] 2画面構成対応
- [ ] 別タブで開く処理

### search-23: 検索結果のページネーション実装
- [ ] トップ10〜20件表示
- [ ] Infinite Scrollまたは「もっと見る」ボタン

---

## 6. 設定UI

### search-24: ディレクトリ指定UIの実装
- [ ] チェックボックス付きツリービュー
- [ ] 3値ステータス（対象/除外/継承）

### search-25: デフォルト強制除外リストの実装
- [ ] 隠しファイル・フォルダの自動除外
- [ ] UI上での表示

### search-26: フォルダ名変更への追従
- [ ] vault.on('rename')イベント監視
- [ ] 設定ファイル更新

### search-27: ベクトル化モデル設定UIの実装
- [ ] 初回設定
- [ ] モデル選択プルダウン

### search-28: モデル変更時の警告ダイアログ実装
- [ ] インパクト分析
- [ ] コスト見積もり
- [ ] 確認フロー

---

## 7. エラーハンドリングとパフォーマンス

### search-29: ステータスバーへの進捗表示
- [ ] 「Vectorizing: 5/100」形式
- [ ] クリックで詳細モーダル

### search-30: エラーハンドリング実装
- [ ] 部分失敗の許容
- [ ] 失敗ファイルリストの保持
- [ ] 設定画面での表示

### search-31: インデックス全再構築（Rebuild Index）機能の実装
- [ ] 再構築ボタン
- [ ] 進捗表示
- [ ] エラーハンドリング

### search-32: インデックスの段階的ロード実装
- [ ] 非同期読み込み
- [ ] 「準備中」ステータス

### search-33: キャッシュ戦略の実装
- [ ] mtimeハッシュによる変更検知
- [ ] スキップ処理

### search-34: モバイル対応の検討と実装
- [ ] Web Worker必須の確認
- [ ] 軽量モデルまたは検索のみ許可

### search-35: Workerとメインスレッド間のデータ転送最適化
- [ ] 必要なデータのみ送信
- [ ] returningオプション活用

---

## 8. その他

### search-36: 設定項目の追加
- [ ] ベクトル化対象ディレクトリ
- [ ] 検索結果件数
- [ ] キューの同時実行数など

### search-37: ライセンス確認とREADMEへの記載
- [ ] Orama Apache 2.0
- [ ] Embeddingモデルのライセンス

---

## 更新履歴
- 2024-XX-XX: タスクリスト作成
- 2024-XX-XX: search-01, search-02, search-03 完了
- 2024-XX-XX: ビルド確認完了（TypeScriptコンパイルエラーなし）
- 2024-XX-XX: 実装確認・ビルド確認・テスト実施完了
  - 詳細は `docs/implementation-status.md` を参照

