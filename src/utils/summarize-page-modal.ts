/**
 * Summarize Page Modal
 * ページ要約設定モーダル
 */

import { App, Modal, Setting } from "obsidian";
import { PromptTemplate } from "../types";
import { AIServiceFactory } from "../services/ai-service-factory";
import { KnowledgeConnectSettings } from "../types";
import { showError, showSuccess } from "./error-handler";

export type SaveLocation = "new-page" | "top" | "bottom";

export interface SummarizePageResult {
	prompt: string;
	model: string;
	saveLocation: SaveLocation;
	cancelled: boolean;
}

export class SummarizePageModal extends Modal {
	result: SummarizePageResult = {
		prompt: "",
		model: "",
		saveLocation: "new-page",
		cancelled: true,
	};
	onSubmit: (result: SummarizePageResult) => void;
	settings: KnowledgeConnectSettings;
	templates: PromptTemplate[];
	availableModels: Array<{ value: string; label: string }> = [];
	private useCustomPrompt: boolean = false;
	private customPromptText: string = "";
	private selectedTemplateId: string = "";

	constructor(
		app: App,
		settings: KnowledgeConnectSettings,
		onSubmit: (result: SummarizePageResult) => void
	) {
		super(app);
		this.settings = settings;
		this.templates = settings.promptTemplates || [];
		this.onSubmit = onSubmit;
		
		// デフォルトモデルを設定
		this.result.model = settings.defaultSummaryModel || settings.aiModel || "";
		
		// デフォルトテンプレートを選択（最初のテンプレート）
		if (this.templates.length > 0) {
			this.selectedTemplateId = this.templates[0].id;
			this.result.prompt = this.templates[0].content;
		}
		
		// 利用可能なモデルリストを準備
		this.prepareAvailableModels();
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", { text: "ページを要約" });

		// テンプレートプロンプト選択セクション
		const templateSection = contentEl.createDiv("summarize-page-template-section");
		templateSection.createEl("h3", { text: "テンプレートプロンプト" });
		
		// テンプレート選択（ドロップダウン）
		if (this.templates.length > 0) {
			// 選択されたテンプレートの内容をプレビュー表示
			const previewDiv = templateSection.createDiv("template-preview");
			previewDiv.style.marginTop = "10px";
			previewDiv.style.padding = "10px";
			previewDiv.style.backgroundColor = "var(--background-secondary)";
			previewDiv.style.borderRadius = "4px";
			
			const updatePreview = () => {
				previewDiv.empty();
				const selectedTemplate = this.templates.find(t => t.id === this.selectedTemplateId);
				if (selectedTemplate) {
					previewDiv.createEl("p", {
						text: selectedTemplate.content,
						cls: "template-preview-content",
					});
				}
			};
			
			new Setting(templateSection)
				.setName("テンプレートを選択")
				.setDesc("使用するテンプレートプロンプトを選択してください")
				.addDropdown((dropdown) => {
					for (const template of this.templates) {
						dropdown.addOption(template.id, template.name);
					}
					dropdown.setValue(this.selectedTemplateId);
					dropdown.onChange((value) => {
						this.selectedTemplateId = value;
						this.useCustomPrompt = false;
						const selectedTemplate = this.templates.find(t => t.id === value);
						if (selectedTemplate) {
							this.result.prompt = selectedTemplate.content;
						}
						updatePreview();
						this.updateCustomPromptVisibility();
					});
				});
			
			// 初期プレビューを表示
			updatePreview();
		}

		// カスタムプロンプトセクション
		const customSection = contentEl.createDiv("summarize-page-custom-section");
		customSection.createEl("h3", { text: "カスタムプロンプト" });
		
		const customCheckboxSetting = new Setting(customSection)
			.setName("カスタムプロンプトを使用")
			.setDesc("独自のプロンプトを入力して使用します")
			.addToggle((toggle) => {
				toggle.setValue(this.useCustomPrompt);
				toggle.onChange((value) => {
					this.useCustomPrompt = value;
					if (value) {
						this.result.prompt = this.customPromptText;
					} else {
						// 選択されているテンプレートのプロンプトに戻す
						const selectedTemplate = this.templates.find(t => t.id === this.selectedTemplateId);
						if (selectedTemplate) {
							this.result.prompt = selectedTemplate.content;
						}
					}
					this.updateCustomPromptVisibility();
				});
			});

		// カスタムプロンプト入力テキストエリア
		const customPromptContainer = customSection.createDiv("summarize-page-custom-prompt-container");
		customPromptContainer.style.display = this.useCustomPrompt ? "block" : "none";
		customPromptContainer.style.width = "100%";
		customPromptContainer.style.marginTop = "10px";
		
		const customPromptTextarea = customPromptContainer.createEl("textarea", {
			attr: {
				placeholder: "カスタムプロンプトを入力してください",
				rows: "4",
			},
			cls: "summarize-page-custom-prompt-textarea",
		});
		customPromptTextarea.value = this.customPromptText;
		customPromptTextarea.style.width = "100%";
		customPromptTextarea.style.padding = "4px";
		customPromptTextarea.style.boxSizing = "border-box";
		customPromptTextarea.oninput = (e) => {
			this.customPromptText = (e.target as HTMLTextAreaElement).value;
			if (this.useCustomPrompt) {
				this.result.prompt = this.customPromptText;
			}
		};

		// LLMモデル選択セクション
		const modelSection = contentEl.createDiv("summarize-page-model-section");
		modelSection.createEl("h3", { text: "LLMモデル" });
		
		if (this.availableModels.length > 0) {
			new Setting(modelSection)
				.setName("使用するモデル")
				.setDesc("要約に使用するAIモデルを選択してください")
				.addDropdown((dropdown) => {
					for (const model of this.availableModels) {
						dropdown.addOption(model.value, model.label);
					}
					dropdown.setValue(this.result.model);
					dropdown.onChange((value) => {
						this.result.model = value;
					});
				});
		} else {
			modelSection.createEl("p", {
				text: "利用可能なモデルが見つかりません。設定画面でAPIキーを確認してください。",
				cls: "mod-warning",
			});
		}

		// 保存方法選択セクション
		const saveLocationSection = contentEl.createDiv("summarize-page-save-location-section");
		saveLocationSection.createEl("h3", { text: "保存方法" });
		
		new Setting(saveLocationSection)
			.setName("要約結果の保存先")
			.setDesc("要約結果をどこに保存するか選択してください")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("new-page", "新しいページとして作成")
					.addOption("top", "現在のページの上部に追加")
					.addOption("bottom", "現在のページの下部に追加")
					.setValue(this.result.saveLocation)
					.onChange((value) => {
						this.result.saveLocation = value as SaveLocation;
					});
			});

		// ボタン
		new Setting(contentEl).addButton((button) => {
			button
				.setButtonText("要約を実行")
				.setCta()
				.onClick(() => {
					if (!this.result.prompt || this.result.prompt.trim() === "") {
						showError("プロンプトを入力してください。", this.settings.notificationSettings);
						return;
					}
					if (!this.result.model || this.result.model.trim() === "") {
						showError("モデルを選択してください。", this.settings.notificationSettings);
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

		// カスタムプロンプトの表示/非表示を更新する関数を保存
		this.updateCustomPromptVisibility = () => {
			customPromptContainer.style.display = this.useCustomPrompt ? "block" : "none";
		};
	}

	private updateCustomPromptVisibility: () => void = () => {};

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		if (this.result.cancelled) {
			this.onSubmit(this.result);
		}
	}

	/**
	 * 利用可能なモデルリストを準備
	 */
	private prepareAvailableModels(): void {
		if (this.settings.aiService === "openrouter") {
			// OpenRouterのモデルリスト
			this.availableModels = [
				{ value: "google/gemini-2.5-flash", label: "Google Gemini 2.5 Flash" },
				{ value: "qwen/qwen3-235b-a22b-2507", label: "Qwen3 235B" },
				{ value: "openai/gpt-oss-120b", label: "OpenAI GPT-OSS 120B" },
				{ value: "openai/gpt-5-mini", label: "OpenAI GPT-5 Mini" },
				{ value: "openai/gpt-5.1", label: "OpenAI GPT-5.1" },
				{ value: "anthropic/claude-sonnet-4.5", label: "Anthropic Claude Sonnet 4.5" },
			];
		} else if (this.settings.aiService === "litellm") {
			// LiteLLMの場合は設定されているモデルをデフォルトとして使用
			// 実際のモデルリストは動的に取得する必要があるが、ここでは簡易的にデフォルトモデルを使用
			this.availableModels = [
				{ value: this.settings.aiModel || "", label: this.settings.aiModel || "デフォルトモデル" },
			];
		}
		
		// デフォルトモデルがリストに含まれていない場合は追加
		if (this.result.model && !this.availableModels.find(m => m.value === this.result.model)) {
			this.availableModels.unshift({
				value: this.result.model,
				label: this.result.model,
			});
		}
	}
}

