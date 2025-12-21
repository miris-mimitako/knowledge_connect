/**
 * Search Results Modal
 * 検索結果を表示するモーダル
 */

import { App, Modal } from "obsidian";
import type { SearchResult } from "../services/mcp-service";

export class SearchResultsModal extends Modal {
	private results: SearchResult[];
	private query: string;
	private total: number;

	constructor(app: App, query: string, results: SearchResult[], total: number) {
		super(app);
		this.query = query;
		this.results = results;
		this.total = total;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", { text: `検索結果: "${this.query}"` });
		contentEl.createEl("p", { text: `合計 ${this.total} 件見つかりました` });

		if (this.results.length === 0) {
			contentEl.createEl("p", { text: "検索結果がありません。" });
			return;
		}

		const resultsContainer = contentEl.createEl("div", { cls: "mcp-search-results" });

		this.results.forEach((result, index) => {
			const resultItem = resultsContainer.createEl("div", { cls: "mcp-search-result-item" });

			// ファイルパス
			const filePath = resultItem.createEl("div", { cls: "mcp-search-file-path" });
			filePath.createEl("strong", { text: `${index + 1}. ${result.file_path}` });

			// ファイルタイプと場所情報
			const metaInfo = resultItem.createEl("div", { cls: "mcp-search-meta" });
			metaInfo.createEl("span", { text: `タイプ: ${result.file_type}` });
			metaInfo.createEl("span", { text: ` | 場所: ${result.location_info}` });

			// スニペット
			const snippet = resultItem.createEl("div", { cls: "mcp-search-snippet" });
			snippet.createEl("p", { text: result.snippet });
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

