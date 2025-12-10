/**
 * Knowledge Connect Plugin - Settings Tab
 */

import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import KnowledgeConnectPlugin from "./main";
import { LiteLLMService } from "./services/litellm-service";
import { EmbeddingService, EMBEDDING_MODELS, type EmbeddingModel } from "./services/embedding-service";
import { ModelChangeDialog } from "./utils/model-change-dialog";
import { DirectorySelectorModal } from "./utils/directory-selector-modal";

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

		// ==================== 検索・ベクトル化設定 ====================
		containerEl.createEl("h3", { text: "検索・ベクトル化設定" });

		// ベクトル化対象ディレクトリの設定
		new Setting(containerEl)
			.setName("ベクトル化対象ディレクトリ")
			.setDesc(
				"ベクトル化から除外するフォルダを選択できます。初期設定は全域（すべてのフォルダ）が対象です。"
			)
			.addButton((button) => {
				button.setButtonText("ディレクトリを選択").onClick(() => {
					const modal = new DirectorySelectorModal(
						this.app,
						this.plugin.settings.excludedFolders || [],
						async (excludedFolders: string[]) => {
							this.plugin.settings.excludedFolders = excludedFolders;
							await this.plugin.saveSettings();
							new Notice("ベクトル化対象ディレクトリの設定を保存しました。");
							this.display(); // 再表示
						}
					);
					modal.open();
				});
			});

		// ベクトル化モデル設定
		const embeddingService = new EmbeddingService(this.plugin.settings);
		const supportedModels = embeddingService.getSupportedModels();
		const currentEmbeddingModel = this.plugin.settings.embeddingModel || "openai/text-embedding-ada-002";

		new Setting(containerEl)
			.setName("ベクトル化モデル")
			.setDesc(
				"検索機能で使用するベクトル化（Embedding）モデルを選択してください。モデルを変更すると、既存のインデックスが削除され、再計算が必要になります。"
			)
			.addDropdown((dropdown) => {
				for (const model of supportedModels) {
					const modelInfo = EMBEDDING_MODELS[model];
					dropdown.addOption(model, `${modelInfo.name} (${modelInfo.dimensions}次元)`);
				}
				dropdown.setValue(currentEmbeddingModel);

				dropdown.onChange(async (value) => {
					const newModel = value as EmbeddingModel;
					const oldModel = currentEmbeddingModel;

					// モデルが変更された場合、警告ダイアログを表示
					if (oldModel !== newModel && oldModel) {
						const dialog = new ModelChangeDialog(
							this.app,
							oldModel,
							newModel,
							this.plugin.getSearchService(),
							async (confirmedModel) => {
								this.plugin.settings.embeddingModel = confirmedModel;
								await this.plugin.saveSettings();
								new Notice("ベクトル化モデルを変更しました。再計算が開始されます。");
							}
						);
						dialog.open();
					} else {
						// 初回設定の場合は警告なし
						this.plugin.settings.embeddingModel = newModel;
						await this.plugin.saveSettings();
					}
				});
			});

		// 検索サービス状態
		containerEl.createEl("h3", { text: "検索サービス状態" });

		const statusSetting = new Setting(containerEl)
			.setName("初期化状態")
			.setDesc("検索サービスの初期化状態を表示します。");

		const updateStatus = () => {
			const searchService = this.plugin.getSearchService();
			if (!searchService) {
				statusSetting.descEl.setText("検索サービスが作成されていません。");
				return;
			}

			const status = searchService.getInitializationStatus();
			let statusText = "";
			let statusColor = "";

			if (status.error) {
				statusText = `❌ エラー: ${status.error}`;
				statusColor = "var(--text-error)";
			} else if (status.isReady) {
				statusText = "✅ 初期化完了（利用可能）";
				statusColor = "var(--text-success)";
			} else if (status.isInitialized && status.hasWorker && !status.workerReady) {
				statusText = "⏳ Worker初期化中...";
				statusColor = "var(--text-warning)";
			} else if (status.isInitialized) {
				statusText = "⏳ 初期化中...";
				statusColor = "var(--text-warning)";
			} else {
				statusText = "⏳ 初期化待機中...";
				statusColor = "var(--text-warning)";
			}

			// 詳細情報
			const details = [];
			details.push(`サービス初期化: ${status.isInitialized ? "✅" : "❌"}`);
			details.push(`Worker存在: ${status.hasWorker ? "✅" : "❌"}`);
			details.push(`Worker準備完了: ${status.workerReady ? "✅" : "❌"}`);
			details.push(`利用可能: ${status.isReady ? "✅" : "❌"}`);

			statusSetting.descEl.empty();
			const statusEl = statusSetting.descEl.createEl("div", {
				text: statusText,
			});
			statusEl.style.color = statusColor;
			statusEl.style.fontWeight = "bold";
			statusEl.style.marginBottom = "8px";

			const detailsEl = statusSetting.descEl.createEl("div", {
				text: details.join(" | "),
			});
			detailsEl.style.fontSize = "0.9em";
			detailsEl.style.color = "var(--text-muted)";
		};

		// 初回表示
		updateStatus();

		// 定期的にステータスを更新（1秒ごと）
		this.statusInterval = window.setInterval(updateStatus, 1000);

		// インデックス管理
		containerEl.createEl("h3", { text: "インデックス管理" });

		// 初期インデックス構築ボタン（インデックスが存在しない場合のみ表示）
		const { indexFileExists } = await import('./utils/index-persistence');
		const hasIndex = await indexFileExists(this.plugin);
		
		if (!hasIndex) {
			new Setting(containerEl)
				.setName("初期インデックス構築")
				.setDesc(
					"初回起動時、すべてのMarkdownファイルをベクトル化して検索インデックスを構築します。"
				)
				.addButton((button) => {
					button.setButtonText("インデックス構築を開始").setCta().onClick(async () => {
						const searchService = this.plugin.getSearchService();
						if (!searchService) {
							new Notice("検索サービスが初期化されていません。プラグインを再読み込みしてください。");
							return;
						}

						// 初期化が完了するまで待機
						button.setButtonText("初期化待機中...").setDisabled(true);
						const isReady = await searchService.waitUntilReady(30000);
						if (!isReady) {
							new Notice("検索サービスの初期化がタイムアウトしました。プラグインを再読み込みしてください。");
							button.setButtonText("インデックス構築を開始").setDisabled(false);
							return;
						}
						button.setButtonText("インデックス構築を開始").setDisabled(false);

						try {
							button.setButtonText("構築中...").setDisabled(true);
							const count = await searchService.startInitialIndexing(this.plugin);
							new Notice(`インデックス構築を開始しました。${count}件のファイルをキューに追加しました。`);
							// 設定画面を再表示（ボタンを非表示にするため）
							setTimeout(() => {
								this.display();
							}, 1000);
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : String(error);
							new Notice(`インデックス構築の開始に失敗しました: ${errorMessage}`);
							button.setButtonText("インデックス構築を開始").setDisabled(false);
						}
					});
				});
		}

		// Rebuild Index ボタン
		new Setting(containerEl)
			.setName("インデックス全再構築")
			.setDesc(
				"検索インデックスを完全に再構築します。既存のインデックスが削除され、すべてのファイルが再ベクトル化されます。"
			)
			.addButton((button) => {
				button.setButtonText("再構築を開始").setCta().onClick(async () => {
					const searchService = this.plugin.getSearchService();
					if (!searchService) {
						new Notice("検索サービスが初期化されていません。プラグインを再読み込みしてください。");
						return;
					}

					// 初期化が完了するまで待機
					button.setButtonText("初期化待機中...").setDisabled(true);
					const isReady = await searchService.waitUntilReady(30000);
					if (!isReady) {
						new Notice("検索サービスの初期化がタイムアウトしました。プラグインを再読み込みしてください。");
						button.setButtonText("再構築を開始").setDisabled(false);
						return;
					}
					button.setButtonText("再構築を開始").setDisabled(false);

					try {
						button.setButtonText("再構築中...").setDisabled(true);
						
						// インデックスを再構築
						await searchService.rebuildIndex();
						
						// 全ファイルをキューに追加
						const count = await searchService.startInitialIndexing(this.plugin);
						
						new Notice(`インデックスの再構築を開始しました。${count}件のファイルをキューに追加しました。`);
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						new Notice(`インデックスの再構築に失敗しました: ${errorMessage}`);
					} finally {
						button.setButtonText("再構築を開始").setDisabled(false);
					}
				});
			});

		// 失敗ファイルリスト
		const failedFiles = this.plugin.settings.failedVectorizationFiles || [];
		if (failedFiles.length > 0) {
			new Setting(containerEl)
				.setName("ベクトル化失敗ファイル")
				.setDesc(`ベクトル化に失敗したファイル: ${failedFiles.length}件`)
				.addButton((button) => {
					button.setButtonText("クリア").onClick(async () => {
						this.plugin.settings.failedVectorizationFiles = [];
						await this.plugin.saveSettings();
						this.display(); // 再表示
					});
				});

			// 失敗ファイルのリストを表示
			const failedListEl = containerEl.createDiv("failed-files-list");
			for (const filePath of failedFiles.slice(0, 10)) {
				// 最大10件まで表示
				const fileEl = failedListEl.createEl("p", { text: filePath });
				fileEl.addClass("failed-file-item");
			}
			if (failedFiles.length > 10) {
				failedListEl.createEl("p", {
					text: `...他 ${failedFiles.length - 10}件`,
				});
			}
		}
	}
}

