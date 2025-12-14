/**
 * Editor Tag Button
 * エディタ上部にタグ生成ボタンを追加する機能
 */

import { MarkdownView, WorkspaceLeaf } from "obsidian";
import KnowledgeConnectPlugin from "../main";
import { showError, showInfo, showSuccess } from "./error-handler";

/**
 * エディタにタグ生成ボタンを追加
 */
export function registerEditorTagButton(plugin: KnowledgeConnectPlugin): void {
	console.log("[TagButton] registerEditorTagButton called");
	
	// アクティブなリーフが変更されたときにボタンを更新
	plugin.registerEvent(
		plugin.app.workspace.on("active-leaf-change", (leaf) => {
			// 少し遅延させて、DOMが更新されるのを待つ
			setTimeout(() => {
				updateTagButton(plugin, leaf);
			}, 100);
		})
	);

	// 初期状態でボタンを追加（少し遅延させて、DOMが更新されるのを待つ）
	setTimeout(() => {
		const activeLeaf = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeLeaf) {
			updateTagButton(plugin, activeLeaf.leaf);
		} else {
			console.log("[TagButton] No active MarkdownView found on init");
		}
	}, 200);
	
	// ファイルが開かれたときにもボタンを更新
	plugin.registerEvent(
		plugin.app.workspace.on("file-open", () => {
			setTimeout(() => {
				const activeLeaf = plugin.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeLeaf) {
					updateTagButton(plugin, activeLeaf.leaf);
				}
			}, 100);
		})
	);
}

/**
 * タグ生成ボタンを更新
 */
function updateTagButton(plugin: KnowledgeConnectPlugin, leaf: WorkspaceLeaf | null): void {
	if (!leaf) {
		console.log("[TagButton] leaf is null");
		return;
	}

	const view = leaf.view;
	if (!(view instanceof MarkdownView)) {
		console.log("[TagButton] view is not MarkdownView");
		return;
	}

	// 既存のボタンを削除
	const titleEl = (view as any).titleEl;
	const headerEl = (leaf as any).viewHeaderEl || (leaf as any).headerEl;
	
	let existingButton: HTMLElement | null = null;
	if (titleEl) {
		existingButton = titleEl.querySelector(".generate-tag-button");
	}
	if (!existingButton && headerEl) {
		existingButton = headerEl.querySelector(".generate-tag-button");
	}
	if (existingButton) {
		existingButton.remove();
	}

	// ボタンを追加する場所を決定
	let buttonContainer: HTMLElement | null = null;
	
	// 方法1: leafのviewHeaderElを探す
	if (headerEl) {
		const titleContainer = headerEl.querySelector(".view-header-title-container") || 
		                       headerEl.querySelector(".view-header-title") ||
		                       headerEl;
		if (titleContainer) {
			buttonContainer = titleContainer as HTMLElement;
		}
	}
	
	// 方法2: viewのtitleElを試す
	if (!buttonContainer && titleEl) {
		buttonContainer = titleEl;
	}
	
	// 方法3: viewのcontainerElから探す
	if (!buttonContainer) {
		const viewContainer = (view as any).containerEl;
		if (viewContainer) {
			const header = viewContainer.querySelector(".view-header");
			if (header) {
				const titleContainer = header.querySelector(".view-header-title-container") ||
				                      header.querySelector(".view-header-title") ||
				                      header;
				if (titleContainer) {
					buttonContainer = titleContainer as HTMLElement;
				}
			}
		}
	}
	
	if (!buttonContainer) {
		console.error("[TagButton] buttonContainer not found");
		if (headerEl) {
			buttonContainer = headerEl;
		} else {
			return;
		}
	}

	// 新しいボタンを作成
	const button = buttonContainer.createEl("button", {
		cls: "generate-tag-button",
		attr: {
			"aria-label": "AIタグを生成",
			title: "AIタグを生成",
		},
	});

	// アイコンを追加（タグアイコン）
	button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>';

	// ボタンのスタイル
	button.style.cssText = `
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		margin-left: 8px;
		border: none;
		background: transparent;
		cursor: pointer;
		color: var(--text-muted);
		border-radius: 4px;
		transition: all 0.2s ease;
	`;

	// ホバー効果
	button.onmouseenter = () => {
		button.style.color = "var(--text-normal)";
		button.style.background = "var(--background-modifier-hover)";
	};
	button.onmouseleave = () => {
		button.style.color = "var(--text-muted)";
		button.style.background = "transparent";
	};

	// クリックイベント
	button.onclick = async (e) => {
		e.stopPropagation();
		e.preventDefault();
		console.log("[TagButton] Button clicked");
		try {
			await handleTagGenerationClick(plugin, view);
		} catch (error) {
			console.error("[TagButton] Error in handleTagGenerationClick:", error);
			showError(
				`タグ生成ボタンのクリック処理でエラーが発生しました: ${error}`,
				plugin.settings.notificationSettings
			);
		}
	};
	
	console.log("[TagButton] Button created and added");
}

/**
 * タグ生成ボタンのクリック処理
 */
async function handleTagGenerationClick(
	plugin: KnowledgeConnectPlugin,
	view: MarkdownView
): Promise<void> {
	console.log("[TagButton] handleTagGenerationClick called");
	
	// AIサービスが利用可能か確認
	if (!plugin.isAIServiceAvailable()) {
		showError(
			"AIサービスが利用できません。設定画面でAPIキーを確認してください。",
			plugin.settings.notificationSettings
		);
		return;
	}

	// 現在のファイルを取得
	const file = view.file;
	if (!file) {
		showError(
			"ファイルが見つかりません。",
			plugin.settings.notificationSettings
		);
		return;
	}

	// プラグインの自動タグサービスを使用
	const autoTagService = plugin.getAutoTagService();
	if (!autoTagService) {
		showError(
			"タグ生成サービスが利用できません。",
			plugin.settings.notificationSettings
		);
		return;
	}

	try {
		// ローディング通知
		showInfo("タグを生成中...", plugin.settings.notificationSettings);

		// 強制的にタグを生成（既存タグがあっても上書き）
		await autoTagService.handleFileModify(file, true);

		// 成功通知
		showSuccess(
			"タグを生成しました",
			plugin.settings.notificationSettings
		);
	} catch (error) {
		showError(
			`タグの生成に失敗しました: ${error}`,
			plugin.settings.notificationSettings
		);
	}
}

