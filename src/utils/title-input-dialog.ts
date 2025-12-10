/**
 * Title Input Dialog
 * タイトル入力ダイアログ（手動入力またはAI生成）
 */

import { App, Modal, Setting } from "obsidian";
import type { AIService } from "../services/ai-service-interface";

/**
 * デフォルトタイトルを生成（AIとの会話_yyyymmddHHMMSS形式）
 */
export function generateDefaultTitle(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const hours = String(now.getHours()).padStart(2, "0");
	const minutes = String(now.getMinutes()).padStart(2, "0");
	const seconds = String(now.getSeconds()).padStart(2, "0");
	return `AIとの会話_${year}${month}${day}${hours}${minutes}${seconds}`;
}

export interface TitleInputResult {
	title: string;
	useAI: boolean;
	cancelled: boolean;
}

export class TitleInputDialog extends Modal {
	result: TitleInputResult = {
		title: "",
		useAI: false,
		cancelled: true,
	};
	onSubmit: (result: TitleInputResult) => void;
	private aiService: AIService | null;
	private chatMessages: Array<{ role: string; content: string }>;
	private selectedModel: string;
	private titleInputEl: HTMLInputElement | null = null;
	private aiButton: HTMLButtonElement | null = null;
	private isLoading: boolean = false;

	constructor(
		app: App,
		defaultTitle: string,
		aiService: AIService | null,
		chatMessages: Array<{ role: string; content: string }>,
		selectedModel: string,
		onSubmit: (result: TitleInputResult) => void
	) {
		super(app);
		this.result.title = defaultTitle;
		this.aiService = aiService;
		this.chatMessages = chatMessages;
		this.selectedModel = selectedModel;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", { text: "タイトルを設定" });

		// タイトル入力
		const titleSetting = new Setting(contentEl)
			.setName("タイトル")
			.setDesc("ページのタイトルを入力するか、AIで生成してください。")
			.addText((text) => {
				this.titleInputEl = text.inputEl;
				text
					.setPlaceholder("例: AIとの会話_20240101120000")
					.setValue(this.result.title)
					.onChange((value) => {
						this.result.title = value;
						this.result.useAI = false;
					});
			})
			.addButton((button) => {
				this.aiButton = button.buttonEl;
				button.buttonEl.addClass("title-ai-button");
				button
					.setButtonText(this.isLoading ? "生成中..." : "✨")
					.setTooltip("AIでタイトルを生成")
					.setDisabled(this.isLoading || !this.aiService)
					.onClick(async () => {
						await this.generateTitleWithAI();
					});
			});

		// ボタン
		new Setting(contentEl).addButton((button) => {
			button
				.setButtonText("次へ")
				.setCta()
				.setDisabled(this.isLoading)
				.onClick(() => {
					if (!this.result.title || this.result.title.trim() === "") {
						return;
					}
					this.result.cancelled = false;
					this.close();
					this.onSubmit(this.result);
				});
		}).addButton((button) => {
			button.setButtonText("キャンセル").onClick(() => {
				this.close();
			});
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		if (this.result.cancelled) {
			this.onSubmit(this.result);
		}
	}

	/**
	 * AIでタイトルを生成
	 */
	private async generateTitleWithAI(): Promise<void> {
		if (!this.aiService || this.isLoading) {
			return;
		}

		this.isLoading = true;
		if (this.aiButton) {
			this.aiButton.textContent = "生成中...";
			this.aiButton.disabled = true;
		}
		if (this.titleInputEl) {
			this.titleInputEl.disabled = true;
		}

		try {
			// チャット履歴の最初の数メッセージを取得（タイトル生成用）
			const previewText = this.chatMessages
				.slice(0, 4)
				.map((msg) => msg.content)
				.join("\n")
				.slice(0, 500); // 最初の500文字のみ

			const response = await this.aiService.chatCompletion({
				messages: [
					{
						role: "system",
						content:
							"あなたはタイトル生成アシスタントです。与えられたチャット履歴の内容を分析して、適切なタイトルを1つだけ生成してください。タイトルは30文字以内で、日本語で、ファイル名として使用できる形式（特殊文字なし）で出力してください。タイトル以外の説明や補足は不要です。",
					},
					{
						role: "user",
						content: `以下のチャット履歴から適切なタイトルを生成してください：\n\n${previewText}`,
					},
				],
				maxTokens: 50,
				model: this.selectedModel,
			});

			let generatedTitle = response.content.trim();
			
			// 改行で分割して最初の行を取得（タイトル以外の説明が含まれる場合があるため）
			const firstLine = generatedTitle.split("\n")[0].trim();
			if (firstLine) {
				generatedTitle = firstLine;
			}
			
			// ファイル名として使用できない文字を削除
			generatedTitle = generatedTitle
				.replace(/[<>:"|?*\/\\]/g, "")
				.replace(/\n/g, " ")
				.replace(/^タイトル[:：]\s*/i, "") // 「タイトル:」などのプレフィックスを削除
				.replace(/^「|」$/g, "") // 引用符を削除
				.trim()
				.slice(0, 50); // 最大50文字

			if (generatedTitle && this.titleInputEl) {
				this.result.title = generatedTitle;
				this.result.useAI = true;
				this.titleInputEl.value = generatedTitle;
			} else {
				// タイトルが生成されなかった場合
				console.warn("タイトルが生成されませんでした。レスポンス:", response.content);
			}
		} catch (error) {
			console.error("タイトル生成エラー:", error);
			// エラー時は初期値に戻す
			if (this.titleInputEl) {
				this.titleInputEl.value = this.result.title;
			}
		} finally {
			this.isLoading = false;
			if (this.aiButton) {
				this.aiButton.textContent = "✨";
				this.aiButton.disabled = !this.aiService;
			}
			if (this.titleInputEl) {
				this.titleInputEl.disabled = false;
			}
		}
	}
}

