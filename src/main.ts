/**
 * Knowledge Connect Plugin
 * Obsidian用のAI統合プラグイン
 */

import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings";
import { KnowledgeConnectSettingTab } from "./settings-tab";
import type { KnowledgeConnectSettings } from "./types";
import { AIServiceFactory } from "./services/ai-service-factory";
import type { AIService } from "./services/ai-service-interface";
import { ChatView, CHAT_VIEW_TYPE } from "./views/chat-view";
import { SummaryView, SUMMARY_VIEW_TYPE } from "./views/summary-view";
import { SearchView, SEARCH_VIEW_TYPE } from "./views/search-view";
import { registerCommands } from "./commands";
import { registerContextMenu } from "./context-menu";
import { registerEditorSummarizeButton } from "./utils/editor-summarize-button";

export default class KnowledgeConnectPlugin extends Plugin {
	settings: KnowledgeConnectSettings;
	private aiService: AIService | null = null;
	private searchService: SearchService | null = null;
	private vectorStatusManager: VectorStatusManager | null = null;
	private fileWatcher: FileWatcher | null = null;
	private debouncer: Debouncer | null = null;
	private vectorizationQueue: VectorizationQueue | null = null;
	private vectorizationStatusBar: VectorizationStatusBar | null = null;
	private cacheManager: CacheManager | null = null;

	async onload() {
		try {
			await this.loadSettings();

			// 設定タブを追加
			this.addSettingTab(new KnowledgeConnectSettingTab(this.app, this));

			// AIサービスを初期化（エラーが発生してもプラグインは起動を続行）
			this.initializeAIService();

			// Viewを登録
			this.registerView(
				CHAT_VIEW_TYPE,
				(leaf) => new ChatView(leaf, this)
			);
			this.registerView(
				SUMMARY_VIEW_TYPE,
				(leaf) => new SummaryView(leaf, this)
			);
			this.registerView(
				SEARCH_VIEW_TYPE,
				(leaf) => new SearchView(leaf, this)
			);

			// コマンドを登録
			registerCommands(this);

			// コンテキストメニューを登録
			registerContextMenu(this);

			// エディタに要約ボタンを追加
			registerEditorSummarizeButton(this);

			console.log("Knowledge Connect Plugin loaded");
		} catch (error) {
			// 起動時のエラーをログに記録（プラグインは可能な限り起動を続行）
			console.error("[Knowledge Connect] プラグインの起動中にエラーが発生しました:", error);
			// エラーが発生しても基本的な機能は利用可能にするため、ここではエラーを再スローしない
		}
	}

	onunload() {
		this.aiService = null;
		
		// 検索サービスを終了
		if (this.searchService) {
			this.searchService.terminate().catch((error) => {
				console.error("[Knowledge Connect] Failed to terminate search service:", error);
			});
			this.searchService = null;
		}

		// ベクトル状態マネージャーをクリア
		if (this.vectorStatusManager) {
			this.vectorStatusManager.clearAllIcons();
			this.vectorStatusManager = null;
		}

		// ファイル変更監視を停止
		if (this.fileWatcher) {
			this.fileWatcher.stop();
			this.fileWatcher = null;
		}

		// デバウンス処理をクリア
		if (this.debouncer) {
			this.debouncer.cancelAll();
			this.debouncer = null;
		}

		// ベクトル化キューをクリア
		if (this.vectorizationQueue) {
			this.vectorizationQueue.destroy();
			this.vectorizationQueue = null;
		}

		console.log("Knowledge Connect Plugin unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// 設定読み込み後にAIサービスを再初期化
		this.initializeAIService();
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// 設定保存後にAIサービスを再初期化
		this.initializeAIService();
	}

	/**
	 * AIサービスを初期化
	 * エラーが発生してもプラグインは正常に動作する（AIサービスはnullのまま）
	 */
	private initializeAIService(): void {
		try {
			if (AIServiceFactory.isServiceAvailable(this.settings)) {
				this.aiService = AIServiceFactory.createService(this.settings);
				console.log(`[Knowledge Connect] AI Service initialized: ${this.aiService.getServiceName()}`);
			} else {
				this.aiService = null;
				console.log("[Knowledge Connect] AI Service not available: API key not set");
			}
		} catch (error) {
			// エラーが発生してもプラグインは起動を続行
			this.aiService = null;
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			console.error(`[Knowledge Connect] Failed to initialize AI service: ${errorMessage}`);
			console.error("[Knowledge Connect] プラグインはAIサービスなしで動作します。設定画面で接続を確認してください。");
		}
	}

	/**
	 * AIサービスインスタンスを取得
	 */
	getAIService(): AIService | null {
		return this.aiService;
	}

	/**
	 * AIサービスが利用可能か確認
	 */
	isAIServiceAvailable(): boolean {
		return this.aiService !== null && this.aiService.isApiKeySet();
	}

	/**
	 * 検索サービスを初期化
	 */
	private async initializeSearchService(): Promise<void> {
		try {
			// SearchServiceインスタンスを作成（初期化は非同期）
			this.searchService = new SearchService(this);
			
			// 初期化を開始（エラーが発生してもプラグインは起動を続行）
			this.searchService.initialize().then(() => {
				// ベクトル状態マネージャーを初期化
				const workerManager = this.searchService?.getWorkerManager();
				if (workerManager && this.searchService) {
					this.vectorStatusManager = new VectorStatusManager(this);
					this.vectorStatusManager.initialize(workerManager);
				}

				console.log("[Knowledge Connect] Search service initialized");
			}).catch((error) => {
				console.error("[Knowledge Connect] Failed to initialize search service:", error);
				// エラーが発生してもプラグインは起動を続行
			});
		} catch (error) {
			console.error("[Knowledge Connect] Failed to create search service:", error);
			// エラーが発生してもプラグインは起動を続行
		}
	}

	/**
	 * 検索サービスを取得
	 */
	getSearchService(): SearchService | null {
		return this.searchService;
	}

	/**
	 * ベクトル状態マネージャーを取得
	 */
	getVectorStatusManager(): VectorStatusManager | null {
		return this.vectorStatusManager;
	}

	/**
	 * ファイル変更監視を初期化
	 */
	private initializeFileWatcher(): void {
		try {
			// デバウンス処理を初期化（デフォルト3秒）
			this.debouncer = new Debouncer(3000);

			// キャッシュマネージャーを初期化
			this.cacheManager = new CacheManager();

			// ベクトル化キューを初期化（設定から同時実行数を取得）
			const concurrency = this.settings.vectorizationConcurrency || 2;
			this.vectorizationQueue = new VectorizationQueue(concurrency, this);

			// ベクトル化処理関数を設定
			this.vectorizationQueue.setVectorizationFunction(async (item) => {
				await this.processVectorization(item);
			});

			// ステータスバーを初期化
			this.vectorizationStatusBar = new VectorizationStatusBar(this);
			this.vectorizationStatusBar.setQueue(this.vectorizationQueue);
			this.vectorizationStatusBar.initialize();

			// キューの読み込みを遅延実行（起動をブロックしない）
			setTimeout(() => {
				if (this.vectorizationQueue) {
					this.vectorizationQueue.load().catch((error) => {
						console.error("[Knowledge Connect] Failed to load vectorization queue:", error);
					});
				}
			}, 1000);

			// 初期インデックス構築は自動実行しない（ユーザーが明示的に開始ボタンを押すまで待機）

			// ファイル変更監視を開始
			this.fileWatcher = new FileWatcher(this);
			this.fileWatcher.start();

			// ファイル変更イベントのハンドラーを登録（デバウンス処理付き）
			this.fileWatcher.on(async (event: FileChangeEvent) => {
				if (!event.file) {
					return;
				}

				// Markdownファイルのみを処理
				if (!event.file.path.endsWith('.md')) {
					return;
				}

				// 除外リストをチェック
				const excludedPaths = this.settings.excludedFolders || [];
				if (isExcluded(event.file.path, excludedPaths)) {
					return;
				}

				// デバウンス処理を実行
				// modify/createイベントの場合はベクトル化キューに追加
				// delete/renameイベントの場合は即座に処理（デバウンス不要）
				if (event.type === 'modify' || event.type === 'create') {
					// キャッシュをチェック（変更がない場合はスキップ）
					if (this.cacheManager && !this.cacheManager.isFileChanged(event.file)) {
						console.log(`[FileWatcher] File unchanged, skipping: ${event.file.path}`);
						return;
					}

					// デバウンス処理（3秒待機）
					this.debouncer?.debounce(
						event.file.path,
						async () => {
							// キューに追加（modify/createはhigh優先度）
							if (this.vectorizationQueue) {
								this.vectorizationQueue.add(event.file!, 'high');
								// キャッシュを更新
								if (this.cacheManager) {
									this.cacheManager.updateCache(event.file!);
								}
								console.log(
									`[FileWatcher] Added to queue (debounced): ${event.file!.path}`
								);
							}
						},
						{ delay: 3000 } // 3秒待機
					);
				} else if (event.type === 'delete') {
					// 削除は即座に処理（デバウンス不要）
					if (event.file && this.searchService) {
						this.searchService.removeDocument(event.file.path).catch((error) => {
							console.error(
								`[FileWatcher] Failed to remove document: ${event.file!.path}`,
								error
							);
						});
						console.log(`[FileWatcher] File deleted: ${event.file.path}`);
					}
				} else if (event.type === 'rename') {
					// リネームは即座に処理（デバウンス不要）
					// 旧パスで削除、新パスで追加（またはキューに追加）
					if (event.file && event.oldPath && this.searchService) {
						// 除外リストの更新（フォルダ名変更への追従）
						if (this.settings.excludedFolders) {
							const oldIndex = this.settings.excludedFolders.indexOf(event.oldPath);
							if (oldIndex >= 0) {
								// 旧パスを新パスに置き換え
								this.settings.excludedFolders[oldIndex] = event.file.path;
								await this.saveSettings();
								console.log(
									`[FileWatcher] Updated excluded folder: ${event.oldPath} -> ${event.file.path}`
								);
							}
						}

						// 旧パスで削除
						this.searchService.removeDocument(event.oldPath).catch((error) => {
							console.error(
								`[FileWatcher] Failed to remove old document: ${event.oldPath}`,
								error
							);
						});

						// 新パスでキューに追加（ベクトル化が必要、除外されていない場合のみ）
						if (this.vectorizationQueue) {
							const excludedPaths = this.settings.excludedFolders || [];
							if (!isExcluded(event.file.path, excludedPaths)) {
								this.vectorizationQueue.add(event.file, 'high');
								console.log(
									`[FileWatcher] File renamed, added to queue: ${event.oldPath} -> ${event.file.path}`
								);
							}
						}
					}
				}
			});

			console.log("[Knowledge Connect] File watcher initialized");
		} catch (error) {
			console.error("[Knowledge Connect] Failed to initialize file watcher:", error);
			// エラーが発生してもプラグインは起動を続行
		}
	}

	/**
	 * ファイル変更監視を取得
	 */
	getFileWatcher(): FileWatcher | null {
		return this.fileWatcher;
	}

	/**
	 * 初期インデックス構築（既存ファイルのスキャン）
	 */
	private async performInitialIndexing(): Promise<void> {
		try {
			// 検索サービスが準備できているか確認
			if (!this.searchService || !this.searchService.isReady()) {
				console.log('[Knowledge Connect] Search service not ready, skipping initial indexing');
				return;
			}

			// インデックスが既に存在するか確認
			const workerManager = this.searchService.getWorkerManager();
			if (!workerManager) {
				return;
			}

			// 既存のインデックスファイルがある場合はスキップ
			const { indexFileExists } = await import('./utils/index-persistence');
			if (await indexFileExists(this)) {
				console.log('[Knowledge Connect] Index file exists, skipping initial indexing');
				return;
			}

			console.log('[Knowledge Connect] Starting initial indexing...');

			// すべてのMarkdownファイルを取得
			const markdownFiles = this.app.vault.getMarkdownFiles();

			// 除外リストを取得
			const excludedPaths = this.settings.excludedFolders || [];

			// 除外されていないファイルのみをフィルタリング
			const filesToIndex = markdownFiles.filter((file) => {
				return !isExcluded(file.path, excludedPaths);
			});

			console.log(
				`[Knowledge Connect] Found ${filesToIndex.length} files to index (out of ${markdownFiles.length} total)`
			);

			// ベクトル化キューに追加（低優先度でバックグラウンド処理）
			if (this.vectorizationQueue) {
				let addedCount = 0;
				for (const file of filesToIndex) {
					// 既にベクトル化済みか確認
					const exists = await this.searchService.checkDocumentExists(file.path);
					if (!exists) {
						this.vectorizationQueue.add(file, 'low');
						addedCount++;
					}
				}
				console.log(
					`[Knowledge Connect] Added ${addedCount} files to vectorization queue`
				);
			}
		} catch (error) {
			console.error('[Knowledge Connect] Failed to perform initial indexing:', error);
		}
	}

	/**
	 * ベクトル化処理を実行
	 */
	private async processVectorization(item: any): Promise<void> {
		if (!this.searchService || !this.searchService.isReady()) {
			throw new Error('Search service not ready');
		}

		const workerManager = this.searchService.getWorkerManager();
		if (!workerManager || !workerManager.isReady()) {
			throw new Error('Worker Manager not ready');
		}

		// ファイルの内容を読み込み
		const content = await this.app.vault.read(item.file);

		// タイトルを取得
		const title = item.file.basename || item.file.name.replace(/\.md$/, '');

		// メタデータを構築
		const metadata = {
			filePath: item.filePath,
			fileName: item.file.name,
			lastModified: item.file.stat.mtime,
			fileSize: item.file.stat.size,
			vectorized: true,
			vectorizedAt: Date.now(),
			vectorModel: this.settings.embeddingModel || 'openai/text-embedding-ada-002',
		};

		// APIキーを取得
		const apiKey = this.settings.openrouterApiKey || this.settings.apiKey || '';
		if (!apiKey) {
			throw new Error('APIキーが設定されていません。');
		}

		// モデルを取得
		const model = this.settings.embeddingModel || 'openai/text-embedding-ada-002';

		// Workerでベクトル化処理を実行
		await workerManager.vectorizeFile(
			item.filePath,
			title,
			content,
			metadata,
			apiKey,
			model,
			this.settings.timeoutSeconds || 60
		);

		// ベクトル化完了後、ベクトル状態マネージャーを更新
		if (this.vectorStatusManager) {
			await this.vectorStatusManager.refreshFileStatus(item.filePath);
		}
	}
}

