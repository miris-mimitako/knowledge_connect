/**
 * Search Service
 * 検索機能の統合サービス
 * Worker ManagerとPersistence Managerを統合
 */

import { Plugin } from 'obsidian';
import { SearchWorkerManager } from '../workers/search-worker-manager';
import {
	saveIndexToFile,
	loadIndexFromFile,
	indexFileExists,
	deleteIndexFile,
} from '../utils/index-persistence';
import { DEFAULT_VECTOR_DIMENSIONS } from '../workers/orama-schema';

export class SearchService {
	private plugin: Plugin;
	private workerManager: SearchWorkerManager | null = null;
	private isInitialized: boolean = false;
	private initializationError: string | null = null;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	/**
	 * プラグインのベースパスを取得
	 */
	private getPluginBasePath(): string | null {
		try {
			// ObsidianのプラグインAPIからプラグインのIDを取得
			const pluginId = this.plugin.manifest?.id || 'knowledge-connect';
			// プラグインのディレクトリパスを構築
			// Obsidianでは、プラグインは .obsidian/plugins/{plugin-id}/ に配置される
			// ただし、Workerファイルはプラグインのルートディレクトリからの相対パスで読み込まれる
			return null; // nullを返すと、相対パスを使用
		} catch (error) {
			console.error('[SearchService] Failed to get plugin base path:', error);
			return null;
		}
	}

	/**
	 * サービスを初期化（段階的ロード）
	 */
	async initialize(): Promise<void> {
		try {
			console.log('[SearchService] Starting initialization...');
			
			// プラグインのベースパスを取得
			const pluginBasePath = this.getPluginBasePath();
			console.log('[SearchService] Plugin base path:', pluginBasePath || 'using relative path');
			
			// Worker Managerを初期化（プラグインインスタンスを渡す）
			this.workerManager = new SearchWorkerManager(false, pluginBasePath || undefined, this.plugin);
			console.log('[SearchService] WorkerManager created');

			// Workerが初期化されるまで待機（タイムアウトを延長）
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					console.error('[SearchService] Worker initialization timeout after 60 seconds');
					console.error('[SearchService] Worker state:', {
						hasWorker: this.workerManager !== null,
						isInitialized: this.workerManager?.isReady() === true,
						workerManagerType: typeof this.workerManager,
					});
					reject(new Error('Worker initialization timeout (60s). Please check the console for detailed error messages.'));
				}, 60000); // 60秒に延長

				let checkCount = 0;
				const maxChecks = 600; // 最大60秒（100ms * 600）

				const checkReady = () => {
					checkCount++;
					const isReady = this.workerManager?.isReady();
					
					if (isReady) {
						clearTimeout(timeout);
						console.log(`[SearchService] Worker ready after ${checkCount * 100}ms`);
						resolve();
					} else if (checkCount >= maxChecks) {
						clearTimeout(timeout);
						console.error('[SearchService] Worker initialization timeout (max checks reached)');
						console.error('[SearchService] Final state:', {
							hasWorker: this.workerManager !== null,
							isInitialized: this.workerManager?.isReady() === true,
						});
						reject(new Error('Worker initialization timeout (max checks reached)'));
					} else {
						// 10回ごとにログを出力
						if (checkCount % 10 === 0) {
							console.log(`[SearchService] Waiting for worker initialization... (${checkCount * 100}ms)`, {
								hasWorker: this.workerManager !== null,
								isInitialized: this.workerManager?.isReady() === false,
							});
						}
						setTimeout(checkReady, 100);
					}
				};

				// 最初のチェックを少し遅らせる（Worker初期化の時間を確保）
				setTimeout(checkReady, 500);
			});

			// 既存のインデックスファイルがあれば非同期で読み込み
			this.loadIndexAsync();

			this.isInitialized = true;
			this.initializationError = null;
			console.log('[SearchService] Search service initialized (index loading in background)');
		} catch (error) {
			console.error('[SearchService] Failed to initialize:', error);
			this.initializationError = error instanceof Error ? error.message : String(error);
			throw error;
		}
	}

	/**
	 * インデックスを非同期で読み込み（段階的ロード）
	 */
	private async loadIndexAsync(): Promise<void> {
		try {
			if (await indexFileExists(this.plugin)) {
				console.log('[SearchService] Loading existing index (background)...');
				const data = await loadIndexFromFile(this.plugin);
				if (data && this.workerManager) {
					await this.workerManager.loadIndex(data, DEFAULT_VECTOR_DIMENSIONS);
					console.log('[SearchService] Index loaded successfully');
				}
			} else {
				console.log('[SearchService] No existing index found');
			}
		} catch (error) {
			console.error('[SearchService] Failed to load index:', error);
			// エラーが発生してもサービスは利用可能（空のインデックスで開始）
		}
	}

	/**
	 * インデックスの準備状態を確認
	 */
	isIndexReady(): boolean {
		return this.isInitialized && this.workerManager?.isReady() === true;
	}

	/**
	 * インデックスを保存
	 */
	async saveIndex(): Promise<void> {
		if (!this.workerManager || !this.isInitialized) {
			throw new Error('Search service not initialized');
		}

		try {
			// Worker内でシリアライズ
			const data = await this.workerManager.saveIndex();
			
			// ファイルに保存
			await saveIndexToFile(this.plugin, data);
			console.log('[SearchService] Index saved successfully');
		} catch (error) {
			console.error('[SearchService] Failed to save index:', error);
			throw error;
		}
	}

	/**
	 * Worker Managerを取得
	 */
	getWorkerManager(): SearchWorkerManager | null {
		return this.workerManager;
	}

	/**
	 * サービスが初期化されているか確認
	 */
	isReady(): boolean {
		return this.isInitialized && this.workerManager?.isReady() === true;
	}

	/**
	 * サービスが初期化されるまで待機
	 */
	async waitUntilReady(timeoutMs: number = 30000): Promise<boolean> {
		if (this.isReady()) {
			return true;
		}

		return new Promise<boolean>((resolve) => {
			const startTime = Date.now();
			const checkInterval = setInterval(() => {
				if (this.isReady()) {
					clearInterval(checkInterval);
					resolve(true);
				} else if (Date.now() - startTime > timeoutMs) {
					clearInterval(checkInterval);
					resolve(false);
				}
			}, 100);
		});
	}

	/**
	 * 初期化状態を取得
	 */
	getInitializationStatus(): {
		isInitialized: boolean;
		isReady: boolean;
		hasWorker: boolean;
		workerReady: boolean;
		error: string | null;
	} {
		return {
			isInitialized: this.isInitialized,
			isReady: this.isReady(),
			hasWorker: this.workerManager !== null,
			workerReady: this.workerManager?.isReady() === true,
			error: this.initializationError,
		};
	}

	/**
	 * ドキュメントの存在確認
	 */
	async checkDocumentExists(filePath: string): Promise<boolean> {
		if (!this.workerManager || !this.isInitialized) {
			return false;
		}

		try {
			return await this.workerManager.checkDocumentExists(filePath);
		} catch (error) {
			console.error('[SearchService] Failed to check document exists:', error);
			return false;
		}
	}

	/**
	 * ドキュメントを削除
	 */
	async removeDocument(filePath: string): Promise<void> {
		if (!this.workerManager || !this.isInitialized) {
			throw new Error('Search service not initialized');
		}

		try {
			await this.workerManager.removeDocument(filePath);
			console.log(`[SearchService] Document removed: ${filePath}`);
		} catch (error) {
			console.error(`[SearchService] Failed to remove document: ${filePath}`, error);
			throw error;
		}
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
		if (!this.workerManager || !this.isInitialized) {
			throw new Error('Search service not initialized');
		}

		try {
			await this.workerManager.updateDocument(filePath, title, content, vector, metadata);
			console.log(`[SearchService] Document updated: ${filePath}`);
		} catch (error) {
			console.error(`[SearchService] Failed to update document: ${filePath}`, error);
			throw error;
		}
	}

	/**
	 * インデックスを全再構築（Rebuild Index）
	 */
	async rebuildIndex(): Promise<void> {
		if (!this.workerManager || !this.isInitialized) {
			throw new Error('Search service not initialized');
		}

		try {
			// 既存のインデックスをクリア
			console.log('[SearchService] Rebuilding index...');

			// インデックスファイルを削除
			await deleteIndexFile(this.plugin);

			// Workerを再初期化（即座に初期化）
			this.workerManager.terminate();
			const pluginBasePath = this.getPluginBasePath();
			this.workerManager = new SearchWorkerManager(true, pluginBasePath || undefined, this.plugin); // immediate = true
			
			// Workerが初期化されるまで待機
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error('Worker initialization timeout'));
				}, 10000);

				let checkCount = 0;
				const maxChecks = 100; // 最大10秒（100ms * 100）

				const checkReady = () => {
					checkCount++;
					if (this.workerManager?.isReady()) {
						clearTimeout(timeout);
						resolve();
					} else if (checkCount >= maxChecks) {
						clearTimeout(timeout);
						reject(new Error('Worker initialization timeout'));
					} else {
						setTimeout(checkReady, 100);
					}
				};

				// 最初のチェックを少し遅らせる（Worker初期化の時間を確保）
				setTimeout(checkReady, 200);
			});

			// 新しいインデックスを初期化
			this.isInitialized = true;
			console.log('[SearchService] Index rebuild completed');
		} catch (error) {
			console.error('[SearchService] Failed to rebuild index:', error);
			// エラーが発生してもサービスは利用可能（空のインデックスで開始）
			this.isInitialized = true;
			throw error;
		}
	}

	/**
	 * 全ファイルをベクトル化キューに追加（初期インデックス構築用）
	 */
	async startInitialIndexing(plugin: any): Promise<number> {
		try {
			// すべてのMarkdownファイルを取得
			const markdownFiles = plugin.app.vault.getMarkdownFiles();

			// 除外リストを取得
			const excludedPaths = plugin.settings.excludedFolders || [];
			const { isExcluded } = await import('../utils/exclusion-list');

			// 除外されていないファイルのみをフィルタリング
			const filesToIndex = markdownFiles.filter((file: any) => {
				return !isExcluded(file.path, excludedPaths);
			});

			// 既にベクトル化済みのファイルを除外
			let addedCount = 0;
			for (const file of filesToIndex) {
				const exists = await this.checkDocumentExists(file.path);
				if (!exists) {
					// ベクトル化キューに追加（プラグイン経由）
					if (plugin.vectorizationQueue) {
						plugin.vectorizationQueue.add(file, 'low');
						addedCount++;
					}
				}
			}

			console.log(
				`[SearchService] Added ${addedCount} files to vectorization queue (out of ${filesToIndex.length} files)`
			);

			return addedCount;
		} catch (error) {
			console.error('[SearchService] Failed to start initial indexing:', error);
			throw error;
		}
	}

	/**
	 * サービスを終了
	 */
	async terminate(): Promise<void> {
		if (this.workerManager) {
			// 終了前にインデックスを保存
			try {
				await this.saveIndex();
			} catch (error) {
				console.error('[SearchService] Failed to save index on terminate:', error);
			}

			this.workerManager.terminate();
			this.workerManager = null;
			this.isInitialized = false;
		}
	}
}

