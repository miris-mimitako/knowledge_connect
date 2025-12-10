/**
 * Queue Persistence
 * ベクトル化キューの永続化処理
 * プラグイン再起動時にキューを復元
 */

import { Plugin, TFile } from 'obsidian';
import { QueueItem, QueuePriority, QueueItemStatus } from './vectorization-queue';

/**
 * 永続化可能なキューアイテム（TFileオブジェクトを除く）
 */
export interface SerializableQueueItem {
	filePath: string;
	priority: QueuePriority;
	status: QueueItemStatus;
	retryCount: number;
	lastError?: string;
	addedAt: number;
	startedAt?: number;
	completedAt?: number;
}

/**
 * キューの永続化データ
 */
export interface QueuePersistenceData {
	items: SerializableQueueItem[];
	version: number; // データ形式のバージョン
}

/**
 * キューアイテムをシリアライズ可能な形式に変換
 */
export function serializeQueueItem(item: QueueItem): SerializableQueueItem {
	return {
		filePath: item.filePath,
		priority: item.priority,
		status: item.status,
		retryCount: item.retryCount,
		lastError: item.lastError,
		addedAt: item.addedAt,
		startedAt: item.startedAt,
		completedAt: item.completedAt,
	};
}

/**
 * シリアライズ可能な形式からキューアイテムを復元
 * TFileオブジェクトは復元時に再取得する必要がある
 */
export function deserializeQueueItem(
	data: SerializableQueueItem,
	app: any
): QueueItem | null {
	// ファイルが存在するか確認
	const file = app.vault.getAbstractFileByPath(data.filePath);
	if (!(file instanceof TFile)) {
		// ファイルが存在しない場合はnullを返す
		return null;
	}

	return {
		filePath: data.filePath,
		file: file,
		priority: data.priority,
		status: data.status === 'processing' ? 'pending' : data.status, // 処理中は待機中に戻す
		retryCount: data.retryCount,
		lastError: data.lastError,
		addedAt: data.addedAt,
		startedAt: data.startedAt,
		completedAt: data.completedAt,
	};
}

/**
 * キューを保存
 */
export async function saveQueue(
	plugin: Plugin,
	items: QueueItem[]
): Promise<void> {
	try {
		// 完了・失敗したアイテムは保存しない（pending, processingのみ）
		const itemsToSave = items
			.filter((item) => item.status === 'pending' || item.status === 'processing')
			.map(serializeQueueItem);

		const data: QueuePersistenceData = {
			items: itemsToSave,
			version: 1,
		};

		// 既存のデータを読み込み
		const existingData = await plugin.loadData();
		const queueData = {
			...existingData,
			vectorizationQueue: data,
		};

		// 保存
		await plugin.saveData(queueData);
		console.log(`[QueuePersistence] Saved ${itemsToSave.length} queue items`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[QueuePersistence] Failed to save queue: ${errorMessage}`);
		throw error;
	}
}

/**
 * キューを読み込み
 */
export async function loadQueue(plugin: Plugin): Promise<QueueItem[]> {
	try {
		const data = await plugin.loadData();
		const queueData = data?.vectorizationQueue as QueuePersistenceData | undefined;

		if (!queueData || !queueData.items || !Array.isArray(queueData.items)) {
			console.log('[QueuePersistence] No queue data found');
			return [];
		}

		// アイテムを復元
		const restoredItems: QueueItem[] = [];
		for (const itemData of queueData.items) {
			const item = deserializeQueueItem(itemData, plugin.app);
			if (item) {
				restoredItems.push(item);
			} else {
				console.warn(
					`[QueuePersistence] File not found, skipping: ${itemData.filePath}`
				);
			}
		}

		console.log(
			`[QueuePersistence] Restored ${restoredItems.length}/${queueData.items.length} queue items`
		);
		return restoredItems;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[QueuePersistence] Failed to load queue: ${errorMessage}`);
		return [];
	}
}

/**
 * キューをクリア（永続化データから削除）
 */
export async function clearQueue(plugin: Plugin): Promise<void> {
	try {
		const existingData = await plugin.loadData();
		if (existingData?.vectorizationQueue) {
			delete existingData.vectorizationQueue;
			await plugin.saveData(existingData);
			console.log('[QueuePersistence] Queue data cleared');
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[QueuePersistence] Failed to clear queue: ${errorMessage}`);
		throw error;
	}
}

