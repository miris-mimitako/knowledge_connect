/**
 * Summary View
 * AI要約機能のView実装
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import KnowledgeConnectPlugin from "../main";
import { showError, showInfo, showSuccess } from "../utils/error-handler";
import { saveSummary } from "../utils/file-manager";

export const SUMMARY_VIEW_TYPE = "knowledge-connect-summary";

export class SummaryView extends ItemView {
	plugin: KnowledgeConnectPlugin;
	private summaryContentEl?: HTMLElement;
	summaryText: string = "";
	private isLoading: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: KnowledgeConnectPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return SUMMARY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "AI Summary";
	}

	getIcon(): string {
		return "file-text";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		// ヘッダー
		const header = container.createDiv("summary-header");
		header.createEl("h2", { text: "AI要約" });

		// コンテンツエリア
		this.summaryContentEl = container.createDiv("summary-content");

		// 初期メッセージ
		this.showInitialMessage();
	}

	async onClose() {
		this.summaryContentEl = undefined;
	}

	/**
	 * テキストを要約
	 */
	async summarizeText(text: string, detailLevel: "brief" | "standard" | "detailed" = "standard") {
		if (!this.summaryContentEl || this.isLoading) {
			return;
		}

		const aiService = this.plugin.getAIService();
		if (!aiService) {
			showError(
				"APIキーが設定されていません。設定画面でAPIキーを設定してください。",
				this.plugin.settings.notificationSettings
			);
			return;
		}

		this.setLoading(true);
		this.summaryContentEl.empty();
		this.summaryContentEl.createEl("p", { text: "要約中..." });

		try {
			// プロンプトを構築
			const detailPrompt = {
				brief: "簡潔に要点のみを要約してください。",
				standard: "バランスの取れた要約を作成してください。",
				detailed: "包括的で詳細な要約を作成してください。",
			};

			const prompt = `${detailPrompt[detailLevel]}\n\n以下のテキストを要約してください：\n\n${text}`;

			const response = await aiService.chatCompletion({
				messages: [
					{
						role: "system",
						content: "あなたは優秀な要約アシスタントです。与えられたテキストを適切に要約してください。",
					},
					{
						role: "user",
						content: prompt,
					},
				],
				maxTokens: this.plugin.settings.maxTokens,
			});

			this.summaryText = response.content;
			this.renderSummary();

			showSuccess(
				"要約が完了しました",
				this.plugin.settings.notificationSettings
			);

			// 自動保存
			if (this.plugin.settings.enableAutoSave) {
				await this.autoSave();
			}
		} catch (error) {
			showError(error, this.plugin.settings.notificationSettings);
			this.showInitialMessage();
		} finally {
			this.setLoading(false);
		}
	}

	renderSummary() {
		if (!this.summaryContentEl) {
			return;
		}

		this.summaryContentEl.empty();

		// 要約結果
		const summaryEl = this.summaryContentEl.createDiv("summary-result");
		summaryEl.createEl("h3", { text: "要約結果" });
		const contentEl = summaryEl.createDiv("summary-text");
		contentEl.createEl("p", { text: this.summaryText });

		// アクションボタン
		const actionsEl = this.summaryContentEl.createDiv("summary-actions");
		
		const copyButton = actionsEl.createEl("button", {
			text: "クリップボードにコピー",
			cls: "mod-cta",
		});
		copyButton.onclick = () => {
			navigator.clipboard.writeText(this.summaryText);
			showSuccess(
				"クリップボードにコピーしました",
				this.plugin.settings.notificationSettings
			);
		};

		const insertButton = actionsEl.createEl("button", {
			text: "現在のファイルに挿入",
			cls: "mod-cta",
		});
		insertButton.onclick = () => {
			this.insertToCurrentFile();
		};

		const saveButton = actionsEl.createEl("button", {
			text: "ファイルに保存",
			cls: "mod-cta",
		});
		saveButton.onclick = () => {
			this.saveToFile();
		};
	}

	private showInitialMessage() {
		if (!this.summaryContentEl) {
			return;
		}

		this.summaryContentEl.empty();
		const emptyMessage = this.summaryContentEl.createDiv("summary-empty");
		emptyMessage.createEl("p", {
			text: "要約したいテキストを選択して、コマンドパレットから「要約」コマンドを実行してください。",
		});
	}

	private setLoading(loading: boolean) {
		this.isLoading = loading;
	}

	private insertToCurrentFile() {
		const { MarkdownView } = require("obsidian");
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && "editor" in activeView) {
			const editor = (activeView as any).editor;
			if (editor) {
				const cursor = editor.getCursor();
				editor.replaceRange(`\n${this.summaryText}\n`, cursor);
				showSuccess(
					"ファイルに挿入しました",
					this.plugin.settings.notificationSettings
				);
				return;
			}
		}
		showError(
			"アクティブなエディタが見つかりません",
			this.plugin.settings.notificationSettings
		);
	}

	private async saveToFile() {
		if (this.summaryText) {
			await saveSummary(this.app, this.plugin.settings, this.summaryText);
		}
	}

	private async autoSave() {
		if (this.summaryText) {
			await saveSummary(this.app, this.plugin.settings, this.summaryText);
		}
	}
}

