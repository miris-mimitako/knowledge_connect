/**
 * Search Worker Manager
 * Web Workerの管理とメインスレッドとの通信を担当
 */

// Workerコードをインポート（ビルド時にインライン化される）
// このファイルはビルド時に自動生成される
let WORKER_CODE_IMPORT: { WORKER_CODE: string } | null = null;

// Workerコードを動的にインポート（ビルド時にバンドルされる）
async function loadWorkerCode(): Promise<string> {
	if (WORKER_CODE_IMPORT) {
		return WORKER_CODE_IMPORT.WORKER_CODE;
	}
	
	try {
		// ビルド時に生成されたWorkerコードをインポート
		WORKER_CODE_IMPORT = await import('../workers/worker-code');
		return WORKER_CODE_IMPORT.WORKER_CODE;
	} catch (error) {
		console.error('[SearchWorkerManager] Failed to import worker code:', error);
		throw error;
	}
}

export class SearchWorkerManager {
	private worker: Worker | null = null;
	private messageHandlers: Map<string, (payload: any) => void> = new Map();
	private isInitialized: boolean = false;
	private pluginBasePath: string | null = null;
	private plugin: any = null; // Obsidian Plugin instance
	private workerBlobUrl: string | null = null; // Blob URL for worker (for cleanup)

	constructor(immediate: boolean = false, pluginBasePath?: string, plugin?: any) {
		this.pluginBasePath = pluginBasePath || null;
		this.plugin = plugin || null;
		if (immediate) {
			// 即座に初期化（rebuildIndexなどで使用）
			this.initWorker();
		} else {
			// Workerの初期化を非同期で実行（UIをブロックしない）
			setTimeout(() => {
				this.initWorker();
			}, 0);
		}
	}

	/**
	 * Workerを初期化
	 * Obsidianの特殊な環境に対応するため、WorkerコードをBlobとしてインライン化
	 */
	private initWorker(): void {
		try {
			console.log('[SearchWorkerManager] Initializing worker with inline Blob method...');
			
			// Workerコードを文字列として取得（ビルド時にインライン化される）
			// この方法により、パス解決の問題を回避
			this.createWorkerFromInlineCode();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error('[SearchWorkerManager] Failed to initialize worker:', errorMessage, error);
			this.handleError(`Failed to initialize worker: ${errorMessage}`);
		}
	}

	/**
	 * Workerコードをインライン化してBlob URLから起動
	 * Workerコードはビルド時にmain.jsに埋め込まれている
	 */
	private async createWorkerFromInlineCode(): Promise<void> {
		try {
			// Workerコードを読み込む（ビルド時にインライン化される）
			console.log('[SearchWorkerManager] Loading worker code from inline module...');
			const workerCode = await loadWorkerCode();
			console.log('[SearchWorkerManager] Worker code loaded, length:', workerCode.length);
			
			// Blobを作成してURL化
			const blob = new Blob([workerCode], { type: 'application/javascript' });
			this.workerBlobUrl = URL.createObjectURL(blob);
			console.log('[SearchWorkerManager] Blob URL created:', this.workerBlobUrl);
			
			// Workerを起動
			this.worker = new Worker(this.workerBlobUrl);
			console.log('[SearchWorkerManager] Worker created successfully from Blob URL');
			
			// ハンドラーを設定
			this.setupWorkerHandlers();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error('[SearchWorkerManager] Failed to create worker from inline code:', errorMessage, error);
			// フォールバック: 直接Workerを試す（開発環境など）
			console.log('[SearchWorkerManager] Trying fallback: direct Worker creation');
			try {
				this.worker = new Worker('search-worker.js');
				console.log('[SearchWorkerManager] Worker created successfully with direct path');
				this.setupWorkerHandlers();
			} catch (directError) {
				console.error('[SearchWorkerManager] Direct Worker creation also failed:', directError);
				this.handleError(`Failed to create Worker: ${directError instanceof Error ? directError.message : String(directError)}`);
			}
		}
	}

	/**
	 * Workerのイベントハンドラーを設定
	 */
	private setupWorkerHandlers(): void {
		if (!this.worker) {
			console.error('[SearchWorkerManager] Cannot setup handlers: worker is null');
			return;
		}

		// Workerからのメッセージを受信
		this.worker.onmessage = (e: MessageEvent) => {
			this.handleWorkerMessage(e.data);
		};
		console.log('[SearchWorkerManager] Message handler registered');

		// Workerエラーを処理
		this.worker.onerror = (error: ErrorEvent) => {
			console.error('[SearchWorkerManager] Worker error event (onerror):', {
				message: error.message,
				filename: error.filename,
				lineno: error.lineno,
				colno: error.colno,
				error: error.error,
				target: error.target,
				type: error.type
			});
			// エラーメッセージを構築
			let errorMessage = 'Unknown error';
			if (error.message) {
				errorMessage = error.message;
			} else if (error.filename) {
				errorMessage = `Failed to load worker: ${error.filename}`;
			} else if (error.error) {
				errorMessage = String(error.error);
			}
			this.handleError(`Worker error: ${errorMessage}`);
		};

		// Workerのロードエラーを処理（より詳細なエラー情報）
		this.worker.addEventListener('error', (event: ErrorEvent) => {
			console.error('[SearchWorkerManager] Worker load error (addEventListener):', {
				message: event.message,
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
				error: event.error,
				target: event.target,
				type: event.type,
				bubbles: event.bubbles,
				cancelable: event.cancelable
			});
			// エラーメッセージを構築
			let errorMessage = 'Failed to load worker';
			if (event.message) {
				errorMessage = event.message;
			} else if (event.filename) {
				errorMessage = `Failed to load worker: ${event.filename}`;
			} else if (event.error) {
				errorMessage = `Failed to load worker: ${String(event.error)}`;
			}
			this.handleError(errorMessage);
		});

		// DB初期化（Workerが準備できてから送信）
		// Workerがメッセージを受信できるようになるまで少し待つ
		setTimeout(() => {
			if (this.worker) {
				console.log('[SearchWorkerManager] Sending INIT_DB message to worker...');
				this.sendMessage('INIT_DB');
			} else {
				console.error('[SearchWorkerManager] Worker is null, cannot send INIT_DB');
			}
		}, 200); // 200ms待機
	}

	/**
	 * Workerにメッセージを送信
	 */
	private sendMessage(type: string, payload?: any): void {
		if (!this.worker) {
			console.error('[SearchWorkerManager] Worker not initialized');
			return;
		}

		console.log('[SearchWorkerManager] Sending message to worker:', type, payload ? '(with payload)' : '(no payload)');
		try {
			this.worker.postMessage({ type, payload });
			console.log('[SearchWorkerManager] Message sent successfully');
		} catch (error) {
			console.error('[SearchWorkerManager] Failed to send message:', error);
			this.handleError(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Workerからのメッセージを処理
	 */
	private handleWorkerMessage(data: any): void {
		const { type, payload, error } = data;

		console.log('[SearchWorkerManager] Received message from worker:', type, payload ? '(with payload)' : '(no payload)');

		if (error) {
			console.error('[SearchWorkerManager] Worker message error:', error);
			this.handleError(error);
			return;
		}

		// 初期化完了
		if (type === 'INIT_DB_DONE') {
			console.log('[SearchWorkerManager] INIT_DB_DONE received, setting isInitialized = true');
			this.isInitialized = true;
			console.log('[SearchWorkerManager] DB initialized successfully');
		}

		// 登録されたハンドラーを実行
		const handler = this.messageHandlers.get(type);
		if (handler) {
			console.log('[SearchWorkerManager] Executing handler for type:', type);
			handler(payload);
		} else {
			console.log('[SearchWorkerManager] No handler registered for type:', type);
		}
	}

	/**
	 * エラーハンドリング
	 */
	private handleError(error: string): void {
		console.error('[SearchWorker] Error:', error);
		// エラーが発生した場合、初期化フラグをリセットしない（リトライ可能にする）
		// エラーハンドラーが登録されていれば実行
		const errorHandler = this.messageHandlers.get('ERROR');
		if (errorHandler) {
			errorHandler({ error });
		}
	}

	/**
	 * メッセージハンドラーを登録
	 */
	on(type: string, handler: (payload: any) => void): void {
		this.messageHandlers.set(type, handler);
	}

	/**
	 * メッセージハンドラーを削除
	 */
	off(type: string): void {
		this.messageHandlers.delete(type);
	}

	/**
	 * ドキュメントを追加
	 */
	async addDocument(
		filePath: string,
		title: string,
		content: string,
		vector: number[],
		metadata?: any
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const handler = (payload: any) => {
				if (payload.success) {
					resolve();
				} else {
					reject(new Error('Failed to add document'));
				}
				this.off('DOCUMENT_ADDED');
			};

			this.on('DOCUMENT_ADDED', handler);
			this.sendMessage('ADD_DOCUMENT', {
				filePath,
				title,
				content,
				vector,
				metadata,
			});
		});
	}

	/**
	 * ドキュメントを更新
	 */
	async updateDocument(
		filePath: string,
		title: string,
		content: string,
		vector: number[],
		metadata?: any
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const handler = (payload: any) => {
				if (payload.success) {
					resolve();
				} else {
					reject(new Error('Failed to update document'));
				}
				this.off('DOCUMENT_UPDATED');
			};

			this.on('DOCUMENT_UPDATED', handler);
			this.sendMessage('UPDATE_DOCUMENT', {
				filePath,
				title,
				content,
				vector,
				metadata,
			});
		});
	}

	/**
	 * ドキュメントを削除
	 */
	async removeDocument(filePath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const handler = (payload: any) => {
				if (payload.success) {
					resolve();
				} else {
					reject(new Error('Failed to remove document'));
				}
				this.off('DOCUMENT_REMOVED');
			};

			this.on('DOCUMENT_REMOVED', handler);
			this.sendMessage('REMOVE_DOCUMENT', { filePath });
		});
	}

	/**
	 * キーワード検索
	 */
	async searchKeyword(query: string, limit: number = 20): Promise<any> {
		return new Promise((resolve, reject) => {
			const handler = (payload: any) => {
				resolve(payload);
				this.off('SEARCH_KEYWORD_RESULTS');
			};

			this.on('SEARCH_KEYWORD_RESULTS', handler);
			this.sendMessage('SEARCH_KEYWORD', { query, limit });
		});
	}

	/**
	 * ベクトル検索
	 */
	async searchVector(vector: number[], limit: number = 10): Promise<any> {
		return new Promise((resolve, reject) => {
			const handler = (payload: any) => {
				resolve(payload);
				this.off('SEARCH_VECTOR_RESULTS');
			};

			this.on('SEARCH_VECTOR_RESULTS', handler);
			this.sendMessage('SEARCH_VECTOR', { vector, limit });
		});
	}

	/**
	 * ハイブリッド検索
	 */
	async searchHybrid(
		query: string,
		vector: number[],
		limit: number = 10
	): Promise<any> {
		return new Promise((resolve, reject) => {
			const handler = (payload: any) => {
				resolve(payload);
				this.off('SEARCH_HYBRID_RESULTS');
			};

			this.on('SEARCH_HYBRID_RESULTS', handler);
			this.sendMessage('SEARCH_HYBRID', { query, vector, limit });
		});
	}

	/**
	 * Workerが初期化されているか確認
	 */
	isReady(): boolean {
		return this.isInitialized;
	}

	/**
	 * インデックスを保存
	 * Worker内でシリアライズし、メインスレッドでファイルに保存
	 */
	async saveIndex(): Promise<ArrayBuffer> {
		return new Promise((resolve, reject) => {
			const handler = (payload: any) => {
				if (payload.data) {
					resolve(payload.data);
				} else {
					reject(new Error('Failed to save index'));
				}
				this.off('INDEX_SAVED');
			};

			this.on('INDEX_SAVED', handler);
			this.sendMessage('SAVE_INDEX');
		});
	}

	/**
	 * インデックスを読み込み
	 */
	async loadIndex(data: ArrayBuffer, vectorDimensions?: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const handler = (payload: any) => {
				if (payload.success) {
					this.isInitialized = true;
					resolve();
				} else {
					reject(new Error('Failed to load index'));
				}
				this.off('INDEX_LOADED');
			};

			this.on('INDEX_LOADED', handler);
			this.sendMessage('LOAD_INDEX', { data, vectorDimensions });
		});
	}

	/**
	 * ファイルをベクトル化してOramaに登録
	 */
	async vectorizeFile(
		filePath: string,
		title: string,
		content: string,
		metadata: any,
		apiKey: string,
		model: string,
		timeoutSeconds: number = 60
	): Promise<{ dimensions: number }> {
		return new Promise((resolve, reject) => {
			const handler = (payload: any) => {
				if (payload.success) {
					resolve({ dimensions: payload.dimensions });
				} else {
					reject(new Error('Failed to vectorize file'));
				}
				this.off('FILE_VECTORIZED');
			};

			this.on('FILE_VECTORIZED', handler);
			this.sendMessage('VECTORIZE_FILE', {
				filePath,
				title,
				content,
				metadata,
				apiKey,
				model,
				timeoutSeconds,
			});
		});
	}

	/**
	 * ドキュメントの存在確認
	 */
	async checkDocumentExists(filePath: string): Promise<boolean> {
		return new Promise((resolve, reject) => {
			const handler = (payload: any) => {
				resolve(payload.exists === true);
				this.off('CHECK_DOCUMENT_EXISTS_RESULT');
			};

			this.on('CHECK_DOCUMENT_EXISTS_RESULT', handler);
			this.sendMessage('CHECK_DOCUMENT_EXISTS', { filePath });
		});
	}

	/**
	 * Workerを終了
	 */
	terminate(): void {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
			this.isInitialized = false;
		}
	}
}

