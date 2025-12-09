/**
 * Model Select Dialog
 * モデル選択ダイアログ
 */

import { App, Modal, Setting } from "obsidian";

export interface ModelSelectResult {
	model: string;
	cancelled: boolean;
}

export class ModelSelectDialog extends Modal {
	result: ModelSelectResult = {
		model: "",
		cancelled: true,
	};
	onSubmit: (result: ModelSelectResult) => void;
	availableModels: Array<{ value: string; label: string }>;

	constructor(
		app: App,
		defaultModel: string,
		availableModels: Array<{ value: string; label: string }>,
		onSubmit: (result: ModelSelectResult) => void
	) {
		super(app);
		this.result.model = defaultModel;
		this.availableModels = availableModels;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", { text: "モデルを選択" });

		// モデル選択
		new Setting(contentEl)
			.setName("AIモデル")
			.setDesc("要約に使用するAIモデルを選択してください。")
			.addDropdown((dropdown) => {
				for (const model of this.availableModels) {
					dropdown.addOption(model.value, model.label);
				}
				dropdown.setValue(this.result.model);
				dropdown.onChange((value) => {
					this.result.model = value;
				});
			});

		// ボタン
		new Setting(contentEl).addButton((button) => {
			button
				.setButtonText("選択")
				.setCta()
				.onClick(() => {
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
}

