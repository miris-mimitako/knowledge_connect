/**
 * Vectorization Handler
 * ベクトル化処理の統合ハンドラー
 * VectorizationQueueとSearchWorkerManagerを統合
 */

import { Plugin, TFile } from 'obsidian';
import { QueueItem, VectorizationQueue } from './vectorization-queue';
import { SearchWorkerManager } from '../workers/search-worker-manager';
import { extractTextFromMarkdown, extractTitleFromFileName } from '../utils/text-processor';
import { KnowledgeConnectSettings } from '../types';

/**
 * ベクトル化ハンドラー
 */
export class VectorizationHandler {
	private plugin: Plugin;
	private queue: VectorizationQueue;
	private workerManager: SearchWorkerManager | null = null;
	private settings: KnowledgeConnectSettings;

	constructor(plugin: Plugin, settings: KnowledgeConnectSettings) {
		this.plugin = plugin;
		this.settings = settings;
		this.queue = new VectorizationQueue(2, plugin); // 同時実行数2

		// ベクトル化処理関数を設定
		this.queue.setVectorizationFunction(async (item: QueueItem) => {
			await this.processVectorization(item);
		});
	}

	/**
	 * Worker Managerを設定
	 */
	setWorkerManager(workerManager: SearchWorkerManager): void {
		this.workerManager = workerManager;
	}

	/**
	 * ベクトル化処理を実行
	 */
	private async processVectorization(item: QueueItem): Promise<void> {
		if (!this.workerManager) {
			throw new Error('Worker Manager not initialized');
		}

		if (!this.workerManager.isReady()) {
			throw new Error('Worker not ready');
		}

		// ファイルの内容を読み込み
		const content = await this.plugin.app.vault.read(item.file);
		
		// タイトルを取得（ファイル名から抽出、またはメタデータから）
		const title = item.file.basename || extractTitleFromFileName(item.file.name);

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
		await this.workerManager.vectorizeFile(
			item.filePath,
			title,
			content,
			metadata,
			apiKey,
			model,
			this.settings.timeoutSeconds
		);
	}

	/**
	 * ファイルをキューに追加
	 */
	addFile(file: TFile, priority: 'high' | 'low' = 'low'): void {
		this.queue.add(file, priority);
	}

	/**
	 * キューの進捗を取得
	 */
	getProgress() {
		return this.queue.getProgress();
	}

	/**
	 * キューのアイテム一覧を取得
	 */
	getItems() {
		return this.queue.getItems();
	}

	/**
	 * イベントハンドラーを設定
	 */
	setHandlers(handlers: any): void {
		this.queue.setHandlers(handlers);
	}

	/**
	 * キューを読み込み（プラグイン起動時）
	 */
	async loadQueue(): Promise<void> {
		await this.queue.load();
	}

	/**
	 * キューをクリア
	 */
	async clearQueue(): Promise<void> {
		await this.queue.clear();
	}

	/**
	 * リソースをクリーンアップ
	 */
	destroy(): void {
		this.queue.destroy();
	}
}

