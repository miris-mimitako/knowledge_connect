/**
 * Vectorization Status Bar
 * ステータスバーへの進捗表示
 */

import { Plugin, WorkspaceLeaf } from 'obsidian';
import { VectorizationQueue, QueueProgress } from './vectorization-queue';
import { VectorizationProgressModal } from '../utils/vectorization-progress-modal';

export class VectorizationStatusBar {
	private plugin: Plugin;
	private queue: VectorizationQueue | null = null;
	private statusBarItem: HTMLElement | null = null;
	private progressModal: VectorizationProgressModal | null = null;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	/**
	 * キューを設定
	 */
	setQueue(queue: VectorizationQueue): void {
		this.queue = queue;

		// 進捗イベントを監視
		queue.setHandlers({
			onProgress: (progress: QueueProgress) => {
				this.updateStatusBar(progress);
			},
		});
	}

	/**
	 * ステータスバーを初期化
	 */
	initialize(): void {
		// ステータスバーにアイテムを追加
		this.statusBarItem = this.plugin.addStatusBarItem();
		this.statusBarItem.setText('Vectorizing: 0/0');
		this.statusBarItem.addClass('vectorization-status-bar');
		this.statusBarItem.style.display = 'none';

		// クリックで詳細モーダルを表示
		this.statusBarItem.onclick = () => {
			this.showProgressModal();
		};
	}

	/**
	 * ステータスバーを更新
	 */
	private updateStatusBar(progress: QueueProgress): void {
		if (!this.statusBarItem) return;

		if (progress.total === 0 || (progress.processing === 0 && progress.pending === 0)) {
			// 処理中でない場合は非表示
			this.statusBarItem.style.display = 'none';
		} else {
			// 処理中の場合
			this.statusBarItem.style.display = 'block';
			
			// 進捗率を計算
			const completed = progress.completed;
			const total = progress.total;
			const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
			
			// より詳細な進捗表示
			let text = `ベクトル化: ${completed}/${total} (${percentage}%)`;
			if (progress.processing > 0) {
				text += ` [処理中: ${progress.processing}]`;
			}
			if (progress.failed > 0) {
				text += ` [失敗: ${progress.failed}]`;
			}
			
			this.statusBarItem.setText(text);

			// 失敗がある場合は警告色
			if (progress.failed > 0) {
				this.statusBarItem.addClass('has-error');
			} else {
				this.statusBarItem.removeClass('has-error');
			}
		}
	}

	/**
	 * 進捗モーダルを表示
	 */
	private showProgressModal(): void {
		if (!this.queue) return;

		const progress = this.queue.getProgress();
		const items = this.queue.getItems();

		if (!this.progressModal) {
			this.progressModal = new VectorizationProgressModal(
				this.plugin.app,
				progress,
				items,
				() => {
					// モーダルを閉じる
					this.progressModal = null;
				}
			);
		}

		this.progressModal.updateProgress(progress, items);
		this.progressModal.open();
	}

	/**
	 * リソースをクリーンアップ
	 */
	destroy(): void {
		if (this.statusBarItem) {
			this.statusBarItem.remove();
			this.statusBarItem = null;
		}
		if (this.progressModal) {
			this.progressModal.close();
			this.progressModal = null;
		}
	}
}

