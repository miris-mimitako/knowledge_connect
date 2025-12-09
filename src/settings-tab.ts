/**
 * Knowledge Connect Plugin - Settings Tab
 */

import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import KnowledgeConnectPlugin from "./main";

export class KnowledgeConnectSettingTab extends PluginSettingTab {
	plugin: KnowledgeConnectPlugin;

	constructor(app: App, plugin: KnowledgeConnectPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl("h2", { text: "Knowledge Connect 設定" });

		// ==================== 基本設定 ====================
		containerEl.createEl("h3", { text: "基本設定" });

		// AIサービス選択
		new Setting(containerEl)
			.setName("AIサービス選択")
			.setDesc("使用するAIサービスプロバイダーを選択してください。OpenRouterは複数のAIモデル（GPT-4、Claude、Geminiなど）に統一APIでアクセスできます。")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("openrouter", "OpenRouter（初期実装）")
					.addOption("litellm", "LiteLLM（将来実装）")
					.setValue(this.plugin.settings.aiService)
					.onChange(async (value) => {
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
					: "選択したAIサービスプロバイダーのAPIキーを設定します。LiteLLMの場合は、LiteLLMサーバーのAPIキーを設定してください。"
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("APIキーを入力してください")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					});
			});

		// APIキーが未設定の場合の警告
		if (!this.plugin.settings.apiKey || this.plugin.settings.apiKey.trim() === "") {
			apiKeySetting.setDesc(
				apiKeySetting.descEl.textContent + " ⚠️ APIキーが設定されていません。機能を使用するには必須です。"
			);
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
	}
}

