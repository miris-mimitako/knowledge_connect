/**
 * File Watcher
 * ファイル変更の監視とイベント発火
 */

import { Plugin, TFile, TFolder } from 'obsidian';

export type FileChangeEventType = 'modify' | 'create' | 'delete' | 'rename';

export interface FileChangeEvent {
	type: FileChangeEventType;
	file: TFile | null;
	oldPath?: string; // renameイベントの場合の旧パス
}

export type FileChangeHandler = (event: FileChangeEvent) => void | Promise<void>;

export class FileWatcher {
	private plugin: Plugin;
	private handlers: Set<FileChangeHandler> = new Set();
	private isEnabled: boolean = false;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	/**
	 * ファイル変更監視を開始
	 */
	start(): void {
		if (this.isEnabled) {
			return;
		}

		// modifyイベント: ファイルが変更された時
		this.plugin.registerEvent(
			this.plugin.app.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					this.handleFileChange({
						type: 'modify',
						file,
					});
				}
			})
		);

		// createイベント: ファイルが作成された時
		this.plugin.registerEvent(
			this.plugin.app.vault.on('create', (file) => {
				if (file instanceof TFile) {
					this.handleFileChange({
						type: 'create',
						file,
					});
				}
			})
		);

		// deleteイベント: ファイルが削除された時
		this.plugin.registerEvent(
			this.plugin.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.handleFileChange({
						type: 'delete',
						file,
					});
				}
			})
		);

		// renameイベント: ファイルがリネームされた時
		this.plugin.registerEvent(
			this.plugin.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile) {
					this.handleFileChange({
						type: 'rename',
						file,
						oldPath,
					});
				}
			})
		);

		this.isEnabled = true;
		console.log('[FileWatcher] File watching started');
	}

	/**
	 * ファイル変更監視を停止
	 */
	stop(): void {
		// ObsidianのregisterEventは自動的にクリーンアップされるため、
		// 明示的な停止処理は不要（プラグインのunload時に自動的に解除される）
		this.isEnabled = false;
		this.handlers.clear();
		console.log('[FileWatcher] File watching stopped');
	}

	/**
	 * ファイル変更ハンドラーを登録
	 */
	on(handler: FileChangeHandler): void {
		this.handlers.add(handler);
	}

	/**
	 * ファイル変更ハンドラーを削除
	 */
	off(handler: FileChangeHandler): void {
		this.handlers.delete(handler);
	}

	/**
	 * ファイル変更イベントを処理
	 */
	private async handleFileChange(event: FileChangeEvent): Promise<void> {
		if (!this.isEnabled) {
			return;
		}

		// すべてのハンドラーを実行
		for (const handler of this.handlers) {
			try {
				await handler(event);
			} catch (error) {
				console.error('[FileWatcher] Error in file change handler:', error);
			}
		}
	}

	/**
	 * 監視が有効かどうか
	 */
	isWatching(): boolean {
		return this.isEnabled;
	}
}

