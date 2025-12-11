/**
 * Vectorization Progress Modal
 * ベクトル化進捗の詳細モーダル
 */

import { App, Modal } from 'obsidian';
import { QueueItem, QueueProgress } from '../services/vectorization-queue';

export class VectorizationProgressModal extends Modal {
	private progress: QueueProgress;
	private items: QueueItem[];
	private onCloseCallback: () => void;

	constructor(
		app: App,
		progress: QueueProgress,
		items: QueueItem[],
		onClose: () => void
	) {
		super(app);
		this.progress = progress;
		this.items = items;
		this.onCloseCallback = onClose;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'ベクトル化進捗' });

		this.updateProgress(this.progress, this.items);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.onCloseCallback();
	}

	/**
	 * 進捗を更新
	 */
	updateProgress(progress: QueueProgress, items: QueueItem[]): void {
		const { contentEl } = this;
		if (!contentEl) return;

		this.progress = progress;
		this.items = items;

		// 既存のコンテンツをクリア（進捗部分のみ）
		const existingProgress = contentEl.querySelector('.progress-summary');
		if (existingProgress) {
			existingProgress.remove();
		}

		const existingList = contentEl.querySelector('.progress-items');
		if (existingList) {
			existingList.remove();
		}

		// 進捗サマリー
		const summaryEl = contentEl.createDiv('progress-summary');
		
		// 進捗率を計算
		const percentage = progress.total > 0 
			? Math.round((progress.completed / progress.total) * 100) 
			: 0;
		
		summaryEl.createEl('p', {
			text: `合計: ${progress.total}件 | 完了: ${progress.completed}件 (${percentage}%) | 処理中: ${progress.processing}件 | 失敗: ${progress.failed}件 | 待機中: ${progress.pending}件`,
		});

		// 進捗バー
		if (progress.total > 0) {
			const progressBar = summaryEl.createDiv('progress-bar');
			progressBar.style.width = '100%';
			progressBar.style.height = '20px';
			progressBar.style.backgroundColor = 'var(--background-secondary)';
			progressBar.style.borderRadius = '4px';
			progressBar.style.overflow = 'hidden';
			progressBar.style.marginTop = '10px';
			progressBar.style.marginBottom = '10px';
			
			const progressFill = progressBar.createDiv('progress-fill');
			progressFill.style.height = '100%';
			progressFill.style.backgroundColor = 'var(--interactive-accent)';
			progressFill.style.width = `${percentage}%`;
			progressFill.style.transition = 'width 0.3s ease';
			
			// パーセンテージテキスト
			const percentageText = progressBar.createDiv('progress-text');
			percentageText.style.position = 'absolute';
			percentageText.style.width = '100%';
			percentageText.style.textAlign = 'center';
			percentageText.style.lineHeight = '20px';
			percentageText.style.color = 'var(--text-normal)';
			percentageText.textContent = `${percentage}%`;
		}

		// アイテムリスト
		const itemsEl = contentEl.createDiv('progress-items');
		
		// 処理中
		const processingItems = items.filter((item) => item.status === 'processing');
		if (processingItems.length > 0) {
			itemsEl.createEl('h3', { text: '処理中' });
			for (const item of processingItems) {
				const itemEl = itemsEl.createDiv('progress-item processing');
				itemEl.createEl('span', { text: item.filePath });
			}
		}

		// 失敗
		const failedItems = items.filter((item) => item.status === 'failed');
		if (failedItems.length > 0) {
			itemsEl.createEl('h3', { text: '失敗' });
			for (const item of failedItems) {
				const itemEl = itemsEl.createDiv('progress-item failed');
				itemEl.createEl('span', { text: item.filePath });
				if (item.lastError) {
					itemEl.createEl('span', {
						text: `エラー: ${item.lastError}`,
						cls: 'error-message',
					});
				}
			}
		}

		// 待機中
		const pendingItems = items.filter((item) => item.status === 'pending');
		if (pendingItems.length > 0) {
			itemsEl.createEl('h3', { text: '待機中' });
			const pendingList = itemsEl.createEl('ul');
			for (const item of pendingItems.slice(0, 10)) {
				// 最大10件まで表示
				const itemEl = pendingList.createEl('li');
				itemEl.textContent = item.filePath;
			}
			if (pendingItems.length > 10) {
				pendingList.createEl('li', {
					text: `...他 ${pendingItems.length - 10}件`,
				});
			}
		}
	}
}

