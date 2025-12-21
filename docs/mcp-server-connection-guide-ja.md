# Obsidianプラグイン開発者向け MCPサーバー接続ガイド

このドキュメントは、ObsidianプラグインからこのMCPサーバーに接続する方法を説明します。

## サーバー情報

- **ベースURL**: `http://127.0.0.1:8000`
- **CORS**: すべてのオリジンから許可されています
- **プロトコル**: HTTP REST API

## 前提条件

1. MCPサーバーが起動していること（`start.bat`を実行してサーバーを起動してください）
2. ObsidianプラグインがHTTPリクエストを送信できること

## 利用可能なエンドポイント

### 1. Hello World

**エンドポイント**: `GET /`

**説明**: サーバーが正常に動作しているか確認するためのエンドポイント

**レスポンス例**:
```json
{
  "message": "Obsidian MCP Server",
  "version": "1.0.0",
  "status": "running"
}
```

### 2. ヘルスチェック

**エンドポイント**: `GET /health`

**説明**: サーバーの健全性を確認するエンドポイント

**レスポンス例**:
```json
{
  "status": "healthy"
}
```

### 3. 全文検索エンジン（Search Module）

#### 3.1 インデックス作成

**エンドポイント**: `POST /search/index`

**説明**: 指定されたディレクトリ内のファイルをスキャンしてインデックスを作成（バックグラウンド処理）

**リクエストボディ**:
```json
{
  "directory_path": "C:/path/to/documents",
  "clear_existing": false
}
```

**レスポンス例**:
```json
{
  "message": "インデックス作成ジョブを開始しました",
  "job_id": 1,
  "directory_path": "C:/path/to/documents"
}
```

**対応ファイル形式**:
- PDF（ページ単位）
- Word (.docx)
- PowerPoint (.pptx)
- Excel (.xlsx、数値のみのシートは除外）
- テキストファイル（.txt, .md, .py, .js, .ts, .json, .xml, .html, .css, .yaml, .csvなど）

#### 3.2 全文検索

**エンドポイント**: `GET /search/query?query={キーワード}&limit={件数}` または `POST /search/query`

**説明**: キーワードで全文検索を実行

**リクエスト例（GET）**:
```
GET /search/query?query=プロジェクト&limit=50
```

**リクエストボディ（POST）**:
```json
{
  "query": "プロジェクト",
  "limit": 50
}
```

**レスポンス例**:
```json
{
  "query": "プロジェクト",
  "results": [
    {
      "file_path": "C:/documents/project.md",
      "file_type": "md",
      "location_info": "Full Document",
      "snippet": "【プロジェクトの概要】このプロジェクトは..."
    }
  ],
  "total": 1
}
```

#### 3.3 ジョブ管理

**エンドポイント**: `GET /search/jobs/{job_id}`

**説明**: ジョブの進捗状況を取得

**レスポンス例**:
```json
{
  "id": 1,
  "job_type": "index",
  "status": "processing",
  "parameters": {
    "directory_path": "C:/documents",
    "clear_existing": false
  },
  "progress": {
    "current": 45,
    "total": 100,
    "percentage": 45.0,
    "message": "処理中: document.pdf"
  },
  "created_at": "2024-01-01T10:00:00",
  "started_at": "2024-01-01T10:00:05",
  "updated_at": "2024-01-01T10:05:30"
}
```

**エンドポイント**: `GET /search/jobs?status={ステータス}&limit={件数}`

**説明**: ジョブ一覧を取得（フィルタ可能）

**クエリパラメータ**:
- `status`: `pending`, `processing`, `completed`, `failed`, `cancelled`（オプション）
- `limit`: 取得件数の上限（デフォルト: 100）

**エンドポイント**: `POST /search/jobs/{job_id}/cancel`

**説明**: ジョブをキャンセル

**レスポンス例**:
```json
{
  "message": "ジョブ 1 をキャンセルしました",
  "job_id": 1
}
```

#### 3.4 統計情報

**エンドポイント**: `GET /search/stats`

**説明**: インデックス統計情報を取得

**レスポンス例**:
```json
{
  "total_documents": 150,
  "database_path": "search_index.db"
}
```

### 4. タスク管理UI（Task Module）

#### 4.1 インデックス作成状況ページ

**エンドポイント**: `GET /task/create_index`

**説明**: インデックス作成状況を確認するWebページ（HTML形式）

**説明**: ブラウザでアクセスすると、リアルタイムで進捗を確認できるWebページが表示されます。自動更新機能（2秒ごと）やフィルタ機能、ジョブキャンセル機能が利用できます。

**アクセス方法**: ブラウザで `http://127.0.0.1:8000/task/create_index` にアクセス

## Obsidianプラグインからの接続方法

### 実装済み機能

このプラグインには以下の機能が実装されています：

1. **MCPサーバーの状態を確認** - ヘルスチェックを実行
2. **MCPサーバー Hello World** - Hello Worldエンドポイントを呼び出し
3. **MCP: インデックスを作成** - バルト内のファイルをインデックス化
4. **MCP: ドキュメントを検索** - 全文検索を実行
5. **MCP: 検索統計情報を表示** - インデックス統計を表示
6. **MCP: ジョブ一覧を表示** - 実行中のジョブ一覧を表示

### TypeScriptでの実装例

```typescript
// サーバーのベースURL
const MCP_SERVER_URL = 'http://127.0.0.1:8000';

/**
 * MCPサーバーにGETリクエストを送信
 */
async function callMCPServer(endpoint: string): Promise<any> {
    try {
        const response = await fetch(`${MCP_SERVER_URL}${endpoint}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('MCPサーバーへの接続エラー:', error);
        throw error;
    }
}

/**
 * MCPサーバーにPOSTリクエストを送信
 */
async function postToMCPServer(endpoint: string, data: any): Promise<any> {
    try {
        const response = await fetch(`${MCP_SERVER_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('MCPサーバーへの接続エラー:', error);
        throw error;
    }
}

// 使用例
async function checkServerHealth() {
    try {
        const result = await callMCPServer('/health');
        console.log('サーバーステータス:', result.status);
    } catch (error) {
        console.error('サーバーに接続できません:', error);
    }
}

async function getHelloWorld() {
    try {
        const result = await callMCPServer('/');
        console.log('メッセージ:', result.message);
        console.log('バージョン:', result.version);
        console.log('ステータス:', result.status);
    } catch (error) {
        console.error('エラー:', error);
    }
}

// 全文検索の使用例
async function createIndex(directoryPath: string, clearExisting: boolean = false) {
    try {
        const result = await postToMCPServer('/search/index', {
            directory_path: directoryPath,
            clear_existing: clearExisting
        });
        console.log('インデックス作成ジョブ開始:', result.job_id);
        return result.job_id;
    } catch (error) {
        console.error('インデックス作成エラー:', error);
        throw error;
    }
}

async function searchDocuments(query: string, limit: number = 50) {
    try {
        const encodedQuery = encodeURIComponent(query);
        const result = await callMCPServer(`/search/query?query=${encodedQuery}&limit=${limit}`);
        console.log(`検索結果: ${result.total}件`);
        return result.results;
    } catch (error) {
        console.error('検索エラー:', error);
        throw error;
    }
}

async function getJobStatus(jobId: number) {
    try {
        const result = await callMCPServer(`/search/jobs/${jobId}`);
        console.log(`ジョブステータス: ${result.status}`);
        console.log(`進捗: ${result.progress.current}/${result.progress.total} (${result.progress.percentage}%)`);
        return result;
    } catch (error) {
        console.error('ジョブ取得エラー:', error);
        throw error;
    }
}

async function cancelJob(jobId: number) {
    try {
        const result = await postToMCPServer(`/search/jobs/${jobId}/cancel`, {});
        console.log('ジョブをキャンセルしました:', result.message);
        return result;
    } catch (error) {
        console.error('ジョブキャンセルエラー:', error);
        throw error;
    }
}
```

### プラグインの設定ファイル例（manifest.json）

```json
{
  "id": "your-plugin-id",
  "name": "Your Plugin Name",
  "version": "0.1.0",
  "minAppVersion": "0.15.0",
  "description": "MCPサーバーと連携するプラグイン",
  "author": "Your Name",
  "authorUrl": "",
  "fundingUrl": "",
  "isDesktopOnly": false
}
```

### プラグインのメインファイル例（main.ts）

```typescript
import { Plugin, Notice } from 'obsidian';

export default class MyPlugin extends Plugin {
    private readonly MCP_SERVER_URL = 'http://127.0.0.1:8000';

    async onload() {
        // サーバー接続確認
        await this.checkServerConnection();

        // コマンドの追加例
        this.addCommand({
            id: 'call-mcp-server',
            name: 'MCPサーバーを呼び出す',
            callback: async () => {
                await this.callMCPServer();
            },
        });

        // インデックス作成コマンド
        this.addCommand({
            id: 'create-index',
            name: 'インデックスを作成',
            callback: async () => {
                const vaultPath = this.app.vault.adapter.basePath;
                await this.createIndex(vaultPath);
            },
        });

        // 検索コマンド
        this.addCommand({
            id: 'search-documents',
            name: 'ドキュメントを検索',
            callback: async () => {
                // 検索ダイアログを表示してクエリを入力
                const query = await this.showSearchDialog();
                if (query) {
                    await this.searchDocuments(query);
                }
            },
        });
    }

    async checkServerConnection() {
        try {
            const response = await fetch(`${this.MCP_SERVER_URL}/health`);
            if (response.ok) {
                const data = await response.json();
                new Notice(`MCPサーバーに接続しました: ${data.status}`);
            } else {
                new Notice('MCPサーバーに接続できませんでした');
            }
        } catch (error) {
            new Notice('MCPサーバーが起動していない可能性があります');
            console.error('MCPサーバー接続エラー:', error);
        }
    }

    async callMCPServer() {
        try {
            const response = await fetch(`${this.MCP_SERVER_URL}/`);
            const data = await response.json();
            new Notice(`${data.message} (v${data.version})`);
        } catch (error) {
            new Notice('MCPサーバーへのリクエストが失敗しました');
            console.error('エラー:', error);
        }
    }

    async createIndex(directoryPath: string) {
        try {
            const response = await fetch(`${this.MCP_SERVER_URL}/search/index`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    directory_path: directoryPath,
                    clear_existing: false
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            new Notice(`インデックス作成を開始しました（ジョブID: ${data.job_id}）`);
            
            // 進捗を監視
            this.monitorJobProgress(data.job_id);
        } catch (error) {
            new Notice('インデックス作成に失敗しました');
            console.error('エラー:', error);
        }
    }

    async monitorJobProgress(jobId: number) {
        const checkInterval = setInterval(async () => {
            try {
                const response = await fetch(`${this.MCP_SERVER_URL}/search/jobs/${jobId}`);
                if (!response.ok) return;

                const job = await response.json();
                const progress = job.progress;

                if (job.status === 'completed') {
                    clearInterval(checkInterval);
                    new Notice(`インデックス作成が完了しました（${progress.total}ファイル）`);
                } else if (job.status === 'failed') {
                    clearInterval(checkInterval);
                    new Notice(`インデックス作成が失敗しました: ${job.error_message}`);
                } else if (job.status === 'processing') {
                    console.log(`進捗: ${progress.current}/${progress.total} (${progress.percentage}%)`);
                }
            } catch (error) {
                console.error('進捗確認エラー:', error);
            }
        }, 2000); // 2秒ごとに確認
    }

    async searchDocuments(query: string) {
        try {
            const encodedQuery = encodeURIComponent(query);
            const response = await fetch(`${this.MCP_SERVER_URL}/search/query?query=${encodedQuery}&limit=20`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log(`検索結果: ${data.total}件`);
            
            // 検索結果を表示（ここではコンソールに出力）
            data.results.forEach((result: any, index: number) => {
                console.log(`${index + 1}. ${result.file_path}`);
                console.log(`   ${result.snippet}`);
            });

            new Notice(`${data.total}件の検索結果が見つかりました`);
        } catch (error) {
            new Notice('検索に失敗しました');
            console.error('エラー:', error);
        }
    }

    async showSearchDialog(): Promise<string | null> {
        // 簡易的な検索ダイアログ（実際の実装では、より高度なUIを使用することを推奨）
        return prompt('検索キーワードを入力してください:');
    }
}
```

## エラーハンドリング

サーバーが起動していない場合や、ネットワークエラーが発生した場合のエラーハンドリングを行ってください：

```typescript
async function safeCallMCPServer(endpoint: string) {
    try {
        const response = await fetch(`${MCP_SERVER_URL}${endpoint}`);
        
        if (!response.ok) {
            throw new Error(`サーバーエラー: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        if (error instanceof TypeError && error.message.includes('fetch')) {
            // ネットワークエラー（サーバーが起動していない可能性）
            throw new Error('MCPサーバーに接続できません。サーバーが起動しているか確認してください。');
        }
        throw error;
    }
}
```

## 開発時の注意事項

1. **CORS設定**: サーバー側でCORSが有効になっているため、ブラウザからのリクエストも可能です
2. **localhost専用**: 現在の設定は `127.0.0.1` のみでリッスンしているため、同一マシンからのみアクセス可能です
3. **ポート番号**: デフォルトではポート `8000` を使用しています。変更する場合は `main.py` を編集してください

## 技術仕様

### 全文検索エンジン

- **データベース**: SQLite (FTS5拡張機能)
- **日本語解析**: Janome（分かち書き）
- **検索方式**: FTS5のMATCH構文を使用した高速全文検索
- **キュー管理**: 汎用的なジョブキュー管理システム（進捗追跡対応）

### ジョブステータス

ジョブは以下のステータスを持ちます：

- `pending`: 待機中
- `processing`: 処理中
- `completed`: 完了
- `failed`: 失敗
- `cancelled`: キャンセル済み

### 進捗情報

進捗情報には以下の情報が含まれます：

```json
{
  "current": 45,
  "total": 100,
  "percentage": 45.0,
  "message": "処理中: document.pdf"
}
```

## 実装のヒント

### インデックス作成の進捗監視

長時間かかるインデックス作成処理の場合、定期的にジョブステータスを確認することを推奨します：

```typescript
async function waitForJobCompletion(jobId: number): Promise<any> {
    while (true) {
        const job = await getJobStatus(jobId);
        
        if (job.status === 'completed') {
            return job.result;
        } else if (job.status === 'failed') {
            throw new Error(job.error_message);
        } else if (job.status === 'cancelled') {
            throw new Error('ジョブがキャンセルされました');
        }
        
        // 2秒待機してから再確認
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}
```

### エラーハンドリング

すべてのAPIリクエストで適切なエラーハンドリングを実装してください：

```typescript
async function safeApiCall<T>(
    apiCall: () => Promise<T>,
    errorMessage: string
): Promise<T | null> {
    try {
        return await apiCall();
    } catch (error) {
        console.error(`${errorMessage}:`, error);
        new Notice(`${errorMessage}: ${error.message}`);
        return null;
    }
}
```

## 次のステップ

MCPサーバーに新しいエンドポイントを追加する場合は、`main.py` を編集してください。新しいエンドポイントが追加されたら、このドキュメントも更新してください。

## サポート

問題が発生した場合：
1. サーバーが起動しているか確認（`start.bat`を実行）
2. ポート8000が使用可能か確認
3. ブラウザで `http://127.0.0.1:8000/docs` にアクセスしてサーバーが正常に動作しているか確認
4. インデックス作成の進捗は `http://127.0.0.1:8000/task/create_index` で確認できます
