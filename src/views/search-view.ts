/**
 * Search View
 * Oramaベースの検索機能のView実装
 * キーワード検索、ベクトル検索、ハイブリッド検索をサポート
 */

import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import KnowledgeConnectPlugin from "../main";
import { SearchService } from "../services/search-service";
import { EmbeddingService } from "../services/embedding-service";
import { showError, showInfo } from "../utils/error-handler";

export const SEARCH_VIEW_TYPE = "knowledge-connect-search";

export type SearchMode = "keyword" | "vector" | "hybrid";

interface SearchResultItem {
	id: string;
	score: number;
	document: {
		filePath: string;
		title: string;
		content: string;
		metadata?: any;
	};
}

export class SearchView extends ItemView {
	plugin: KnowledgeConnectPlugin;
	private searchService: SearchService | null = null;
	private embeddingService: EmbeddingService | null = null;
	
	// UI要素
	private modeTabs: HTMLElement | null = null;
	private inputEl: HTMLInputElement | null = null;
	private limitSlider: HTMLInputElement | null = null;
	private limitLabel: HTMLElement | null = null;
	private searchButton: HTMLButtonElement | null = null;
	private resultsEl: HTMLElement | null = null;
	
	// 状態
	private currentMode: SearchMode = "keyword";
	private currentLimit: number = 10;
	private isLoading: boolean = false;
	private currentResults: SearchResultItem[] = [];
	private displayedCount: number = 10; // 表示中の件数
	private searchQuery: string = ""; // 現在の検索クエリ（ハイライト用）

	constructor(leaf: WorkspaceLeaf, plugin: KnowledgeConnectPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.searchService = plugin.getSearchService();
		this.embeddingService = new EmbeddingService(plugin.settings);
	}

	getViewType(): string {
		return SEARCH_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "AI検索";
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

		// 検索方式選択タブ
		this.modeTabs = header.createDiv("search-mode-tabs");
		this.createModeTab("keyword", "キーワード", this.modeTabs);
		this.createModeTab("vector", "ベクトル", this.modeTabs);
		this.createModeTab("hybrid", "ハイブリッド", this.modeTabs);

		// 検索入力エリア
		const inputContainer = container.createDiv("search-input-container");
		this.inputEl = inputContainer.createEl("input", {
			type: "text",
			placeholder: "検索クエリを入力してください...",
			cls: "search-input",
		});

		// 結果件数選択（ベクトル検索とハイブリッド検索の場合のみ表示）
		const limitContainer = inputContainer.createDiv("search-limit-container");
		this.limitLabel = limitContainer.createEl("label", {
			text: "結果件数: ",
			cls: "search-limit-label",
		});
		this.limitSlider = limitContainer.createEl("input", {
			type: "range",
			cls: "search-limit-slider",
		}) as HTMLInputElement;
		this.limitSlider.min = "10";
		this.limitSlider.max = "100";
		this.limitSlider.value = "10";
		this.limitSlider.step = "10";
		this.limitSlider.oninput = () => {
			if (this.limitSlider && this.limitLabel) {
				this.currentLimit = parseInt(this.limitSlider.value);
				this.limitLabel.textContent = `結果件数: ${this.currentLimit}`;
			}
		};
		this.updateLimitVisibility();

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
		this.modeTabs = null;
		this.limitSlider = null;
		this.limitLabel = null;
	}

	/**
	 * 検索方式タブを作成
	 */
	private createModeTab(mode: SearchMode, label: string, container: HTMLElement): void {
		const tab = container.createEl("button", {
			text: label,
			cls: "search-mode-tab",
		});
		
		if (mode === this.currentMode) {
			tab.addClass("is-active");
		}

		tab.onclick = () => {
			this.currentMode = mode;
			this.updateModeTabs();
			this.updateLimitVisibility();
		};
	}

	/**
	 * 検索方式タブの状態を更新
	 */
	private updateModeTabs(): void {
		if (!this.modeTabs) return;

		const tabs = this.modeTabs.querySelectorAll(".search-mode-tab");
		tabs.forEach((tab) => {
			if (tab.textContent === this.getModeLabel(this.currentMode)) {
				tab.addClass("is-active");
			} else {
				tab.removeClass("is-active");
			}
		});
	}

	/**
	 * 検索方式のラベルを取得
	 */
	private getModeLabel(mode: SearchMode): string {
		switch (mode) {
			case "keyword":
				return "キーワード";
			case "vector":
				return "ベクトル";
			case "hybrid":
				return "ハイブリッド";
		}
	}

	/**
	 * 結果件数選択の表示/非表示を更新
	 */
	private updateLimitVisibility(): void {
		if (!this.limitSlider || !this.limitLabel) return;

		const shouldShow = this.currentMode === "vector" || this.currentMode === "hybrid";
		if (shouldShow) {
			this.limitSlider.style.display = "block";
			this.limitLabel.style.display = "block";
		} else {
			this.limitSlider.style.display = "none";
			this.limitLabel.style.display = "none";
		}
	}

	/**
	 * 検索を実行
	 */
	private async performSearch() {
		if (!this.inputEl || !this.searchButton || this.isLoading || !this.searchService) {
			return;
		}

		if (!this.searchService.isReady()) {
			showError(
				"検索サービスが準備できていません。しばらく待ってから再度お試しください。",
				this.plugin.settings.notificationSettings
			);
			return;
		}

		const query = this.inputEl.value.trim();
		if (!query) {
			return;
		}

		this.setLoading(true);
		if (this.resultsEl) {
			this.resultsEl.empty();
			this.resultsEl.createEl("p", { text: "検索中..." });
		}

		try {
			let results: SearchResultItem[] = [];

			if (this.currentMode === "keyword") {
				// キーワード検索
				const keywordResults = await this.searchService
					.getWorkerManager()
					?.searchKeyword(query, this.currentLimit);
				if (keywordResults?.hits) {
					results = keywordResults.hits;
				}
			} else if (this.currentMode === "vector") {
				// ベクトル検索
				if (!this.embeddingService?.isApiKeySet()) {
					throw new Error("APIキーが設定されていません。");
				}

				// クエリをベクトル化
				const model = (this.plugin.settings.embeddingModel || "openai/text-embedding-ada-002") as any;
				const embedding = await this.embeddingService.embed(query, model);

				// ベクトル検索
				const vectorResults = await this.searchService
					.getWorkerManager()
					?.searchVector(embedding.vector, this.currentLimit);
				if (vectorResults?.hits) {
					results = vectorResults.hits;
				}
			} else if (this.currentMode === "hybrid") {
				// ハイブリッド検索
				if (!this.embeddingService?.isApiKeySet()) {
					throw new Error("APIキーが設定されていません。");
				}

				// クエリをベクトル化
				const model = (this.plugin.settings.embeddingModel || "openai/text-embedding-ada-002") as any;
				const embedding = await this.embeddingService.embed(query, model);

				// ハイブリッド検索
				const hybridResults = await this.searchService
					.getWorkerManager()
					?.searchHybrid(query, embedding.vector, this.currentLimit);
				if (hybridResults?.hits) {
					results = hybridResults.hits;
				}
			}

			this.currentResults = results;
			this.displayedCount = 10; // 初期表示は10件
			this.searchQuery = query; // ハイライト用に保存
			this.renderResults();
		} catch (error) {
			showError(error, this.plugin.settings.notificationSettings);
			this.showInitialMessage();
		} finally {
			this.setLoading(false);
		}
	}

	/**
	 * 検索結果を表示
	 */
	private renderResults() {
		if (!this.resultsEl) {
			return;
		}

		this.resultsEl.empty();

		if (this.currentResults.length === 0) {
			this.resultsEl.createEl("p", { text: "検索結果が見つかりませんでした。" });
			return;
		}

		// 結果件数を表示
		const countEl = this.resultsEl.createEl("p", {
			text: `検索結果: ${this.currentResults.length}件（表示中: ${Math.min(this.displayedCount, this.currentResults.length)}件）`,
			cls: "search-results-count",
		});

		// 検索結果カードを表示
		const displayResults = this.currentResults.slice(0, this.displayedCount);
		for (const result of displayResults) {
			this.createResultCard(result);
		}

		// ページネーション（「もっと見る」ボタン）
		if (this.displayedCount < this.currentResults.length) {
			const loadMoreButton = this.resultsEl.createEl("button", {
				text: "もっと見る",
				cls: "mod-cta search-load-more",
			});
			loadMoreButton.onclick = () => {
				this.displayedCount = Math.min(this.displayedCount + 10, this.currentResults.length);
				this.renderResults();
			};
		}
	}

	/**
	 * 検索結果カードを作成
	 */
	private createResultCard(result: SearchResultItem) {
		if (!this.resultsEl) return;

		const card = this.resultsEl.createDiv("search-result-card");
		
		// ヘッダー行
		const header = card.createDiv("search-result-header");
		
		// 左側: ファイル名
		const titleEl = header.createEl("span", {
			text: result.document.title || this.getFileName(result.document.filePath),
			cls: "search-result-title",
		});

		// 中央: パンくずリスト（親フォルダ名）
		const pathEl = header.createEl("span", {
			text: this.getShortPath(result.document.filePath),
			cls: "search-result-path",
		});

		// 右側: 最終更新日
		if (result.document.metadata?.lastModified) {
			const date = new Date(result.document.metadata.lastModified);
			header.createEl("span", {
				text: date.toLocaleDateString("ja-JP"),
				cls: "search-result-date",
			});
		}

		// ボディ行（プレビュー、3行制限）
		const body = card.createDiv("search-result-body");
		const preview = this.getPreviewText(result.document.content || "", 3);
		const previewEl = body.createEl("p", {
			cls: "search-result-preview",
		});
		
		// キーワードハイライト（search-16で詳細実装予定、ここでは簡易版）
		previewEl.innerHTML = this.highlightKeywords(preview, this.searchQuery);

		// クリック処理（2画面構成対応）
		card.onclick = () => {
			this.openFile(result.document.filePath);
		};
	}

	/**
	 * ファイル名を取得
	 */
	private getFileName(filePath: string): string {
		const parts = filePath.split("/");
		return parts[parts.length - 1] || filePath;
	}

	/**
	 * 短いパスを取得（親フォルダ名）
	 */
	private getShortPath(filePath: string): string {
		const parts = filePath.split("/");
		if (parts.length <= 2) {
			return parts[0] || "";
		}
		// 最後の2つの階層を表示
		return `.../${parts[parts.length - 2]}/`;
	}

	/**
	 * プレビューテキストを取得（指定行数）
	 */
	private getPreviewText(text: string, maxLines: number = 3): string {
		const lines = text.split("\n").filter((line) => line.trim().length > 0);
		return lines.slice(0, maxLines).join(" ").substring(0, 200);
	}

	/**
	 * キーワードをハイライト（改善版）
	 * 特殊文字をエスケープして安全にハイライト
	 */
	private highlightKeywords(text: string, query: string): string {
		if (!query || query.trim().length === 0) {
			return this.escapeHtml(text);
		}

		// HTMLエスケープ
		let highlighted = this.escapeHtml(text);

		// キーワードを分割（スペース区切り）
		const keywords = query.trim().split(/\s+/).filter((k) => k.length > 0);

		for (const keyword of keywords) {
			if (keyword.length > 0) {
				// 特殊文字をエスケープ
				const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const regex = new RegExp(`(${escapedKeyword})`, "gi");
				highlighted = highlighted.replace(
					regex,
					'<mark class="search-highlight">$1</mark>'
				);
			}
		}

		return highlighted;
	}

	/**
	 * HTMLエスケープ
	 */
	private escapeHtml(text: string): string {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	/**
	 * ファイルを開く（2画面構成対応）
	 */
	private async openFile(filePath: string) {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				return;
			}

			// 2画面構成の場合：左側で閲覧中なら右側で開く
			const activeLeaf = this.app.workspace.getMostRecentLeaf();
			const activeView = activeLeaf?.view;

			// 右側のリーフを取得
			let targetLeaf = await this.app.workspace.getRightLeaf(false);

			// 右側のリーフが見つからない場合はアクティブなリーフで開く
			if (!targetLeaf) {
				targetLeaf = activeLeaf;
			}

			if (targetLeaf) {
				await targetLeaf.openFile(file);
			}
		} catch (error) {
			showError(error, this.plugin.settings.notificationSettings);
		}
	}

	/**
	 * 初期メッセージを表示
	 */
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

	/**
	 * ローディング状態を設定
	 */
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
}
