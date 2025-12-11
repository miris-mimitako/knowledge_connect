/**
 * Vectorization Queue
 * ベクトル化処理のキュー管理
 * 同時実行数制御、優先度管理、FIFO方式を実装
 */

import { TFile, Plugin } from 'obsidian';
import type { KnowledgeConnectSettings } from '../types';
import { saveQueue, loadQueue, type SerializableQueueItem } from './queue-persistence';

/**
 * キューの優先度
 */
export type QueuePriority = 'high' | 'low';

/**
 * キューのアイテムステータス
 */
export type QueueItemStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * キューアイテム
 */
export interface QueueItem {
	/** ファイルパス */
	filePath: string;
	/** ファイルオブジェクト */
	file: TFile;
	/** 優先度 */
	priority: QueuePriority;
	/** ステータス */
	status: QueueItemStatus;
	/** リトライ回数 */
	retryCount: number;
	/** 最後のエラー */
	lastError?: string;
	/** 追加日時（Unix timestamp） */
	addedAt: number;
	/** 処理開始日時（Unix timestamp） */
	startedAt?: number;
	/** 完了日時（Unix timestamp） */
	completedAt?: number;
}

/**
 * キューの進捗情報
 */
export interface QueueProgress {
	/** 総数 */
	total: number;
	/** 処理中 */
	processing: number;
	/** 完了 */
	completed: number;
	/** 失敗 */
	failed: number;
	/** 待機中 */
	pending: number;
}

/**
 * キューのイベントハンドラー
 */
export interface QueueEventHandlers {
	onItemStart?: (item: QueueItem) => void;
	onItemComplete?: (item: QueueItem) => void;
	onItemFail?: (item: QueueItem, error: Error) => void;
	onProgress?: (progress: QueueProgress) => void;
}

/**
 * ベクトル化処理関数の型
 */
export type VectorizationFunction = (item: QueueItem) => Promise<void>;

/**
 * ベクトル化キュー
 */
export class VectorizationQueue {
	private queue: QueueItem[] = [];
	private processing: Set<string> = new Set(); // 処理中のファイルパス
	private concurrencyLimit: number = 2; // 同時実行数
	private handlers: QueueEventHandlers = {};
	private vectorizationFn: VectorizationFunction | null = null;
	private isRunning: boolean = false;
	private plugin: Plugin | null = null;
	private autoSaveInterval: number | null = null; // 自動保存のインターバルID

	constructor(concurrencyLimit: number = 2, plugin?: Plugin) {
		this.concurrencyLimit = concurrencyLimit;
		this.plugin = plugin || null;

		// プラグインが指定されている場合、定期的にキューを保存（30秒ごと）
		if (this.plugin) {
			this.autoSaveInterval = window.setInterval(() => {
				this.save();
			}, 30000); // 30秒
		}
	}

	/**
	 * イベントハンドラーを設定
	 */
	setHandlers(handlers: QueueEventHandlers): void {
		this.handlers = { ...this.handlers, ...handlers };
	}

	/**
	 * ベクトル化処理関数を設定
	 */
	setVectorizationFunction(fn: VectorizationFunction): void {
		this.vectorizationFn = fn;
	}

	/**
	 * アイテムをキューに追加
	 */
	add(file: TFile, priority: QueuePriority = 'low'): void {
		// 既にキューにあるか確認
		const existingIndex = this.queue.findIndex(
			(item) => item.filePath === file.path && item.status === 'pending'
		);

		if (existingIndex >= 0) {
			// 既に存在する場合は優先度を更新（High優先）
			if (priority === 'high') {
				this.queue[existingIndex].priority = 'high';
				// High優先度の場合は先頭に移動
				const item = this.queue.splice(existingIndex, 1)[0];
				this.insertByPriority(item);
			}
			return;
		}

		// 処理中でないことを確認
		if (this.processing.has(file.path)) {
			return;
		}

		// 新しいアイテムを作成
		const item: QueueItem = {
			filePath: file.path,
			file,
			priority,
			status: 'pending',
			retryCount: 0,
			addedAt: Date.now(),
		};

		// 優先度に応じて挿入
		this.insertByPriority(item);
		this.notifyProgress();

		// キューが実行中でない場合は開始
		if (!this.isRunning) {
			this.start();
		}
	}

	/**
	 * 優先度に応じてアイテムを挿入
	 */
	private insertByPriority(item: QueueItem): void {
		if (item.priority === 'high') {
			// High優先度は先頭に挿入
			this.queue.unshift(item);
		} else {
			// Low優先度は末尾に追加（FIFO）
			this.queue.push(item);
		}
	}

	/**
	 * キュー処理を開始
	 */
	private async start(): Promise<void> {
		if (this.isRunning) {
			return;
		}

		this.isRunning = true;

		// 処理ループ
		while (this.queue.length > 0 || this.processing.size > 0) {
			// 同時実行数の上限に達していない場合、次のアイテムを処理
			while (
				this.processing.size < this.concurrencyLimit &&
				this.queue.length > 0
			) {
				const item = this.getNextItem();
				if (item) {
					this.processItem(item);
				}
			}

			// 処理中のアイテムが完了するまで待機
			if (this.processing.size > 0) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		this.isRunning = false;
	}

	/**
	 * リトライ可能なエラーか判定
	 */
	private isRetryableError(error: unknown): boolean {
		// APIエラー（5xx系、429）のみリトライ可能
		if (error instanceof Error) {
			const message = error.message.toLowerCase();
			// 429 Too Many Requests
			if (message.includes('429') || message.includes('too many requests')) {
				return true;
			}
			// 5xx Server Errors
			if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
				return true;
			}
			// ネットワークエラー
			if (message.includes('network') || message.includes('timeout') || message.includes('fetch')) {
				return true;
			}
		}
		// 401 Unauthorized などはリトライ不可
		return false;
	}

	/**
	 * 次の処理対象アイテムを取得（優先度順）
	 */
	private getNextItem(): QueueItem | null {
		// High優先度のアイテムを先に取得
		const highPriorityIndex = this.queue.findIndex(
			(item) => item.priority === 'high' && item.status === 'pending'
		);

		if (highPriorityIndex >= 0) {
			return this.queue[highPriorityIndex];
		}

		// Low優先度のアイテムを取得（FIFO）
		const lowPriorityIndex = this.queue.findIndex(
			(item) => item.priority === 'low' && item.status === 'pending'
		);

		if (lowPriorityIndex >= 0) {
			return this.queue[lowPriorityIndex];
		}

		return null;
	}

	/**
	 * アイテムを処理
	 */
	private async processItem(item: QueueItem): Promise<void> {
		if (!this.vectorizationFn) {
			console.error('[VectorizationQueue] Vectorization function not set');
			return;
		}

		// ステータスを更新
		item.status = 'processing';
		item.startedAt = Date.now();
		this.processing.add(item.filePath);

		// イベント通知
		if (this.handlers.onItemStart) {
			this.handlers.onItemStart(item);
		}
		this.notifyProgress();

		try {
			// ベクトル化処理を実行
			await this.vectorizationFn(item);

			// 成功
			item.status = 'completed';
			item.completedAt = Date.now();
			this.processing.delete(item.filePath);

			// キューから削除
			const index = this.queue.findIndex((q) => q.filePath === item.filePath);
			if (index >= 0) {
				this.queue.splice(index, 1);
			}

			// イベント通知
			if (this.handlers.onItemComplete) {
				this.handlers.onItemComplete(item);
			}
			this.notifyProgress();

			// キューを保存
			await this.save();
		} catch (error) {
			// エラー処理
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			item.lastError = errorMessage;
			item.retryCount++;

			// リトライ可能なエラーか判定（APIエラー: 5xx系、429のみリトライ）
			const isRetryableError = this.isRetryableError(error);

			// リトライ判定（最大5回）
			const maxRetries = 5;
			if (isRetryableError && item.retryCount < maxRetries) {
				// リトライ可能な場合は待機中に戻す
				item.status = 'pending';
				this.processing.delete(item.filePath);

				// Exponential Backoff: 2^retryCount 秒待機（最大60秒）
				const delaySeconds = Math.min(Math.pow(2, item.retryCount), 60);
				const delayMs = delaySeconds * 1000;
				
				console.log(
					`[VectorizationQueue] Retrying ${item.filePath} after ${delaySeconds}s (attempt ${item.retryCount}/${maxRetries})`
				);

				setTimeout(() => {
					// 再度キューに追加
					this.insertByPriority(item);
					this.notifyProgress();
				}, delayMs);
			} else {
				// リトライ上限に達した、またはリトライ不可能なエラーの場合は失敗
				item.status = 'failed';
				item.completedAt = Date.now();
				this.processing.delete(item.filePath);

				console.error(
					`[VectorizationQueue] Failed to vectorize ${item.filePath}: ${errorMessage} (retries: ${item.retryCount})`
				);

				// 失敗ファイルリストに追加（設定に保存）
				if (this.plugin && 'settings' in this.plugin && 'saveSettings' in this.plugin) {
					const plugin = this.plugin as any;
					const failedFiles = plugin.settings.failedVectorizationFiles || [];
					if (!failedFiles.includes(item.filePath)) {
						failedFiles.push(item.filePath);
						plugin.settings.failedVectorizationFiles = failedFiles;
						await plugin.saveSettings();
					}
				}

				// イベント通知
				if (this.handlers.onItemFail) {
					this.handlers.onItemFail(item, error instanceof Error ? error : new Error(errorMessage));
				}
				this.notifyProgress();

				// キューを保存
				await this.save();
			}
		}
	}

	/**
	 * 進捗情報を通知
	 */
	private notifyProgress(): void {
		if (this.handlers.onProgress) {
			const progress: QueueProgress = {
				total: this.queue.length + this.processing.size,
				processing: this.processing.size,
				completed: this.queue.filter((item) => item.status === 'completed').length,
				failed: this.queue.filter((item) => item.status === 'failed').length,
				pending: this.queue.filter((item) => item.status === 'pending').length,
			};
			this.handlers.onProgress(progress);
		}
	}

	/**
	 * キューの状態を取得
	 */
	getProgress(): QueueProgress {
		return {
			total: this.queue.length + this.processing.size,
			processing: this.processing.size,
			completed: this.queue.filter((item) => item.status === 'completed').length,
			failed: this.queue.filter((item) => item.status === 'failed').length,
			pending: this.queue.filter((item) => item.status === 'pending').length,
		};
	}

	/**
	 * キュー内のアイテム一覧を取得
	 */
	getItems(): QueueItem[] {
		return [...this.queue];
	}

	/**
	 * キューを保存
	 */
	async save(): Promise<void> {
		if (!this.plugin) {
			return;
		}

		try {
			await saveQueue(this.plugin, this.queue);
		} catch (error) {
			console.error('[VectorizationQueue] Failed to save queue:', error);
		}
	}

	/**
	 * キューを読み込み
	 */
	async load(): Promise<void> {
		if (!this.plugin) {
			return;
		}

		try {
			const items = await loadQueue(this.plugin);
			// 既存のキューに追加（重複チェック）
			for (const item of items) {
				const exists = this.queue.some(
					(q) => q.filePath === item.filePath && q.status === 'pending'
				);
				if (!exists) {
					this.insertByPriority(item);
				}
			}
			this.notifyProgress();

			// キューが実行中でない場合は開始
			if (!this.isRunning && this.queue.length > 0) {
				this.start();
			}
		} catch (error) {
			console.error('[VectorizationQueue] Failed to load queue:', error);
		}
	}

	/**
	 * キューをクリア
	 */
	async clear(): Promise<void> {
		this.queue = [];
		this.processing.clear();
		this.isRunning = false;
		this.notifyProgress();

		// 永続化データもクリア
		if (this.plugin) {
			try {
				const { clearQueue } = await import('./queue-persistence');
				await clearQueue(this.plugin);
			} catch (error) {
				console.error('[VectorizationQueue] Failed to clear persisted queue:', error);
			}
		}
	}

	/**
	 * キューを一時停止
	 */
	pause(): void {
		this.isRunning = false;
	}

	/**
	 * キューを再開
	 */
	resume(): void {
		if (!this.isRunning && this.queue.length > 0) {
			this.start();
		}
	}

	/**
	 * リソースをクリーンアップ
	 */
	destroy(): void {
		if (this.autoSaveInterval !== null) {
			window.clearInterval(this.autoSaveInterval);
			this.autoSaveInterval = null;
		}
		// 最終保存
		if (this.plugin) {
			this.save();
		}
	}
}

