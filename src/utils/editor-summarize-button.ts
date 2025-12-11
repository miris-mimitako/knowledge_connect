/**
 * Editor Summarize Button
 * エディタ右上に要約ボタンを追加する機能
 */

import { MarkdownView, WorkspaceLeaf } from "obsidian";
import KnowledgeConnectPlugin from "../main";
import { SummarizePageModal, SummarizePageResult } from "./summarize-page-modal";
import { AIServiceFactory } from "../services/ai-service-factory";
import { showError, showSuccess } from "./error-handler";
import { TFile } from "obsidian";

/**
 * エディタに要約ボタンを追加
 */
export function registerEditorSummarizeButton(plugin: KnowledgeConnectPlugin): void {
	console.log("[SummarizeButton] registerEditorSummarizeButton called");
	
	// アクティブなリーフが変更されたときにボタンを更新
	plugin.registerEvent(
		plugin.app.workspace.on("active-leaf-change", (leaf) => {
			// 少し遅延させて、DOMが更新されるのを待つ
			setTimeout(() => {
				updateSummarizeButton(plugin, leaf);
			}, 100);
		})
	);

	// 初期状態でボタンを追加（少し遅延させて、DOMが更新されるのを待つ）
	setTimeout(() => {
		const activeLeaf = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeLeaf) {
			updateSummarizeButton(plugin, activeLeaf.leaf);
		} else {
			console.log("[SummarizeButton] No active MarkdownView found on init");
		}
	}, 200);
	
	// ファイルが開かれたときにもボタンを更新
	plugin.registerEvent(
		plugin.app.workspace.on("file-open", () => {
			setTimeout(() => {
				const activeLeaf = plugin.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeLeaf) {
					updateSummarizeButton(plugin, activeLeaf.leaf);
				}
			}, 100);
		})
	);
}

/**
 * 要約ボタンを更新
 */
function updateSummarizeButton(plugin: KnowledgeConnectPlugin, leaf: WorkspaceLeaf | null): void {
	if (!leaf) {
		console.log("[SummarizeButton] leaf is null");
		return;
	}

	const view = leaf.view;
	if (!(view instanceof MarkdownView)) {
		console.log("[SummarizeButton] view is not MarkdownView");
		return;
	}

	// 既存のボタンを削除
	const titleEl = (view as any).titleEl;
	const headerEl = (leaf as any).viewHeaderEl || (leaf as any).headerEl;
	
	console.log("[SummarizeButton] titleEl:", titleEl, "headerEl:", headerEl);
	
	let existingButton: HTMLElement | null = null;
	if (titleEl) {
		existingButton = titleEl.querySelector(".summarize-page-button");
	}
	if (!existingButton && headerEl) {
		existingButton = headerEl.querySelector(".summarize-page-button");
	}
	if (existingButton) {
		existingButton.remove();
	}

	// ボタンを追加する場所を決定
	// ObsidianのMarkdownViewでは、viewHeaderElまたはtitleElに追加する
	let buttonContainer: HTMLElement | null = null;
	
	// 方法1: leafのviewHeaderElを探す
	if (headerEl) {
		// viewHeaderEl内のタイトルコンテナを探す
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
		console.error("[SummarizeButton] buttonContainer not found. titleEl:", titleEl, "headerEl:", headerEl);
		// フォールバック: headerElがあればそれを使う
		if (headerEl) {
			buttonContainer = headerEl;
		} else {
			console.error("[SummarizeButton] Cannot find button container, returning");
			return;
		}
	}
	
	if (!buttonContainer) {
		console.error("[SummarizeButton] buttonContainer is still null after fallback");
		return;
	}
	
	console.log("[SummarizeButton] buttonContainer found:", buttonContainer);

	// 新しいボタンを作成
	const button = buttonContainer.createEl("button", {
		cls: "summarize-page-button",
		attr: {
			"aria-label": "ページを要約",
			title: "ページを要約",
		},
	});

	// アイコンを追加（Obsidianのアイコンシステムを使用）
	button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';

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
		console.log("[SummarizeButton] Button clicked");
		try {
			await handleSummarizeClick(plugin, view);
		} catch (error) {
			console.error("[SummarizeButton] Error in handleSummarizeClick:", error);
			showError(
				`要約ボタンのクリック処理でエラーが発生しました: ${error}`,
				plugin.settings.notificationSettings
			);
		}
	};
	
	console.log("[SummarizeButton] Button created and added");
}

/**
 * 要約ボタンのクリック処理
 */
async function handleSummarizeClick(
	plugin: KnowledgeConnectPlugin,
	view: MarkdownView
): Promise<void> {
	console.log("[SummarizeButton] handleSummarizeClick called");
	
	// AIサービスが利用可能か確認
	if (!plugin.isAIServiceAvailable()) {
		console.log("[SummarizeButton] AI service not available");
		showError(
			"AIサービスが利用できません。設定画面でAPIキーを確認してください。",
			plugin.settings.notificationSettings
		);
		return;
	}
	
	console.log("[SummarizeButton] AI service available");

	// 現在のファイルを取得
	const file = view.file;
	if (!file) {
		showError(
			"ファイルが見つかりません。",
			plugin.settings.notificationSettings
		);
		return;
	}

	// ファイルの内容を取得
	let fileContent: string;
	try {
		fileContent = await plugin.app.vault.read(file);
	} catch (error) {
		showError(
			`ファイルの読み込みに失敗しました: ${error}`,
			plugin.settings.notificationSettings
		);
		return;
	}

	if (!fileContent || fileContent.trim() === "") {
		showError(
			"ファイルが空です。",
			plugin.settings.notificationSettings
		);
		return;
	}

	// モーダルを表示
	console.log("[SummarizeButton] Opening modal");
	try {
		const modal = new SummarizePageModal(
			plugin.app,
			plugin.settings,
			async (result: SummarizePageResult) => {
				if (result.cancelled) {
					console.log("[SummarizeButton] Modal cancelled");
					return;
				}

				console.log("[SummarizeButton] Executing summarize");
				await executeSummarize(plugin, view, file, fileContent, result);
			}
		);
		modal.open();
		console.log("[SummarizeButton] Modal opened");
	} catch (error) {
		console.error("[SummarizeButton] Error opening modal:", error);
		showError(
			`モーダルの表示に失敗しました: ${error}`,
			plugin.settings.notificationSettings
		);
	}
}

/**
 * 要約を実行
 */
async function executeSummarize(
	plugin: KnowledgeConnectPlugin,
	view: MarkdownView,
	originalFile: TFile,
	fileContent: string,
	result: SummarizePageResult
): Promise<void> {
	try {
		// AIサービスを取得
		const aiService = plugin.getAIService();
		if (!aiService) {
			showError(
				"AIサービスが利用できません。",
				plugin.settings.notificationSettings
			);
			return;
		}

		// プロンプトを構築
		const prompt = `${result.prompt}\n\n---\n\n${fileContent}`;

		// ローディング通知
		if (plugin.settings.notificationSettings.showInfo) {
			new (plugin.app as any).Notice("要約を生成中...", 2000);
		}

		// 要約を実行
		const response = await aiService.chatCompletion({
			messages: [
				{
					role: "user",
					content: prompt,
				},
			],
			model: result.model,
			maxTokens: plugin.settings.maxTokens,
		});

		const summary = response.content;

		// 保存方法に応じて処理を分岐
		if (result.saveLocation === "new-page") {
			// 新しいページとして作成
			const originalFileName = originalFile.basename;
			const summaryFileName = `summarized_${originalFileName}`;

			// 保存先フォルダを決定
			let saveFolder = plugin.settings.summarySaveFolder || "";
			if (!saveFolder) {
				// 元のファイルと同じフォルダ
				const parentPath = originalFile.parent?.path;
				if (parentPath) {
					saveFolder = parentPath;
				}
			}

			// ファイルを保存
			const sanitizedFolder = sanitizePath(saveFolder);
			const sanitizedFileName = sanitizeFileName(summaryFileName);
			const fullPath = sanitizedFolder
				? `${sanitizedFolder}/${sanitizedFileName}.md`
				: `${sanitizedFileName}.md`;

			// ファイル名の重複チェック
			let finalPath = fullPath;
			let counter = 1;
			while (await plugin.app.vault.adapter.exists(finalPath)) {
				const nameWithoutExt = sanitizedFileName;
				finalPath = sanitizedFolder
					? `${sanitizedFolder}/${nameWithoutExt}_${counter}.md`
					: `${nameWithoutExt}_${counter}.md`;
				counter++;
			}

			// フォルダが存在しない場合は作成
			if (sanitizedFolder) {
				const folderExists = await plugin.app.vault.adapter.exists(sanitizedFolder);
				if (!folderExists) {
					await plugin.app.vault.createFolder(sanitizedFolder);
				}
			}

			// ファイルを作成
			const summaryFile = await plugin.app.vault.create(finalPath, summary);

			// 成功通知
			showSuccess(
				`要約を保存しました: ${finalPath}`,
				plugin.settings.notificationSettings
			);
		} else {
			// 現在のページに追加（上部または下部）
			const editor = view.editor;
			if (!editor) {
				showError(
					"エディタが見つかりません。",
					plugin.settings.notificationSettings
				);
				return;
			}

			// 要約を区切り線と共にフォーマット
			const separator = "\n\n---\n\n";
			const formattedSummary = `${separator}## 要約\n\n${summary}${separator}`;

			if (result.saveLocation === "top") {
				// 上部に追加
				const currentContent = editor.getValue();
				editor.setValue(formattedSummary + currentContent);
				// カーソルを要約の後に移動
				const summaryLength = formattedSummary.length;
				editor.setCursor(editor.offsetToPos(summaryLength));
			} else if (result.saveLocation === "bottom") {
				// 下部に追加
				const currentContent = editor.getValue();
				editor.setValue(currentContent + formattedSummary);
				// カーソルを要約の後に移動
				const newLength = currentContent.length + formattedSummary.length;
				editor.setCursor(editor.offsetToPos(newLength));
			}

			// 成功通知
			showSuccess(
				`要約を${result.saveLocation === "top" ? "上部" : "下部"}に追加しました。`,
				plugin.settings.notificationSettings
			);
		}
	} catch (error) {
		showError(
			`要約の実行に失敗しました: ${error}`,
			plugin.settings.notificationSettings
		);
	}
}

/**
 * パスをサニタイズ
 */
function sanitizePath(path: string): string {
	return path
		.replace(/[<>:"|?*]/g, "")
		.replace(/\/+/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

/**
 * ファイル名をサニタイズ
 */
function sanitizeFileName(fileName: string): string {
	return fileName
		.replace(/[<>:"|?*\/\\]/g, "_")
		.replace(/\s+/g, "_")
		.replace(/^\.+/, "")
		.trim();
}

