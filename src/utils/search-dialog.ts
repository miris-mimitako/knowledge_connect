/**
 * Search Dialog
 * 検索クエリを入力するためのダイアログ
 */

import { App, Modal, Setting } from "obsidian";

export class SearchDialog extends Modal {
	private query: string = "";
	private limit: number = 50;
	private onSubmit: (query: string, limit: number) => void;

	constructor(app: App, onSubmit: (query: string, limit: number) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", { text: "ドキュメント検索" });

		new Setting(contentEl)
			.setName("検索キーワード")
			.setDesc("検索したいキーワードを入力してください")
			.addText((text) =>
				text
					.setPlaceholder("例: プロジェクト")
					.setValue(this.query)
					.onChange((value) => {
						this.query = value;
					})
			);

		new Setting(contentEl)
			.setName("最大取得件数")
			.setDesc("検索結果の最大取得件数（1-100）")
			.addText((text) =>
				text
					.setPlaceholder("50")
					.setValue(this.limit.toString())
					.onChange((value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0 && num <= 100) {
							this.limit = num;
						}
					})
			);

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("検索")
				.setCta()
				.onClick(() => {
					if (this.query.trim()) {
						this.onSubmit(this.query.trim(), this.limit);
						this.close();
					}
				})
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

