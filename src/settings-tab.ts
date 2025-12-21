/**
 * Knowledge Connect Plugin - Settings Tab
 */

import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import KnowledgeConnectPlugin from "./main";
import { LiteLLMService } from "./services/litellm-service";
import { MCPService } from "./services/mcp-service";
import { PromptTemplate } from "./types";


export class KnowledgeConnectSettingTab extends PluginSettingTab {
	plugin: KnowledgeConnectPlugin;
	private modelSettingRef: Setting | null = null;
	private statusInterval: number | null = null;

	constructor(app: App, plugin: KnowledgeConnectPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * 現在選択中のサービスのAPIキーを取得
	 */
	private getCurrentApiKey(): string {
		if (this.plugin.settings.aiService === "openrouter") {
			return this.plugin.settings.openrouterApiKey || this.plugin.settings.apiKey || "";
		} else if (this.plugin.settings.aiService === "litellm") {
			return this.plugin.settings.litellmApiKey || this.plugin.settings.apiKey || "";
		}
		return this.plugin.settings.apiKey || "";
	}

	/**
	 * LiteLLMのモデルリストを取得してドロップダウンに設定
	 */
	private async loadLiteLLMModels(
		setting: Setting,
		dropdown: ReturnType<Setting["addDropdown"]> | null
	): Promise<void> {
		try {
			// LiteLLMServiceのインスタンスを作成してモデルリストを取得
			const litellmService = new LiteLLMService(this.plugin.settings);
			
			// select要素を取得（少し待機してから取得）
			let selectEl = setting.settingEl.querySelector("select") as HTMLSelectElement;
			if (!selectEl) {
				// DOMが更新されるまで少し待機
				await new Promise((resolve) => setTimeout(resolve, 100));
				selectEl = setting.settingEl.querySelector("select") as HTMLSelectElement;
			}
			if (!selectEl) {
				console.error("[Settings] select要素が見つかりません。settingEl:", setting.settingEl);
				return;
			}
			console.log("[Settings] select要素を取得しました");

			if (!litellmService.isApiKeySet()) {
				// select要素のオプションを更新（innerHTMLを使わずに安全に更新）
				while (selectEl.firstChild) {
					selectEl.removeChild(selectEl.firstChild);
				}
				const option = document.createElement("option");
				option.value = "";
				option.textContent = "APIキーが設定されていません";
				selectEl.appendChild(option);
				selectEl.value = "";
				selectEl.disabled = true;
				return;
			}

			const models = await litellmService.getModels();

			// select要素がまだ存在するか再確認
			let currentSelectEl = setting.settingEl.querySelector("select") as HTMLSelectElement;
			if (!currentSelectEl) {
				console.error("[Settings] モデル取得後にselect要素が見つかりません");
				return;
			}
			selectEl = currentSelectEl;
			console.log(`[Settings] モデルリスト取得完了: ${models.length}個`);

			// select要素のオプションを更新（innerHTMLを使わずに安全に更新）
			while (selectEl.firstChild) {
				selectEl.removeChild(selectEl.firstChild);
			}

			if (models.length === 0) {
				const option = document.createElement("option");
				option.value = "";
				option.textContent = "モデルが見つかりませんでした";
				selectEl.appendChild(option);
				selectEl.value = "";
				selectEl.disabled = true;
				return;
			}

			// モデルオプションを追加
			models.forEach((model: string) => {
				const option = document.createElement("option");
				option.value = model;
				option.textContent = model;
				selectEl.appendChild(option);
			});

			// 現在の設定値がリストに含まれているか確認
			const currentModel = this.plugin.settings.aiModel;
			if (models.includes(currentModel)) {
				selectEl.value = currentModel;
			} else if (models.length > 0) {
				// 最初のモデルを選択
				selectEl.value = models[0];
				this.plugin.settings.aiModel = models[0];
				await this.plugin.saveSettings();
			}

			selectEl.disabled = false;

			// onChangeイベントを再設定
			selectEl.onchange = async () => {
				this.plugin.settings.aiModel = selectEl.value;
				await this.plugin.saveSettings();
			};

			console.log(`[Settings] モデルリストを更新しました: ${models.length}個のモデル`);
		} catch (error) {
			// エラーの詳細をログに記録
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			console.error("[Settings] モデルリストの取得に失敗しました:", errorMessage);
			console.error("[Settings] エラー詳細:", error);
			
			// select要素を再取得
			let selectEl = setting.settingEl.querySelector("select") as HTMLSelectElement;
			if (!selectEl) {
				// DOMが更新されるまで少し待機
				await new Promise((resolve) => setTimeout(resolve, 100));
				selectEl = setting.settingEl.querySelector("select") as HTMLSelectElement;
			}
			if (selectEl) {
				// innerHTMLを使わずに安全に更新
				while (selectEl.firstChild) {
					selectEl.removeChild(selectEl.firstChild);
				}
				const option = document.createElement("option");
				option.value = "";
				// エラーメッセージを短縮（50文字以内）
				const shortErrorMessage = errorMessage.length > 50 
					? errorMessage.substring(0, 50) + "..." 
					: errorMessage;
				option.textContent = `エラー: ${shortErrorMessage}`;
				selectEl.appendChild(option);
				selectEl.value = "";
				selectEl.disabled = true;
			} else {
				console.error("[Settings] エラー処理時にselect要素が見つかりません");
			}
			
			// ユーザーに通知（詳細なエラーメッセージを表示）
			const noticeMessage = errorMessage.includes("接続") || errorMessage.includes("Failed to fetch")
				? `LiteLLMプロキシに接続できません。エンドポイントURL（${this.plugin.settings.litellmEndpointUrl || "http://localhost:4000"}）とAPIキーを確認してください。`
				: `LiteLLMのモデルリストを取得できませんでした: ${errorMessage}`;
			new Notice(noticeMessage, 8000);
		}
	}

	async display(): Promise<void> {
		const { containerEl } = this;

		// 既存のインターバルをクリア
		if (this.statusInterval !== null) {
			clearInterval(this.statusInterval);
			this.statusInterval = null;
		}

		containerEl.empty();
		containerEl.createEl("h2", { text: "Knowledge Connect 設定" });

		// ==================== 基本設定 ====================
		containerEl.createEl("h3", { text: "基本設定" });

		// AIサービス選択
		new Setting(containerEl)
			.setName("AIサービス選択")
			.setDesc(
				this.plugin.settings.aiService === "openrouter"
					? "使用するAIサービスプロバイダーを選択してください。OpenRouterは複数のAIモデル（GPT-4、Claude、Geminiなど）に統一APIでアクセスできます。"
					: "使用するAIサービスプロバイダーを選択してください。LiteLLMは100以上のLLMを統一的なOpenAI互換インターフェースで利用できるオープンソースライブラリです。"
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("openrouter", "OpenRouter")
					.addOption("litellm", "LiteLLM")
					.setValue(this.plugin.settings.aiService)
					.onChange(async (value) => {
						// 現在のAPIキーを保存
						const currentApiKey = this.getCurrentApiKey();
						if (this.plugin.settings.aiService === "openrouter") {
							this.plugin.settings.openrouterApiKey = currentApiKey;
						} else if (this.plugin.settings.aiService === "litellm") {
							this.plugin.settings.litellmApiKey = currentApiKey;
						}

						this.plugin.settings.aiService = value as "openrouter" | "litellm";
						await this.plugin.saveSettings();
						// サービス変更時に説明文を更新
						this.display();
					})
			);

		// AI APIキー
		const apiKeySetting = new Setting(containerEl)
			.setName("AI APIキー")
			.setDesc(
				this.plugin.settings.aiService === "openrouter"
					? "選択したAIサービスプロバイダーのAPIキーを設定します。OpenRouterの場合は https://openrouter.ai/ でAPIキーを取得できます。"
					: "選択したAIサービスプロバイダーのAPIキーを設定します。LiteLLMの場合は、LiteLLMサーバーで設定したAPIキーを入力してください。"
			)
			.addText((text) => {
				text.inputEl.type = "password";
				const currentApiKey = this.getCurrentApiKey();
				text
					.setPlaceholder("APIキーを入力してください")
					.setValue(currentApiKey)
					.onChange(async (value) => {
						// サービスごとのAPIキーを保存
						if (this.plugin.settings.aiService === "openrouter") {
							this.plugin.settings.openrouterApiKey = value;
						} else if (this.plugin.settings.aiService === "litellm") {
							this.plugin.settings.litellmApiKey = value;
							// LiteLLM選択時はモデルリストだけを再読み込み
							await this.plugin.saveSettings();
							if (this.modelSettingRef) {
								const selectEl = this.modelSettingRef.settingEl.querySelector("select") as HTMLSelectElement;
								if (selectEl) {
									// 一時的にローディング表示
									selectEl.innerHTML = "";
									const loadingOption = document.createElement("option");
									loadingOption.value = "loading";
									loadingOption.textContent = "モデルリストを読み込み中...";
									selectEl.appendChild(loadingOption);
									selectEl.value = "loading";
									selectEl.disabled = true;
									// モデルリストを再読み込み
									this.loadLiteLLMModels(this.modelSettingRef, null);
								}
							}
							return;
						}
						// 後方互換性のためapiKeyも更新
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					});
			});

		// LiteLLMエンドポイントURL（LiteLLM選択時のみ表示）
		if (this.plugin.settings.aiService === "litellm") {
			new Setting(containerEl)
				.setName("LiteLLMエンドポイントURL")
				.setDesc("LiteLLMサーバーのベースURLを設定します。デフォルトは http://localhost:4000 です。")
				.addText((text) =>
					text
						.setPlaceholder("http://localhost:4000")
						.setValue(this.plugin.settings.litellmEndpointUrl || "http://localhost:4000")
						.onChange(async (value) => {
							// URLのバリデーション
							try {
								new URL(value || "http://localhost:4000");
								this.plugin.settings.litellmEndpointUrl = value || "http://localhost:4000";
								await this.plugin.saveSettings();
								// モデルリストだけを再読み込み
								if (this.modelSettingRef) {
									const selectEl = this.modelSettingRef.settingEl.querySelector("select") as HTMLSelectElement;
									if (selectEl) {
										// 一時的にローディング表示
										selectEl.innerHTML = "";
										const loadingOption = document.createElement("option");
										loadingOption.value = "loading";
										loadingOption.textContent = "モデルリストを読み込み中...";
										selectEl.appendChild(loadingOption);
										selectEl.value = "loading";
										selectEl.disabled = true;
										// モデルリストを再読み込み
										this.loadLiteLLMModels(this.modelSettingRef, null);
									}
								}
							} catch {
								new Notice("無効なURL形式です。");
							}
						})
				);
		}

		// APIキーが未設定の場合の警告
		const currentApiKey = this.getCurrentApiKey();
		if (!currentApiKey || currentApiKey.trim() === "") {
			apiKeySetting.setDesc(
				apiKeySetting.descEl.textContent + " ⚠️ APIキーが設定されていません。機能を使用するには必須です。"
			);
		}

		// デフォルトAIモデル選択
		this.modelSettingRef = new Setting(containerEl)
			.setName("デフォルトAIモデル")
			.setDesc("チャットで使用するデフォルトのAIモデルを選択してください。チャット画面でも切り替え可能です。");

		if (this.plugin.settings.aiService === "openrouter") {
			// OpenRouterのモデルリスト
			this.modelSettingRef.addDropdown((dropdown) => {
				dropdown
					.addOption("google/gemini-2.5-flash", "Google Gemini 2.5 Flash")
					.addOption("qwen/qwen3-235b-a22b-2507", "Qwen3 235B")
					.addOption("openai/gpt-oss-120b", "OpenAI GPT-OSS 120B")
					.addOption("openai/gpt-5-mini", "OpenAI GPT-5 Mini")
					.addOption("openai/gpt-5.1", "OpenAI GPT-5.1")
					.addOption("anthropic/claude-sonnet-4.5", "Anthropic Claude Sonnet 4.5")
					.setValue(this.plugin.settings.aiModel)
					.onChange(async (value) => {
						this.plugin.settings.aiModel = value;
						await this.plugin.saveSettings();
					});
			});
		} else {
			// LiteLLMのモデルリスト（動的取得）
			const modelDropdown = this.modelSettingRef.addDropdown((dropdown) => {
				dropdown
					.addOption("loading", "モデルリストを読み込み中...")
					.setValue("loading")
					.setDisabled(true);
			});

			// モデルリストを取得
			this.loadLiteLLMModels(this.modelSettingRef, modelDropdown);
		}

		// デフォルトの保存先フォルダ
		new Setting(containerEl)
			.setName("デフォルトの保存先フォルダ")
			.setDesc(
				"AIが生成したデータのデフォルト保存先フォルダを指定します。空欄の場合はVaultルートに保存されます。"
			)
			.addText((text) =>
				text
					.setPlaceholder("例: AI出力/チャット履歴")
					.setValue(this.plugin.settings.defaultSaveFolder)
					.onChange(async (value) => {
						// 無効な文字をチェック
						const invalidChars = /[<>:"|?*]/;
						if (invalidChars.test(value)) {
							new Notice("フォルダパスに無効な文字が含まれています。");
							return;
						}
						this.plugin.settings.defaultSaveFolder = value;
						await this.plugin.saveSettings();
					})
			)
			.addButton((button) =>
				button.setButtonText("フォルダを選択").onClick(async () => {
					// フォルダ選択ダイアログ（将来実装）
					// 現時点では手動入力のみ
					new Notice("フォルダ選択機能は将来実装予定です。");
				})
			);

		// ==================== 機能設定 ====================
		containerEl.createEl("h3", { text: "機能設定" });

		// チャット履歴の保持期間
		new Setting(containerEl)
			.setName("チャット履歴の保持期間")
			.setDesc("チャット履歴を保持する日数です。この期間を過ぎた履歴は自動的に削除されます。")
			.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder("30")
					.setValue(this.plugin.settings.chatHistoryRetentionDays.toString())
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (isNaN(numValue) || numValue < 1 || numValue > 365) {
							new Notice("値は1から365日の範囲で入力してください。");
							return;
						}
						this.plugin.settings.chatHistoryRetentionDays = numValue;
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton((button) => button.setIcon("calendar").setTooltip("日"));

		// 要約のデフォルト詳細度
		new Setting(containerEl)
			.setName("要約のデフォルト詳細度")
			.setDesc("要約機能のデフォルト詳細度を設定します。実行時にも変更可能です。")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("brief", "簡潔（要点のみ）")
					.addOption("standard", "標準（バランス型）")
					.addOption("detailed", "詳細（包括的）")
					.setValue(this.plugin.settings.summaryDefaultDetail)
					.onChange(async (value) => {
						this.plugin.settings.summaryDefaultDetail = value as "brief" | "standard" | "detailed";
						await this.plugin.saveSettings();
					})
			);

		// Web検索結果の最大取得数
		new Setting(containerEl)
			.setName("Web検索結果の最大取得数")
			.setDesc(
				"Web検索で取得する結果の最大数です。多いほど情報量は増えますが、処理時間とAPIコストが増加します。"
			)
			.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder("10")
					.setValue(this.plugin.settings.searchMaxResults.toString())
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (isNaN(numValue) || numValue < 1 || numValue > 50) {
							new Notice("値は1から50の範囲で入力してください。");
							return;
						}
						this.plugin.settings.searchMaxResults = numValue;
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton((button) => button.setIcon("search").setTooltip("件"));

		// コンテキストメニューを有効化
		new Setting(containerEl)
			.setName("コンテキストメニューを有効化")
			.setDesc("エディタでテキストを選択して右クリックした際に、AI問い合わせメニューを表示します。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableContextMenu).onChange(async (value) => {
					this.plugin.settings.enableContextMenu = value;
					await this.plugin.saveSettings();
				})
			);

		// 自動保存を有効化
		const autoSaveSetting = new Setting(containerEl)
			.setName("自動保存を有効化")
			.setDesc(
				"AIの応答を自動的にデフォルト保存先フォルダに保存します。無効の場合は、手動で保存する必要があります。"
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enableAutoSave).onChange(async (value) => {
					if (value && (!this.plugin.settings.defaultSaveFolder || this.plugin.settings.defaultSaveFolder.trim() === "")) {
						new Notice("自動保存を有効にするには、デフォルトの保存先フォルダを設定してください。");
						toggle.setValue(false);
						return;
					}
					this.plugin.settings.enableAutoSave = value;
					await this.plugin.saveSettings();
				})
			);

		// 自動保存が有効だが保存先が未設定の場合
		if (this.plugin.settings.enableAutoSave && (!this.plugin.settings.defaultSaveFolder || this.plugin.settings.defaultSaveFolder.trim() === "")) {
			autoSaveSetting.setDesc(autoSaveSetting.descEl.textContent + " ⚠️ 保存先フォルダが設定されていません。");
		}

		// ==================== 表示設定 ====================
		containerEl.createEl("h3", { text: "表示設定" });

		// テーマ設定
		new Setting(containerEl)
			.setName("テーマ設定")
			.setDesc("Viewのテーマを設定します。「自動」を選択すると、Obsidianのテーマ設定に従います。")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("auto", "自動（Obsidianの設定に従う）")
					.addOption("light", "ライト")
					.addOption("dark", "ダーク")
					.setValue(this.plugin.settings.theme)
					.onChange(async (value) => {
						this.plugin.settings.theme = value as "auto" | "light" | "dark";
						await this.plugin.saveSettings();
					})
			);

		// 通知設定
		containerEl.createEl("h4", { text: "通知設定" });

		new Setting(containerEl)
			.setName("成功通知を表示")
			.setDesc("操作成功時の通知を表示するかどうか")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.notificationSettings.showSuccess).onChange(async (value) => {
					this.plugin.settings.notificationSettings.showSuccess = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("エラー通知を表示")
			.setDesc("エラー発生時の通知を表示するかどうか")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.notificationSettings.showError).onChange(async (value) => {
					this.plugin.settings.notificationSettings.showError = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("情報通知を表示")
			.setDesc("情報通知（処理開始など）を表示するかどうか")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.notificationSettings.showInfo).onChange(async (value) => {
					this.plugin.settings.notificationSettings.showInfo = value;
					await this.plugin.saveSettings();
				})
			);

		// ==================== 高度な設定 ====================
		containerEl.createEl("h3", { text: "高度な設定" });

		// タイムアウト設定
		new Setting(containerEl)
			.setName("タイムアウト設定")
			.setDesc("AI API呼び出しのタイムアウト時間です。応答が遅い場合はこの値を増やしてください。")
			.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder("60")
					.setValue(this.plugin.settings.timeoutSeconds.toString())
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (isNaN(numValue) || numValue < 10 || numValue > 300) {
							new Notice("値は10から300秒の範囲で入力してください。");
							return;
						}
						this.plugin.settings.timeoutSeconds = numValue;
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton((button) => button.setIcon("clock").setTooltip("秒"));

		// 最大トークン数
		new Setting(containerEl)
			.setName("最大トークン数")
			.setDesc("AIの応答の最大トークン数です。多いほど長い応答が可能ですが、APIコストが増加します。")
			.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder("2000")
					.setValue(this.plugin.settings.maxTokens.toString())
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (isNaN(numValue) || numValue < 100 || numValue > 8000) {
							new Notice("値は100から8000の範囲で入力してください。");
							return;
						}
						this.plugin.settings.maxTokens = numValue;
						await this.plugin.saveSettings();
					});
			})
			.addExtraButton((button) => button.setIcon("hash").setTooltip("トークン"));

		// ==================== ページ要約機能設定 ====================
		containerEl.createEl("h3", { text: "ページ要約機能設定" });

		// デフォルト要約モデル
		if (this.plugin.settings.aiService === "openrouter") {
			new Setting(containerEl)
				.setName("デフォルト要約モデル")
				.setDesc("ページ要約で使用するデフォルトのAIモデルを選択してください。")
				.addDropdown((dropdown) => {
					dropdown
						.addOption("google/gemini-2.5-flash", "Google Gemini 2.5 Flash")
						.addOption("qwen/qwen3-235b-a22b-2507", "Qwen3 235B")
						.addOption("openai/gpt-oss-120b", "OpenAI GPT-OSS 120B")
						.addOption("openai/gpt-5-mini", "OpenAI GPT-5 Mini")
						.addOption("openai/gpt-5.1", "OpenAI GPT-5.1")
						.addOption("anthropic/claude-sonnet-4.5", "Anthropic Claude Sonnet 4.5")
						.setValue(this.plugin.settings.defaultSummaryModel || this.plugin.settings.aiModel)
						.onChange(async (value) => {
							this.plugin.settings.defaultSummaryModel = value;
							await this.plugin.saveSettings();
						});
				});
		} else {
			new Setting(containerEl)
				.setName("デフォルト要約モデル")
				.setDesc("ページ要約で使用するデフォルトのAIモデルを入力してください。空欄の場合はデフォルトAIモデルを使用します。")
				.addText((text) => {
					text
						.setPlaceholder(this.plugin.settings.aiModel)
						.setValue(this.plugin.settings.defaultSummaryModel || "")
						.onChange(async (value) => {
							this.plugin.settings.defaultSummaryModel = value || "";
							await this.plugin.saveSettings();
						});
				});
		}

		// 要約結果の保存先フォルダ
		new Setting(containerEl)
			.setName("要約結果の保存先フォルダ")
			.setDesc(
				"ページ要約結果の保存先フォルダを指定します。空欄の場合は元のページと同じフォルダに保存されます。"
			)
			.addText((text) =>
				text
					.setPlaceholder("例: AI出力/要約")
					.setValue(this.plugin.settings.summarySaveFolder || "")
					.onChange(async (value) => {
						// 無効な文字をチェック
						const invalidChars = /[<>:"|?*]/;
						if (invalidChars.test(value)) {
							new Notice("フォルダパスに無効な文字が含まれています。");
							return;
						}
						this.plugin.settings.summarySaveFolder = value;
						await this.plugin.saveSettings();
					})
			);

		// テンプレートプロンプト管理
		containerEl.createEl("h4", { text: "テンプレートプロンプト管理" });
		containerEl.createEl("p", {
			text: "ページ要約で使用するテンプレートプロンプトを管理します。",
			cls: "setting-item-description",
		});

		// テンプレートプロンプトのリストを表示
		this.displayPromptTemplates(containerEl);

		// 新しいテンプレートを追加するボタン
		new Setting(containerEl).addButton((button) => {
			button
				.setButtonText("新しいテンプレートを追加")
				.setCta()
				.onClick(() => {
					this.addNewPromptTemplate();
				});
		});

		// ==================== MCPサーバー設定 ====================
		containerEl.createEl("h3", { text: "MCPサーバー設定" });

		// MCPサーバーの説明
		containerEl.createEl("p", {
			text: "MCPサーバーを使用して全文検索とベクトル検索を実行できます。サーバーが起動している必要があります。",
			cls: "setting-item-description",
		});

		// MCPサーバーURL
		new Setting(containerEl)
			.setName("MCPサーバーURL")
			.setDesc("MCPサーバーのベースURLを設定します。デフォルトは http://127.0.0.1:8000 です。")
			.addText((text) => {
				text
					.setPlaceholder("http://127.0.0.1:8000")
					.setValue(this.plugin.settings.mcpServerUrl || "http://127.0.0.1:8000")
					.onChange(async (value) => {
						// URLのバリデーション
						try {
							if (value && value.trim() !== "") {
								new URL(value.trim());
								this.plugin.settings.mcpServerUrl = value.trim();
							} else {
								this.plugin.settings.mcpServerUrl = "http://127.0.0.1:8000";
							}
							await this.plugin.saveSettings();
						} catch {
							new Notice("無効なURL形式です。");
						}
					});
			});

		// MCPサーバーの接続確認
		const mcpStatusSetting = new Setting(containerEl)
			.setName("MCPサーバーステータス")
			.setDesc("MCPサーバーへの接続状態を確認します。")
			.addButton((button) => {
				button.setButtonText("接続確認").onClick(async () => {
					button.setDisabled(true);
					button.setButtonText("確認中...");
					try {
						const baseUrl = this.plugin.settings.mcpServerUrl || 'http://127.0.0.1:8000';
						const mcpService = new MCPService(baseUrl);
						const health = await mcpService.checkHealth();
						if (health.healthy) {
							new Notice("MCPサーバーに接続できました");
							mcpStatusSetting.setDesc(`ステータス: ${health.status}`);
						} else {
							new Notice("MCPサーバーに接続できませんでした。サーバーが起動しているか確認してください。");
							mcpStatusSetting.setDesc(`ステータス: ${health.status}`);
						}
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : "不明なエラー";
						new Notice(`MCPサーバーへの接続に失敗しました: ${errorMessage}`);
						console.error("MCPサーバー接続エラー:", error);
						mcpStatusSetting.setDesc(`エラー: ${errorMessage}`);
					} finally {
						button.setDisabled(false);
						button.setButtonText("接続確認");
					}
				});
			});

		// インデックス化用ディレクトリ
		const indexDirectorySetting = new Setting(containerEl)
			.setName("インデックス化対象ディレクトリ")
			.setDesc("全文検索インデックスを作成するディレクトリを指定します。空欄の場合はVaultルートが使用されます。")
			.addText((text) => {
				text
					.setPlaceholder(this.app.vault.adapter.basePath)
					.setValue("")
					.onChange(async (value) => {
						// 設定として保存する必要はない（実行時に使用）
					});
			})
			.addButton((button) => {
				button.setButtonText("インデックス作成").setCta().onClick(async () => {
					const directoryPath = (indexDirectorySetting.components[0] as any).getValue() || this.app.vault.adapter.basePath;
					
					button.setDisabled(true);
					button.setButtonText("作成中...");
					
					try {
						const baseUrl = this.plugin.settings.mcpServerUrl || 'http://127.0.0.1:8000';
						const mcpService = new MCPService(baseUrl);
						
						// サーバー接続確認
						const isAvailable = await mcpService.isServerAvailable();
						if (!isAvailable) {
							throw new Error("MCPサーバーに接続できません。サーバーが起動しているか確認してください。");
						}

						// インデックス作成を開始
						const result = await mcpService.createIndex(directoryPath, false);
						new Notice(`インデックス作成を開始しました（ジョブID: ${result.job_id}）`);
						
						// 進捗を監視（非同期で実行）
						this.monitorIndexJob(result.job_id, button);
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : "不明なエラーが発生しました";
						new Notice(`インデックス作成に失敗しました: ${errorMessage}`);
						console.error("インデックス作成エラー:", error);
						button.setDisabled(false);
						button.setButtonText("インデックス作成");
					}
				});
			});

		// ベクトル化用ディレクトリ
		const vectorizeDirectorySetting = new Setting(containerEl)
			.setName("ベクトル化対象ディレクトリ")
			.setDesc("ベクトル検索用にベクトル化するディレクトリを指定します。空欄の場合はVaultルートが使用されます。")
			.addText((text) => {
				text
					.setPlaceholder(this.app.vault.adapter.basePath)
					.setValue("")
					.onChange(async (value) => {
						// 設定として保存する必要はない（実行時に使用）
					});
			})
			.addButton((button) => {
				button.setButtonText("ベクトル化").setCta().onClick(async () => {
					const directoryPath = (vectorizeDirectorySetting.components[0] as any).getValue() || this.app.vault.adapter.basePath;
					
					button.setDisabled(true);
					button.setButtonText("ベクトル化中...");
					
					try {
						const baseUrl = this.plugin.settings.mcpServerUrl || 'http://127.0.0.1:8000';
						const mcpService = new MCPService(baseUrl);
						
						// サーバー接続確認
						const isAvailable = await mcpService.isServerAvailable();
						if (!isAvailable) {
							throw new Error("MCPサーバーに接続できません。サーバーが起動しているか確認してください。");
						}

						// Embeddingプロバイダーを取得（設定から）
						const provider = this.plugin.settings.mcpVectorizeProvider || 
							(this.plugin.settings.aiService === "openrouter" ? "openrouter" : undefined);
						const model = this.plugin.settings.mcpVectorizeModel;
						const apiBase = this.plugin.settings.mcpVectorizeApiBase;
						const chunkSize = this.plugin.settings.mcpChunkSize || 512;
						const chunkOverlap = this.plugin.settings.mcpChunkOverlap || 50;

						// ベクトル化を開始
						const result = await mcpService.vectorizeDirectory(
							directoryPath, 
							provider, 
							model, 
							apiBase, 
							chunkSize, 
							chunkOverlap
						);
						new Notice(`ベクトル化を開始しました（ジョブID: ${result.job_id}）`);
						
						// 進捗を監視（非同期で実行）
						this.monitorVectorizeJob(result.job_id, button);
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : "不明なエラーが発生しました";
						new Notice(`ベクトル化に失敗しました: ${errorMessage}`);
						console.error("ベクトル化エラー:", error);
						button.setDisabled(false);
						button.setButtonText("ベクトル化");
					}
				});
			});

		// 統計情報表示
		const statsSetting = new Setting(containerEl)
			.setName("統計情報")
			.setDesc("インデックスとベクトルストアの統計情報を表示します。")
			.addButton((button) => {
				button.setButtonText("統計情報を取得").onClick(async () => {
					button.setDisabled(true);
					button.setButtonText("取得中...");
					
					try {
						const baseUrl = this.plugin.settings.mcpServerUrl || 'http://127.0.0.1:8000';
						const mcpService = new MCPService(baseUrl);
						
						// サーバー接続確認
						const isAvailable = await mcpService.isServerAvailable();
						if (!isAvailable) {
							throw new Error("MCPサーバーに接続できません。");
						}

						// 統計情報を取得
						const [searchStats, vectorizeStats] = await Promise.all([
							mcpService.getSearchStats().catch(() => null),
							mcpService.getVectorizeStats().catch(() => null),
						]);

						let message = "統計情報:\n\n";
						if (searchStats) {
							message += `全文検索インデックス:\n`;
							message += `  ドキュメント数: ${searchStats.total_documents}\n`;
							message += `  データベースパス: ${searchStats.database_path}\n\n`;
						}
						if (vectorizeStats) {
							message += `ベクトルストア:\n`;
							message += `  チャンク数: ${vectorizeStats.total_chunks}\n`;
							message += `  コレクション名: ${vectorizeStats.collection_name}\n`;
							message += `  永続化ディレクトリ: ${vectorizeStats.persist_directory}\n`;
						}

						new Notice(message);
						statsSetting.setDesc(message.replace(/\n/g, " "));
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : "不明なエラーが発生しました";
						new Notice(`統計情報の取得に失敗しました: ${errorMessage}`);
						console.error("統計情報取得エラー:", error);
					} finally {
						button.setDisabled(false);
						button.setButtonText("統計情報を取得");
					}
				});
			});

		// ==================== MCP APIパラメータ設定 ====================
		containerEl.createEl("h3", { text: "MCP APIパラメータ設定" });

		// ベクトル化設定
		containerEl.createEl("h4", { text: "ベクトル化設定" });

		// Embeddingプロバイダー
		new Setting(containerEl)
			.setName("Embeddingプロバイダー")
			.setDesc("ベクトル化で使用するEmbeddingプロバイダーを選択してください。未設定の場合はAIサービス設定から推論されます。")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("", "未設定（AIサービス設定から推論）")
					.addOption("openrouter", "OpenRouter")
					.addOption("aws_bedrock", "AWS Bedrock")
					.addOption("litellm", "LiteLLM")
					.setValue(this.plugin.settings.mcpVectorizeProvider || "")
					.onChange(async (value) => {
						this.plugin.settings.mcpVectorizeProvider = value || undefined;
						await this.plugin.saveSettings();
					});
			});

		// Embeddingモデル
		new Setting(containerEl)
			.setName("Embeddingモデル")
			.setDesc("ベクトル化で使用するモデル名を入力してください（例: text-embedding-ada-002, gemini/text-embedding-004）。未設定の場合はデフォルトモデルが使用されます。")
			.addText((text) => {
				text
					.setPlaceholder("例: text-embedding-ada-002")
					.setValue(this.plugin.settings.mcpVectorizeModel || "")
					.onChange(async (value) => {
						this.plugin.settings.mcpVectorizeModel = value || undefined;
						await this.plugin.saveSettings();
					});
			});

		// LiteLLM API Base（ベクトル化用）
		new Setting(containerEl)
			.setName("LiteLLM API Base（ベクトル化用）")
			.setDesc("LiteLLMプロバイダーを使用する場合のカスタムエンドポイントURLを設定します。")
			.addText((text) => {
				text
					.setPlaceholder("例: http://localhost:4000")
					.setValue(this.plugin.settings.mcpVectorizeApiBase || "")
					.onChange(async (value) => {
						if (value && value.trim() !== "") {
							try {
								new URL(value.trim());
								this.plugin.settings.mcpVectorizeApiBase = value.trim();
							} catch {
								new Notice("無効なURL形式です。");
								return;
							}
						} else {
							this.plugin.settings.mcpVectorizeApiBase = undefined;
						}
						await this.plugin.saveSettings();
					});
			});

		// チャンクサイズ
		new Setting(containerEl)
			.setName("チャンクサイズ")
			.setDesc("ベクトル化時のチャンクサイズ（トークン数）を設定します。デフォルト: 512")
			.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder("512")
					.setValue((this.plugin.settings.mcpChunkSize || 512).toString())
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (!isNaN(numValue) && numValue > 0) {
							this.plugin.settings.mcpChunkSize = numValue;
							await this.plugin.saveSettings();
						}
					});
			});

		// チャンクオーバーラップ
		new Setting(containerEl)
			.setName("チャンクオーバーラップ")
			.setDesc("ベクトル化時のオーバーラップサイズ（トークン数）を設定します。デフォルト: 50")
			.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder("50")
					.setValue((this.plugin.settings.mcpChunkOverlap || 50).toString())
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (!isNaN(numValue) && numValue >= 0) {
							this.plugin.settings.mcpChunkOverlap = numValue;
							await this.plugin.saveSettings();
						}
					});
			});

		// 検索設定
		containerEl.createEl("h4", { text: "検索設定" });

		// 検索結果の最大数
		new Setting(containerEl)
			.setName("検索結果の最大数")
			.setDesc("検索結果の最大取得数を設定します。デフォルト: 20（1-100）")
			.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder("20")
					.setValue((this.plugin.settings.mcpSearchLimit || 20).toString())
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (!isNaN(numValue) && numValue >= 1 && numValue <= 100) {
							this.plugin.settings.mcpSearchLimit = numValue;
							await this.plugin.saveSettings();
						} else {
							new Notice("値は1から100の範囲で入力してください。");
						}
					});
			});

		// ハイブリッド検索の重み
		new Setting(containerEl)
			.setName("ハイブリッド検索の重み")
			.setDesc("ベクトル検索の重みを設定します。0.0=全文検索のみ、0.5=等価、1.0=ベクトル検索のみ。デフォルト: 0.5")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.step = "0.1";
				text
					.setPlaceholder("0.5")
					.setValue((this.plugin.settings.mcpHybridWeight || 0.5).toString())
					.onChange(async (value) => {
						const numValue = parseFloat(value);
						if (!isNaN(numValue) && numValue >= 0.0 && numValue <= 1.0) {
							this.plugin.settings.mcpHybridWeight = numValue;
							await this.plugin.saveSettings();
						} else {
							new Notice("値は0.0から1.0の範囲で入力してください。");
						}
					});
			});

		// キーワード検索の取得件数
		new Setting(containerEl)
			.setName("キーワード検索の取得件数")
			.setDesc("各キーワードあたりの全文検索取得件数を設定します。デフォルト: 10（1-50）")
			.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder("10")
					.setValue((this.plugin.settings.mcpKeywordLimit || 10).toString())
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (!isNaN(numValue) && numValue >= 1 && numValue <= 50) {
							this.plugin.settings.mcpKeywordLimit = numValue;
							await this.plugin.saveSettings();
						} else {
							new Notice("値は1から50の範囲で入力してください。");
						}
					});
			});

		// ベクトル検索の取得件数
		new Setting(containerEl)
			.setName("ベクトル検索の取得件数")
			.setDesc("ベクトル検索の取得件数を設定します。デフォルト: 20（1-100）")
			.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder("20")
					.setValue((this.plugin.settings.mcpVectorLimit || 20).toString())
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (!isNaN(numValue) && numValue >= 1 && numValue <= 100) {
							this.plugin.settings.mcpVectorLimit = numValue;
							await this.plugin.saveSettings();
						} else {
							new Notice("値は1から100の範囲で入力してください。");
						}
					});
			});

		// 類義語展開
		new Setting(containerEl)
			.setName("類義語展開を使用")
			.setDesc("検索時に類義語展開を使用するかどうかを設定します。")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.mcpExpandSynonyms || false).onChange(async (value) => {
					this.plugin.settings.mcpExpandSynonyms = value;
					await this.plugin.saveSettings();
				});
			});

		// RAG設定
		containerEl.createEl("h4", { text: "RAG設定" });

		// RAG用LLMプロバイダー
		new Setting(containerEl)
			.setName("RAG用LLMプロバイダー")
			.setDesc("RAG回答生成で使用するLLMプロバイダーを選択してください。未設定の場合はAIサービス設定から推論されます。")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("", "未設定（AIサービス設定から推論）")
					.addOption("openrouter", "OpenRouter")
					.addOption("litellm", "LiteLLM")
					.setValue(this.plugin.settings.mcpRagLLMProvider || "")
					.onChange(async (value) => {
						this.plugin.settings.mcpRagLLMProvider = value || undefined;
						await this.plugin.saveSettings();
					});
			});

		// RAG用LLMモデル
		new Setting(containerEl)
			.setName("RAG用LLMモデル")
			.setDesc("RAG回答生成で使用するLLMモデル名を入力してください。未設定の場合はデフォルトモデルが使用されます。")
			.addText((text) => {
				text
					.setPlaceholder("例: google/gemini-3-flash-preview")
					.setValue(this.plugin.settings.mcpRagModel || "")
					.onChange(async (value) => {
						this.plugin.settings.mcpRagModel = value || undefined;
						await this.plugin.saveSettings();
					});
			});

		// LiteLLM API Base（RAG用）
		new Setting(containerEl)
			.setName("LiteLLM API Base（RAG用）")
			.setDesc("RAG用LiteLLMプロバイダーを使用する場合のカスタムエンドポイントURLを設定します。")
			.addText((text) => {
				text
					.setPlaceholder("例: http://localhost:4000")
					.setValue(this.plugin.settings.mcpRagApiBase || "")
					.onChange(async (value) => {
						if (value && value.trim() !== "") {
							try {
								new URL(value.trim());
								this.plugin.settings.mcpRagApiBase = value.trim();
							} catch {
								new Notice("無効なURL形式です。");
								return;
							}
						} else {
							this.plugin.settings.mcpRagApiBase = undefined;
						}
						await this.plugin.saveSettings();
					});
			});

		// RAG用温度パラメータ
		new Setting(containerEl)
			.setName("RAG用温度パラメータ")
			.setDesc("RAG回答生成時の温度パラメータを設定します。デフォルト: 0.7（0.0-2.0）")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.step = "0.1";
				text
					.setPlaceholder("0.7")
					.setValue((this.plugin.settings.mcpRagTemperature || 0.7).toString())
					.onChange(async (value) => {
						const numValue = parseFloat(value);
						if (!isNaN(numValue) && numValue >= 0.0 && numValue <= 2.0) {
							this.plugin.settings.mcpRagTemperature = numValue;
							await this.plugin.saveSettings();
						} else {
							new Notice("値は0.0から2.0の範囲で入力してください。");
						}
					});
			});

		// RAG用最大トークン数
		new Setting(containerEl)
			.setName("RAG用最大トークン数")
			.setDesc("RAG回答生成時の最大トークン数を設定します。未設定の場合は制限なしです。")
			.addText((text) => {
				text.inputEl.type = "number";
				text
					.setPlaceholder("未設定（制限なし）")
					.setValue(this.plugin.settings.mcpRagMaxTokens ? this.plugin.settings.mcpRagMaxTokens.toString() : "")
					.onChange(async (value) => {
						if (value && value.trim() !== "") {
							const numValue = parseInt(value);
							if (!isNaN(numValue) && numValue > 0) {
								this.plugin.settings.mcpRagMaxTokens = numValue;
							} else {
								this.plugin.settings.mcpRagMaxTokens = undefined;
							}
						} else {
							this.plugin.settings.mcpRagMaxTokens = undefined;
						}
						await this.plugin.saveSettings();
					});
			});
	}

	/**
	 * インデックス作成ジョブの進捗を監視
	 */
	private async monitorIndexJob(jobId: number, button: ReturnType<Setting["addButton"]>): Promise<void> {
		const maxAttempts = 3600; // 最大1時間（2秒間隔）
		let attempts = 0;

		while (attempts < maxAttempts) {
			try {
				const baseUrl = this.plugin.settings.mcpServerUrl || 'http://127.0.0.1:8000';
				const mcpService = new MCPService(baseUrl);
				const job = await mcpService.getJobStatus(jobId);
				
				if (job.status === 'completed') {
					new Notice(`インデックス作成が完了しました（${job.progress.total}ファイル）`);
					button.setDisabled(false);
					button.setButtonText("インデックス作成");
					return;
				} else if (job.status === 'failed') {
					throw new Error(job.error_message || 'インデックス作成が失敗しました');
				} else if (job.status === 'cancelled') {
					throw new Error('インデックス作成がキャンセルされました');
				}

				// 2秒待機
				await new Promise((resolve) => setTimeout(resolve, 2000));
				attempts++;
			} catch (error) {
				console.error("[Settings] ジョブ進捗確認エラー:", error);
				const errorMessage = error instanceof Error ? error.message : "不明なエラーが発生しました";
				new Notice(`インデックス作成エラー: ${errorMessage}`);
				button.setDisabled(false);
				button.setButtonText("インデックス作成");
				return;
			}
		}

		new Notice("インデックス作成のタイムアウト");
		button.setDisabled(false);
		button.setButtonText("インデックス作成");
	}

	/**
	 * ベクトル化ジョブの進捗を監視
	 */
	private async monitorVectorizeJob(jobId: number, button: ReturnType<Setting["addButton"]>): Promise<void> {
		const maxAttempts = 3600; // 最大1時間（2秒間隔）
		let attempts = 0;

		while (attempts < maxAttempts) {
			try {
				const baseUrl = this.plugin.settings.mcpServerUrl || 'http://127.0.0.1:8000';
				const mcpService = new MCPService(baseUrl);
				const job = await mcpService.getJobStatus(jobId);
				
				if (job.status === 'completed') {
					new Notice(`ベクトル化が完了しました（${job.progress.total}ファイル）`);
					button.setDisabled(false);
					button.setButtonText("ベクトル化");
					return;
				} else if (job.status === 'failed') {
					throw new Error(job.error_message || 'ベクトル化が失敗しました');
				} else if (job.status === 'cancelled') {
					throw new Error('ベクトル化がキャンセルされました');
				}

				// 2秒待機
				await new Promise((resolve) => setTimeout(resolve, 2000));
				attempts++;
			} catch (error) {
				console.error("[Settings] ジョブ進捗確認エラー:", error);
				const errorMessage = error instanceof Error ? error.message : "不明なエラーが発生しました";
				new Notice(`ベクトル化エラー: ${errorMessage}`);
				button.setDisabled(false);
				button.setButtonText("ベクトル化");
				return;
			}
		}

		new Notice("ベクトル化のタイムアウト");
		button.setDisabled(false);
		button.setButtonText("ベクトル化");
	}

	/**
	 * テンプレートプロンプトのリストを表示
	 */
	private displayPromptTemplates(containerEl: HTMLElement): void {
		const templates = this.plugin.settings.promptTemplates || [];
		
		// 既存のテンプレート表示をクリア
		const existingSection = containerEl.querySelector(".prompt-templates-section");
		if (existingSection) {
			existingSection.remove();
		}

		const templatesSection = containerEl.createDiv("prompt-templates-section");

		if (templates.length === 0) {
			templatesSection.createEl("p", {
				text: "テンプレートプロンプトがありません。",
				cls: "mod-warning",
			});
			return;
		}

		// 各テンプレートを表示
		for (let i = 0; i < templates.length; i++) {
			const template = templates[i];
			const templateSetting = new Setting(templatesSection)
				.setName(template.name)
				.setDesc(template.content.substring(0, 100) + (template.content.length > 100 ? "..." : ""))
				.addButton((button) => {
					button
						.setButtonText("編集")
						.setIcon("pencil")
						.onClick(() => {
							this.editPromptTemplate(i);
						});
				})
				.addButton((button) => {
					button
						.setButtonText("削除")
						.setIcon("trash")
						.setWarning()
						.onClick(() => {
							this.deletePromptTemplate(i);
						});
				});

			// 最低1つは残す必要がある
			if (templates.length <= 1) {
				templateSetting.components[1].setDisabled(true);
			}
		}
	}

	/**
	 * 新しいテンプレートプロンプトを追加
	 */
	private async addNewPromptTemplate(): Promise<void> {
		const modal = new PromptTemplateEditModal(
			this.app,
			{
				id: `template-${Date.now()}`,
				name: "",
				content: "",
			},
			async (template) => {
				if (!this.plugin.settings.promptTemplates) {
					this.plugin.settings.promptTemplates = [];
				}
				this.plugin.settings.promptTemplates.push(template);
				await this.plugin.saveSettings();
				this.display();
			}
		);
		modal.open();
	}

	/**
	 * テンプレートプロンプトを編集
	 */
	private async editPromptTemplate(index: number): Promise<void> {
		const templates = this.plugin.settings.promptTemplates || [];
		if (index < 0 || index >= templates.length) {
			return;
		}

		const template = { ...templates[index] };
		const modal = new PromptTemplateEditModal(
			this.app,
			template,
			async (editedTemplate) => {
				templates[index] = editedTemplate;
				await this.plugin.saveSettings();
				this.display();
			}
		);
		modal.open();
	}

	/**
	 * テンプレートプロンプトを削除
	 */
	private async deletePromptTemplate(index: number): Promise<void> {
		const templates = this.plugin.settings.promptTemplates || [];
		if (templates.length <= 1) {
			new Notice("最低1つのテンプレートプロンプトが必要です。");
			return;
		}

		if (index < 0 || index >= templates.length) {
			return;
		}

		templates.splice(index, 1);
		await this.plugin.saveSettings();
		this.display();
	}
}

/**
 * テンプレートプロンプト編集モーダル
 */
class PromptTemplateEditModal extends Modal {
	template: PromptTemplate;
	onSubmit: (template: PromptTemplate) => void;

	constructor(
		app: App,
		template: PromptTemplate,
		onSubmit: (template: PromptTemplate) => void
	) {
		super(app);
		this.template = { ...template };
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.template.id ? "テンプレートを編集" : "新しいテンプレートを追加",
		});

		// 名前入力
		new Setting(contentEl)
			.setName("テンプレート名")
			.setDesc("テンプレートの名前を入力してください")
			.addText((text) => {
				text
					.setPlaceholder("例: 簡潔サマリー")
					.setValue(this.template.name)
					.onChange((value) => {
						this.template.name = value;
					});
			});

		// 内容入力
		const contentSetting = new Setting(contentEl)
			.setName("プロンプト内容")
			.setDesc("プロンプトの内容を入力してください")
			.addTextArea((text) => {
				text
					.setPlaceholder("例: 以下の内容を要約してください...")
					.setValue(this.template.content)
					.onChange((value) => {
						this.template.content = value;
					});
				text.inputEl.rows = 6;
				text.inputEl.style.width = "100%";
			});

		// ボタン
		new Setting(contentEl).addButton((button) => {
			button
				.setButtonText("保存")
				.setCta()
				.onClick(() => {
					if (!this.template.name || this.template.name.trim() === "") {
						new Notice("テンプレート名を入力してください。");
						return;
					}
					if (!this.template.content || this.template.content.trim() === "") {
						new Notice("プロンプト内容を入力してください。");
						return;
					}
					this.close();
					this.onSubmit(this.template);
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
	}
}

