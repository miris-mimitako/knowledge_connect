/**
 * Chat View
 * AIチャット機能のView実装
 */

import { ItemView, MarkdownRenderer, WorkspaceLeaf } from "obsidian";
import KnowledgeConnectPlugin from "../main";
import type { ChatMessage } from "../services/ai-service-interface";
import { showError, showInfo, showSuccess } from "../utils/error-handler";
import { saveChatHistory, saveToFile } from "../utils/file-manager";
import { SaveDialog } from "../utils/save-dialog";
import { ModelSelectDialog, type ModelSelectResult } from "../utils/model-select-dialog";
import { TitleInputDialog, generateDefaultTitle } from "../utils/title-input-dialog";
import { LiteLLMService } from "../services/litellm-service";

export const CHAT_VIEW_TYPE = "knowledge-connect-chat";

interface ChatMessageWithModel extends ChatMessage {
	model?: string;
}

export class ChatView extends ItemView {
	plugin: KnowledgeConnectPlugin;
	private messages: ChatMessageWithModel[] = [];
	private inputEl: HTMLTextAreaElement | null = null;
	private messagesEl: HTMLElement | null = null;
	private sendButton: HTMLButtonElement | null = null;
	private clearButton: HTMLButtonElement | null = null;
	private modelSelectEl: HTMLSelectElement | null = null;
	private currentModel: string = "";
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

		// 現在のモデルを初期化
		this.currentModel = this.plugin.settings.aiModel;

		// ヘッダー
		const header = container.createDiv("chat-header");
		header.createEl("h2", { text: "AI Chat" });
		
		// モデル選択
		const modelContainer = header.createDiv("chat-model-container");
		modelContainer.createEl("label", { text: "モデル: ", cls: "chat-model-label" });
		this.modelSelectEl = modelContainer.createEl("select", { cls: "chat-model-select" });
		
		// モデルリストを動的に生成
		await this.loadModelOptions();

		// アクションボタン
		const actionButtons = header.createDiv("chat-action-buttons");
		
		const createPageButton = actionButtons.createEl("button", {
			text: "ページを作成",
			cls: "mod-cta",
		});
		createPageButton.onclick = () => this.createPageFromHistory();

		const createSummaryPageButton = actionButtons.createEl("button", {
			text: "要約してページを作成",
			cls: "mod-cta",
		});
		createSummaryPageButton.onclick = () => this.createSummaryPage();

		this.clearButton = actionButtons.createEl("button", {
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
		this.modelSelectEl = null;
	}

	/**
	 * モデル選択のオプションを読み込む
	 */
	private async loadModelOptions() {
		if (!this.modelSelectEl) {
			return;
		}

		// ローディング表示
		this.modelSelectEl.innerHTML = '<option value="">読み込み中...</option>';
		this.modelSelectEl.disabled = true;

		try {
			let models: Array<{ value: string; label: string }> = [];

			if (this.plugin.settings.aiService === "openrouter") {
				// OpenRouterのモデルリスト
				models = [
					{ value: "google/gemini-2.5-flash", label: "Google Gemini 2.5 Flash" },
					{ value: "qwen/qwen3-235b-a22b-2507", label: "Qwen3 235B" },
					{ value: "openai/gpt-oss-120b", label: "OpenAI GPT-OSS 120B" },
					{ value: "openai/gpt-5-mini", label: "OpenAI GPT-5 Mini" },
					{ value: "openai/gpt-5.1", label: "OpenAI GPT-5.1" },
					{ value: "anthropic/claude-sonnet-4.5", label: "Anthropic Claude Sonnet 4.5" },
				];
			} else if (this.plugin.settings.aiService === "litellm") {
				// LiteLLMのモデルリストを取得
				const litellmService = new LiteLLMService(this.plugin.settings);
				if (litellmService.isApiKeySet()) {
					const modelIds = await litellmService.getModels();
					models = modelIds.map((id) => ({ value: id, label: id }));
				} else {
					models = [{ value: "", label: "APIキーが設定されていません" }];
				}
			}

			// オプションを更新
			this.modelSelectEl.innerHTML = "";
			models.forEach((model) => {
				const option = document.createElement("option");
				option.value = model.value;
				option.textContent = model.label;
				this.modelSelectEl!.appendChild(option);
			});

			// 現在のモデルを設定
			if (models.length > 0 && models.some((m) => m.value === this.currentModel)) {
				this.modelSelectEl.value = this.currentModel;
			} else if (models.length > 0 && models[0].value) {
				this.modelSelectEl.value = models[0].value;
				this.currentModel = models[0].value;
			}

			this.modelSelectEl.disabled = false;
			this.modelSelectEl.onchange = (e) => {
				const target = e.target as HTMLSelectElement;
				this.currentModel = target.value;
			};
		} catch (error) {
			console.error("モデルリストの読み込みに失敗しました:", error);
			this.modelSelectEl.innerHTML = '<option value="">エラー: モデルリストを取得できませんでした</option>';
			this.modelSelectEl.disabled = true;
		}
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
		const userMessage: ChatMessageWithModel = {
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
			// AIに送信（現在選択されているモデルを使用）
			const response = await aiService.chatCompletion({
				messages: this.messages.map(msg => ({
					role: msg.role,
					content: msg.content,
				})),
				maxTokens: this.plugin.settings.maxTokens,
				model: this.currentModel,
			});

			// AIの応答を追加（モデル情報も含める）
			const assistantMessage: ChatMessageWithModel = {
				role: "assistant",
				content: response.content,
				model: response.model || this.currentModel,
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
			if (message.role === "user") {
				roleEl.textContent = "あなた";
			} else {
				roleEl.textContent = "AI";
				// モデル名を表示
				if (message.model) {
					const modelName = this.getModelDisplayName(message.model);
					const modelEl = roleEl.createEl("span", {
						text: ` (${modelName})`,
						cls: "chat-model-name",
					});
				}
			}

			const contentEl = messageEl.createDiv("chat-message-content");
			
			// AIの応答はMarkdownとしてレンダリング、ユーザーのメッセージはテキストとして表示
			if (message.role === "assistant") {
				// Markdownをレンダリング
				MarkdownRenderer.render(
					this.app,
					message.content,
					contentEl,
					"",
					this
				);
				
				// コピーボタン
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
			} else {
				// ユーザーのメッセージはテキストとして表示
				contentEl.createEl("p", { text: message.content });
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

	private getModelDisplayName(modelId: string): string {
		const modelNames: Record<string, string> = {
			"google/gemini-2.5-flash": "Gemini 2.5 Flash",
			"qwen/qwen3-235b-a22b-2507": "Qwen3 235B",
			"openai/gpt-oss-120b": "GPT-OSS 120B",
			"openai/gpt-5-mini": "GPT-5 Mini",
			"openai/gpt-5.1": "GPT-5.1",
			"anthropic/claude-sonnet-4.5": "Claude Sonnet 4.5",
		};
		return modelNames[modelId] || modelId;
	}

	/**
	 * チャット履歴からページを作成
	 */
	private async createPageFromHistory() {
		if (this.messages.length === 0) {
			showError(
				"チャット履歴がありません。",
				this.plugin.settings.notificationSettings
			);
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

		// AIにタイトルを生成してもらう
		showInfo("タイトルを生成中...", this.plugin.settings.notificationSettings);
		let generatedTitle = "";
		
		try {
			// チャット履歴の最初の数メッセージを取得（タイトル生成用）
			const previewText = this.messages
				.slice(0, 4)
				.map((msg) => msg.content)
				.join("\n")
				.slice(0, 500); // 最初の500文字のみ

			const titleResponse = await aiService.chatCompletion({
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
				model: this.currentModel,
			});

			generatedTitle = titleResponse.content.trim();
			// ファイル名として使用できない文字を削除
			generatedTitle = generatedTitle
				.replace(/[<>:"|?*\/\\]/g, "")
				.replace(/\n/g, " ")
				.trim()
				.slice(0, 50); // 最大50文字

			if (!generatedTitle) {
				generatedTitle = `チャット履歴-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
			}
		} catch (error) {
			// エラー時はタイムスタンプベースのタイトルを使用
			generatedTitle = `チャット履歴-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
		}

		// 保存ダイアログを表示
		new SaveDialog(
			this.app,
			this.plugin.settings.defaultSaveFolder,
			generatedTitle,
			async (result) => {
				if (result.cancelled) {
					return;
				}

				// チャット履歴をMarkdown形式に変換（生成されたタイトルを含める）
				const content = `# ${result.fileName}\n\n${this.messages
					.map((msg) => {
						const role = msg.role === "user" ? "あなた" : "AI";
						const modelInfo = msg.model
							? ` (${this.getModelDisplayName(msg.model)})`
							: "";
						return `## ${role}${modelInfo}\n\n${msg.content}`;
					})
					.join("\n\n---\n\n")}`;

				// ファイルを保存
				const file = await saveToFile(this.app, this.plugin.settings, {
					folder: result.folder,
					fileName: result.fileName,
					content: content,
					format: "markdown",
				});

				if (file) {
					showSuccess(
						`ページを作成しました: ${file.path}`,
						this.plugin.settings.notificationSettings
					);
				}
			}
		).open();
	}

	/**
	 * AI要約でページを作成
	 */
	private async createSummaryPage() {
		if (this.messages.length === 0) {
			showError(
				"チャット履歴がありません。",
				this.plugin.settings.notificationSettings
			);
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

		// 利用可能なモデルリストを取得
		let availableModels: Array<{ value: string; label: string }> = [];
		
		if (this.plugin.settings.aiService === "openrouter") {
			// OpenRouterのモデルリスト
			availableModels = [
				{ value: "google/gemini-2.5-flash", label: "Google Gemini 2.5 Flash" },
				{ value: "qwen/qwen3-235b-a22b-2507", label: "Qwen3 235B" },
				{ value: "openai/gpt-oss-120b", label: "OpenAI GPT-OSS 120B" },
				{ value: "openai/gpt-5-mini", label: "OpenAI GPT-5 Mini" },
				{ value: "openai/gpt-5.1", label: "OpenAI GPT-5.1" },
				{ value: "anthropic/claude-sonnet-4.5", label: "Anthropic Claude Sonnet 4.5" },
			];
		} else if (this.plugin.settings.aiService === "litellm") {
			// LiteLLMのモデルリストを取得
			try {
				const litellmService = new LiteLLMService(this.plugin.settings);
				if (litellmService.isApiKeySet()) {
					const modelIds = await litellmService.getModels();
					availableModels = modelIds.map((id) => ({ value: id, label: id }));
				} else {
					showError(
						"APIキーが設定されていません。設定画面でAPIキーを設定してください。",
						this.plugin.settings.notificationSettings
					);
					return;
				}
			} catch (error) {
				showError(
					error instanceof Error ? error.message : "モデルリストの取得に失敗しました",
					this.plugin.settings.notificationSettings
				);
				return;
			}
		}

		// モデル選択ダイアログを表示
		new ModelSelectDialog(
			this.app,
			this.currentModel,
			availableModels,
			async (modelResult: ModelSelectResult) => {
				if (modelResult.cancelled) {
					return;
				}

				const selectedModel = modelResult.model;

				// タイトル入力ダイアログを表示
				const defaultTitle = generateDefaultTitle();
				new TitleInputDialog(
					this.app,
					defaultTitle,
					aiService,
					this.messages.map((msg) => ({
						role: msg.role,
						content: msg.content,
					})),
					selectedModel,
					async (titleResult: { title: string; useAI: boolean; cancelled: boolean }) => {
						if (titleResult.cancelled) {
							return;
						}

						const finalTitle = titleResult.title;

						// AIに要約を生成してもらう
						showInfo("要約を生成中...", this.plugin.settings.notificationSettings);

						try {
							// チャット履歴をテキストに変換
							const chatText = this.messages
								.map((msg) => {
									const role = msg.role === "user" ? "あなた" : "AI";
									return `${role}: ${msg.content}`;
								})
								.join("\n\n");

							// AIに要約を依頼
							const response = await aiService.chatCompletion({
								messages: [
									{
										role: "system",
										content:
											"あなたは優秀な要約アシスタントです。与えられたチャット履歴を分析して、構造化されたMarkdown形式の要約を作成してください。",
									},
									{
										role: "user",
										content: `以下のチャット履歴を要約してください：\n\n${chatText}`,
									},
								],
								maxTokens: this.plugin.settings.maxTokens,
								model: selectedModel,
							});

							const summaryContent = response.content.trim();

							// 保存ダイアログを表示
							new SaveDialog(
								this.app,
								this.plugin.settings.defaultSaveFolder,
								finalTitle,
								async (result) => {
									if (result.cancelled) {
										return;
									}

									// 要約結果に元のチャット履歴も含める
									const content = `# ${result.fileName}\n\n${summaryContent}\n\n---\n\n## 元のチャット履歴\n\n${this.messages
										.map((msg) => {
											const role = msg.role === "user" ? "あなた" : "AI";
											const modelInfo = msg.model
												? ` (${this.getModelDisplayName(msg.model)})`
												: "";
											return `### ${role}${modelInfo}\n\n${msg.content}`;
										})
										.join("\n\n")}`;

									// ファイルを保存
									const file = await saveToFile(this.app, this.plugin.settings, {
										folder: result.folder,
										fileName: result.fileName,
										content: content,
										format: "markdown",
									});

									if (file) {
										showSuccess(
											`要約ページを作成しました: ${file.path}`,
											this.plugin.settings.notificationSettings
										);
									}
								}
							).open();
						} catch (error) {
							showError(error, this.plugin.settings.notificationSettings);
							// エラー時はタイムスタンプベースのタイトルで保存ダイアログを表示
							const fallbackTitle = generateDefaultTitle();
							new SaveDialog(
								this.app,
								this.plugin.settings.defaultSaveFolder,
								fallbackTitle,
								async (result) => {
									if (result.cancelled) {
										return;
									}

									// エラー時は元のチャット履歴のみを保存
									const content = `# ${result.fileName}\n\n## チャット履歴\n\n${this.messages
										.map((msg) => {
											const role = msg.role === "user" ? "あなた" : "AI";
											const modelInfo = msg.model
												? ` (${this.getModelDisplayName(msg.model)})`
												: "";
											return `### ${role}${modelInfo}\n\n${msg.content}`;
										})
										.join("\n\n")}`;

									const file = await saveToFile(this.app, this.plugin.settings, {
										folder: result.folder,
										fileName: result.fileName,
										content: content,
										format: "markdown",
									});

									if (file) {
										showSuccess(
											`ページを作成しました: ${file.path}`,
											this.plugin.settings.notificationSettings
										);
									}
								}
							).open();
						}
					}
				).open();
			}
		).open();
	}
}

