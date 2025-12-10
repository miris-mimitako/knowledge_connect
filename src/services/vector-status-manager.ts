/**
 * Vector Status Manager
 * ベクトル化済みマークの表示を管理
 */

import { Plugin, WorkspaceLeaf, MarkdownView } from 'obsidian';
import { SearchWorkerManager } from '../workers/search-worker-manager';

export class VectorStatusManager {
	private plugin: Plugin;
	private workerManager: SearchWorkerManager | null = null;
	private actionIcons: Map<string, HTMLElement> = new Map();

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	/**
	 * サービスを初期化
	 */
	initialize(workerManager: SearchWorkerManager): void {
		this.workerManager = workerManager;

		// アクティブなリーフが切り替わった時にチェック
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('active-leaf-change', (leaf) => {
				this.updateVectorStatus(leaf);
			})
		);

		// 初期状態を更新
		const activeLeaf = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeLeaf) {
			this.updateVectorStatus(this.plugin.app.workspace.getMostRecentLeaf());
		}
	}

	/**
	 * ベクトル化状態を更新
	 */
	private async updateVectorStatus(leaf: WorkspaceLeaf | null): Promise<void> {
		if (!leaf) {
			return;
		}

		const view = leaf.view;
		if (!(view instanceof MarkdownView)) {
			return;
		}

		const file = view.file;
		if (!file) {
			return;
		}

		// 既存のアイコンを削除
		this.removeVectorIcon(file.path);

		// ベクトル化済みかどうかを確認
		if (!this.workerManager || !this.workerManager.isReady()) {
			return;
		}

		try {
			const isVectorized = await this.workerManager.checkDocumentExists(file.path);
			
			if (isVectorized) {
				// エディタ右上にアイコンを追加
				const action = view.addAction('check-circle', 'ベクトル化済み', () => {
					// クリック時の動作（必要なければ空でOK）
					console.log('This file is vectorized.');
				});

				// CSSクラスを追加
				action.addClass('is-vectorized-icon');
				this.actionIcons.set(file.path, action);
			}
		} catch (error) {
			console.error('[VectorStatusManager] Failed to check vector status:', error);
		}
	}

	/**
	 * ベクトル化アイコンを削除
	 */
	private removeVectorIcon(filePath: string): void {
		const icon = this.actionIcons.get(filePath);
		if (icon) {
			icon.remove();
			this.actionIcons.delete(filePath);
		}
	}

	/**
	 * ファイルのベクトル化状態を更新（外部から呼び出し可能）
	 */
	async refreshFileStatus(filePath: string): Promise<void> {
		const activeLeaf = this.plugin.app.workspace.getMostRecentLeaf();
		if (activeLeaf && activeLeaf.view instanceof MarkdownView) {
			const file = activeLeaf.view.file;
			if (file && file.path === filePath) {
				await this.updateVectorStatus(activeLeaf);
			}
		}
	}

	/**
	 * すべてのアイコンをクリア
	 */
	clearAllIcons(): void {
		for (const [filePath, icon] of this.actionIcons.entries()) {
			icon.remove();
		}
		this.actionIcons.clear();
	}
}

