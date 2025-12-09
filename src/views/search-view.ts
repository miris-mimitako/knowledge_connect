/**
 * Search View
 * AI Web検索機能のView実装
 * 注意: OpenRouterには直接的なWeb検索機能がないため、AIに検索を依頼する形式で実装
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import KnowledgeConnectPlugin from "../main";
import { showError, showInfo, showSuccess } from "../utils/error-handler";
import { saveSearchResult } from "../utils/file-manager";

export const SEARCH_VIEW_TYPE = "knowledge-connect-search";

interface SearchResult {
	query: string;
	content: string;
	timestamp: number;
}

export class SearchView extends ItemView {
	plugin: KnowledgeConnectPlugin;
	private inputEl: HTMLInputElement | null = null;
	private resultsEl: HTMLElement | null = null;
	private searchButton: HTMLButtonElement | null = null;
	private searchHistory: SearchResult[] = [];
	private isLoading: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: KnowledgeConnectPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return SEARCH_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "AI Search";
	}

	getIcon(): string {
		return "search";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		// ヘッダー
		const header = container.createDiv("search-header");
		header.createEl("h2", { text: "AI検索" });

		// 検索入力エリア
		const inputContainer = container.createDiv("search-input-container");
		this.inputEl = inputContainer.createEl("input", {
			type: "text",
			placeholder: "検索クエリを入力してください...",
			cls: "search-input",
		});

		this.searchButton = inputContainer.createEl("button", {
			text: "検索",
			cls: "mod-cta",
		});
		this.searchButton.onclick = () => this.performSearch();

		// Enterキーで検索
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.performSearch();
			}
		});

		// 検索結果エリア
		this.resultsEl = container.createDiv("search-results");

		// 初期メッセージ
		this.showInitialMessage();
	}

	async onClose() {
		this.inputEl = null;
		this.resultsEl = null;
		this.searchButton = null;
	}

	private async performSearch() {
		if (!this.inputEl || !this.searchButton || this.isLoading) {
			return;
		}

		const query = this.inputEl.value.trim();
		if (!query) {
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

		this.setLoading(true);
		if (this.resultsEl) {
			this.resultsEl.empty();
			this.resultsEl.createEl("p", { text: "検索中..." });
		}

		try {
			// AIに検索を依頼（実際のWeb検索ではなく、AIの知識ベースから情報を提供）
			const prompt = `以下のクエリについて、最新の情報や関連情報を提供してください。可能であれば、情報源や参考になるURLも含めてください。\n\nクエリ: ${query}`;

			const response = await aiService.chatCompletion({
				messages: [
					{
						role: "system",
						content: "あなたは情報検索アシスタントです。ユーザーのクエリに対して、関連する情報を提供してください。",
					},
					{
						role: "user",
						content: prompt,
					},
				],
				maxTokens: this.plugin.settings.maxTokens,
			});

			// 検索結果を保存
			const result: SearchResult = {
				query,
				content: response.content,
				timestamp: Date.now(),
			};
			this.searchHistory.unshift(result);

			// 履歴を制限
			if (this.searchHistory.length > this.plugin.settings.searchMaxResults) {
				this.searchHistory = this.searchHistory.slice(
					0,
					this.plugin.settings.searchMaxResults
				);
			}

			this.renderResults();

			showSuccess(
				"検索が完了しました",
				this.plugin.settings.notificationSettings
			);

			// 自動保存
			if (this.plugin.settings.enableAutoSave) {
				await this.autoSave();
			}
		} catch (error) {
			showError(error, this.plugin.settings.notificationSettings);
			this.showInitialMessage();
		} finally {
			this.setLoading(false);
		}
	}

	private renderResults() {
		if (!this.resultsEl) {
			return;
		}

		this.resultsEl.empty();

		if (this.searchHistory.length === 0) {
			this.showInitialMessage();
			return;
		}

		// 最新の検索結果を表示
		const latestResult = this.searchHistory[0];
		const resultEl = this.resultsEl.createDiv("search-result-item");

		resultEl.createEl("h3", { text: `検索: ${latestResult.query}` });
		const contentEl = resultEl.createDiv("search-result-content");
		contentEl.createEl("p", { text: latestResult.content });

		// アクションボタン
		const actionsEl = resultEl.createDiv("search-result-actions");

		const copyButton = actionsEl.createEl("button", {
			text: "コピー",
			cls: "mod-cta",
		});
		copyButton.onclick = () => {
			navigator.clipboard.writeText(latestResult.content);
			showSuccess(
				"クリップボードにコピーしました",
				this.plugin.settings.notificationSettings
			);
		};

		const saveButton = actionsEl.createEl("button", {
			text: "ファイルに保存",
			cls: "mod-cta",
		});
		saveButton.onclick = () => {
			this.saveToFile(latestResult);
		};

		// 検索履歴
		if (this.searchHistory.length > 1) {
			const historyEl = this.resultsEl.createDiv("search-history");
			historyEl.createEl("h4", { text: "検索履歴" });

			for (let i = 1; i < this.searchHistory.length; i++) {
				const historyItem = this.searchHistory[i];
				const historyItemEl = historyEl.createDiv("search-history-item");
				historyItemEl.createEl("p", {
					text: historyItem.query,
					cls: "search-history-query",
				});
				historyItemEl.onclick = () => {
					if (this.inputEl) {
						this.inputEl.value = historyItem.query;
					}
					this.performSearch();
				};
			}
		}
	}

	private showInitialMessage() {
		if (!this.resultsEl) {
			return;
		}

		this.resultsEl.empty();
		const emptyMessage = this.resultsEl.createDiv("search-empty");
		emptyMessage.createEl("p", {
			text: "検索クエリを入力して検索を実行してください。",
		});
	}

	private setLoading(loading: boolean) {
		this.isLoading = loading;
		if (this.searchButton) {
			this.searchButton.disabled = loading;
			this.searchButton.textContent = loading ? "検索中..." : "検索";
		}
		if (this.inputEl) {
			this.inputEl.disabled = loading;
		}
	}

	private async saveToFile(result: SearchResult) {
		await saveSearchResult(
			this.app,
			this.plugin.settings,
			result.query,
			result.content
		);
	}

	private async autoSave() {
		if (this.searchHistory.length > 0) {
			const latestResult = this.searchHistory[0];
			await saveSearchResult(
				this.app,
				this.plugin.settings,
				latestResult.query,
				latestResult.content
			);
		}
	}
}

