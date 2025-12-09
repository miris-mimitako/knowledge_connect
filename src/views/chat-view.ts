/**
 * Chat View
 * AIチャット機能のView実装
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import KnowledgeConnectPlugin from "../main";
import type { ChatMessage } from "../services/ai-service-interface";
import { showError, showInfo, showSuccess } from "../utils/error-handler";
import { saveChatHistory } from "../utils/file-manager";

export const CHAT_VIEW_TYPE = "knowledge-connect-chat";

export class ChatView extends ItemView {
	plugin: KnowledgeConnectPlugin;
	private messages: ChatMessage[] = [];
	private inputEl: HTMLTextAreaElement | null = null;
	private messagesEl: HTMLElement | null = null;
	private sendButton: HTMLButtonElement | null = null;
	private clearButton: HTMLButtonElement | null = null;
	private isLoading: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: KnowledgeConnectPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "AI Chat";
	}

	getIcon(): string {
		return "message-square";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		// ヘッダー
		const header = container.createDiv("chat-header");
		header.createEl("h2", { text: "AI Chat" });
		this.clearButton = header.createEl("button", {
			text: "履歴をクリア",
			cls: "mod-cta",
		});
		this.clearButton.onclick = () => this.clearHistory();

		// メッセージ表示エリア
		this.messagesEl = container.createDiv("chat-messages");
		this.messagesEl.addClass("chat-messages-container");

		// 入力エリア
		const inputContainer = container.createDiv("chat-input-container");
		this.inputEl = inputContainer.createEl("textarea", {
			placeholder: "メッセージを入力してください...",
			cls: "chat-input",
		});
		this.inputEl.rows = 3;

		// 送信ボタン
		const buttonContainer = inputContainer.createDiv("chat-buttons");
		this.sendButton = buttonContainer.createEl("button", {
			text: "送信",
			cls: "mod-cta",
		});
		this.sendButton.onclick = () => this.sendMessage();

		// Enterキーで送信（Shift+Enterで改行）
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// 既存のメッセージを表示
		this.renderMessages();
	}

	async onClose() {
		// クリーンアップ
		this.inputEl = null;
		this.messagesEl = null;
		this.sendButton = null;
		this.clearButton = null;
	}

	private async sendMessage() {
		if (!this.inputEl || !this.sendButton || this.isLoading) {
			return;
		}

		const message = this.inputEl.value.trim();
		if (!message) {
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

		// ユーザーメッセージを追加
		const userMessage: ChatMessage = {
			role: "user",
			content: message,
		};
		this.messages.push(userMessage);
		this.inputEl.value = "";
		this.renderMessages();

		// ローディング状態
		this.setLoading(true);
		showInfo("AIに送信中...", this.plugin.settings.notificationSettings);

		try {
			// AIに送信
			const response = await aiService.chatCompletion({
				messages: this.messages,
				maxTokens: this.plugin.settings.maxTokens,
			});

			// AIの応答を追加
			const assistantMessage: ChatMessage = {
				role: "assistant",
				content: response.content,
			};
			this.messages.push(assistantMessage);
			this.renderMessages();

			showSuccess(
				"応答を受信しました",
				this.plugin.settings.notificationSettings
			);

			// 自動保存
			if (this.plugin.settings.enableAutoSave) {
				await this.autoSave();
			}
		} catch (error) {
			showError(error, this.plugin.settings.notificationSettings);
			// エラー時はユーザーメッセージを削除
			this.messages.pop();
			this.renderMessages();
		} finally {
			this.setLoading(false);
		}
	}

	private setLoading(loading: boolean) {
		this.isLoading = loading;
		if (this.sendButton) {
			this.sendButton.disabled = loading;
			this.sendButton.textContent = loading ? "送信中..." : "送信";
		}
		if (this.inputEl) {
			this.inputEl.disabled = loading;
		}
	}

	private renderMessages() {
		if (!this.messagesEl) {
			return;
		}

		this.messagesEl.empty();

		if (this.messages.length === 0) {
			const emptyMessage = this.messagesEl.createDiv("chat-empty");
			emptyMessage.createEl("p", {
				text: "メッセージを入力してAIと会話を始めましょう。",
			});
			return;
		}

		for (const message of this.messages) {
			const messageEl = this.messagesEl.createDiv("chat-message");
			messageEl.addClass(`chat-message-${message.role}`);

			const roleEl = messageEl.createDiv("chat-message-role");
			roleEl.textContent = message.role === "user" ? "あなた" : "AI";

			const contentEl = messageEl.createDiv("chat-message-content");
			contentEl.createEl("p", { text: message.content });

			// コピーボタン（AIの応答のみ）
			if (message.role === "assistant") {
				const copyButton = messageEl.createEl("button", {
					text: "コピー",
					cls: "chat-copy-button",
				});
				copyButton.onclick = () => {
					navigator.clipboard.writeText(message.content);
					showSuccess(
						"クリップボードにコピーしました",
						this.plugin.settings.notificationSettings
					);
				};
			}
		}

		// スクロールを最下部に
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private clearHistory() {
		this.messages = [];
		this.renderMessages();
		showSuccess(
			"会話履歴をクリアしました",
			this.plugin.settings.notificationSettings
		);
	}

	private async autoSave() {
		if (this.messages.length > 0) {
			await saveChatHistory(this.app, this.plugin.settings, this.messages);
		}
	}
}

