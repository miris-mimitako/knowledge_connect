/**
 * MCP Search View
 * MCPサーバーを使用した全文検索機能のView実装
 */

import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import KnowledgeConnectPlugin from "../main";
import { MCPService, type SearchResult } from "../services/mcp-service";
import { showError, showInfo, showSuccess } from "../utils/error-handler";

export const MCP_SEARCH_VIEW_TYPE = "knowledge-connect-mcp-search";

export class MCPSearchView extends ItemView {
	plugin: KnowledgeConnectPlugin;
	private mcpService: MCPService;
	private searchInputEl: HTMLInputElement | null = null;
	private limitInputEl: HTMLInputElement | null = null;
	private searchButton: HTMLButtonElement | null = null;
	private statsButton: HTMLButtonElement | null = null;
	private resultsEl: HTMLElement | null = null;
	private isLoading: boolean = false;
	private currentResults: SearchResult[] = [];
	private currentQuery: string = "";

	constructor(leaf: WorkspaceLeaf, plugin: KnowledgeConnectPlugin) {
		super(leaf);
		this.plugin = plugin;
		const baseUrl = plugin.settings.mcpServerUrl || 'http://127.0.0.1:8000';
		this.mcpService = new MCPService(baseUrl);
	}

	getViewType(): string {
		return MCP_SEARCH_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "MCP検索";
	}

	getIcon(): string {
		return "search";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		// ヘッダー
		const header = container.createDiv("mcp-search-header");
		header.style.backgroundColor = "var(--background-primary)";
		header.style.position = "sticky";
		header.style.top = "0";
		header.style.zIndex = "100";
		header.style.padding = "1rem";
		header.style.borderBottom = "1px solid var(--background-modifier-border)";

		const titleRow = header.createDiv();
		titleRow.style.display = "flex";
		titleRow.style.justifyContent = "space-between";
		titleRow.style.alignItems = "center";
		titleRow.style.marginBottom = "1rem";

		titleRow.createEl("h2", { text: "MCP検索" });

		const buttonRow = titleRow.createDiv();
		buttonRow.style.display = "flex";
		buttonRow.style.gap = "0.5rem";

		// 統計情報ボタン
		this.statsButton = buttonRow.createEl("button", {
			text: "統計情報",
			cls: "mod-secondary",
		});
		this.statsButton.onclick = () => this.showStats();

		// 検索入力エリア
		const searchContainer = header.createDiv("mcp-search-input-container");
		searchContainer.style.display = "flex";
		searchContainer.style.gap = "0.5rem";
		searchContainer.style.alignItems = "center";

		// 検索キーワード入力
		this.searchInputEl = searchContainer.createEl("input", {
			type: "text",
			placeholder: "検索キーワードを入力...",
			cls: "mcp-search-input",
		});
		this.searchInputEl.style.flex = "1";
		this.searchInputEl.style.padding = "0.5rem";
		this.searchInputEl.style.border = "1px solid var(--background-modifier-border)";
		this.searchInputEl.style.borderRadius = "4px";

		// Enterキーで検索
		this.searchInputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.performSearch();
			}
		});

		// 取得件数入力
		const limitContainer = searchContainer.createDiv();
		limitContainer.style.display = "flex";
		limitContainer.style.alignItems = "center";
		limitContainer.style.gap = "0.5rem";

		limitContainer.createEl("span", { text: "件数:" });

		this.limitInputEl = limitContainer.createEl("input", {
			type: "number",
			value: (this.plugin.settings.mcpSearchLimit || 20).toString(),
			min: "1",
			max: "100",
			cls: "mcp-search-limit",
		});
		this.limitInputEl.style.width = "60px";
		this.limitInputEl.style.padding = "0.5rem";
		this.limitInputEl.style.border = "1px solid var(--background-modifier-border)";
		this.limitInputEl.style.borderRadius = "4px";

		// 検索ボタン
		this.searchButton = searchContainer.createEl("button", {
			text: "検索",
			cls: "mod-cta",
		});
		this.searchButton.onclick = () => this.performSearch();

		// 検索結果表示エリア
		this.resultsEl = container.createDiv("mcp-search-results-container");
		this.resultsEl.style.flex = "1";
		this.resultsEl.style.overflowY = "auto";
		this.resultsEl.style.padding = "1rem";

		// 初期メッセージ
		this.showWelcomeMessage();
	}

	async onClose() {
		// クリーンアップ処理があれば実装
	}

	/**
	 * ウェルカムメッセージを表示
	 */
	private showWelcomeMessage() {
		if (!this.resultsEl) return;
		this.resultsEl.empty();
		const welcome = this.resultsEl.createDiv("mcp-search-welcome");
		welcome.style.textAlign = "center";
		welcome.style.padding = "2rem";
		welcome.style.color = "var(--text-muted)";
		welcome.createEl("p", {
			text: "検索キーワードを入力して、MCPサーバーで全文検索を実行してください。",
		});
	}

	/**
	 * 検索を実行
	 */
	private async performSearch() {
		if (!this.searchInputEl || !this.limitInputEl || !this.resultsEl || this.isLoading) {
			return;
		}

		const query = this.searchInputEl.value.trim();
		if (!query) {
			showError("検索キーワードを入力してください", this.plugin.settings.notificationSettings);
			return;
		}

		const limit = parseInt(this.limitInputEl.value) || 50;
		if (limit < 1 || limit > 100) {
			showError("取得件数は1から100の範囲で指定してください", this.plugin.settings.notificationSettings);
			return;
		}

		this.isLoading = true;
		this.currentQuery = query;
		this.setLoadingState(true);

		try {
			const result = await this.mcpService.searchDocuments(query, limit);
			this.currentResults = result.results;

			// 検索結果を表示
			this.displayResults(result.results, result.total);

			if (result.total > 0) {
				showSuccess(
					`${result.total}件の検索結果が見つかりました`,
					this.plugin.settings.notificationSettings
				);
			} else {
				showInfo("検索結果がありませんでした", this.plugin.settings.notificationSettings);
			}
		} catch (error) {
			showError(
				error instanceof Error ? error.message : "検索に失敗しました",
				this.plugin.settings.notificationSettings
			);
			this.showWelcomeMessage();
		} finally {
			this.isLoading = false;
			this.setLoadingState(false);
		}
	}

	/**
	 * 検索結果を表示
	 */
	private displayResults(results: SearchResult[], total: number) {
		if (!this.resultsEl) return;

		this.resultsEl.empty();

		// 検索結果ヘッダー
		const header = this.resultsEl.createDiv("mcp-search-results-header");
		header.style.marginBottom = "1rem";
		header.style.paddingBottom = "0.5rem";
		header.style.borderBottom = "1px solid var(--background-modifier-border)";
		header.createEl("h3", { text: `検索結果: "${this.currentQuery}" (${total}件)` });

		// 検索結果リスト
		const resultsContainer = this.resultsEl.createDiv("mcp-search-results-list");
		resultsContainer.style.display = "flex";
		resultsContainer.style.flexDirection = "column";
		resultsContainer.style.gap = "1rem";

		if (results.length === 0) {
			const noResults = resultsContainer.createDiv("mcp-search-no-results");
			noResults.style.textAlign = "center";
			noResults.style.padding = "2rem";
			noResults.style.color = "var(--text-muted)";
			noResults.createEl("p", { text: "検索結果がありません。" });
			return;
		}

		results.forEach((result, index) => {
			const resultItem = this.createResultItem(result, index + 1);
			resultsContainer.appendChild(resultItem);
		});
	}

	/**
	 * 検索結果アイテムを作成
	 */
	private createResultItem(result: SearchResult, index: number): HTMLElement {
		const item = document.createElement("div");
		item.className = "mcp-search-result-item";
		item.style.padding = "1rem";
		item.style.border = "1px solid var(--background-modifier-border)";
		item.style.borderRadius = "6px";
		item.style.backgroundColor = "var(--background-secondary)";
		item.style.cursor = "pointer";
		item.style.transition = "background-color 0.2s ease";

		// ホバー効果
		item.addEventListener("mouseenter", () => {
			item.style.backgroundColor = "var(--background-modifier-hover)";
		});
		item.addEventListener("mouseleave", () => {
			item.style.backgroundColor = "var(--background-secondary)";
		});

		// ファイルパス（クリック可能）
		const filePath = item.createDiv("mcp-search-file-path");
		filePath.style.marginBottom = "0.5rem";
		const pathLink = filePath.createEl("strong", {
			text: `${index}. ${result.file_path}`,
		});
		pathLink.style.color = "var(--text-accent)";
		pathLink.style.cursor = "pointer";
		pathLink.style.textDecoration = "underline";

		// クリックでファイルを開く
		item.addEventListener("click", async () => {
			await this.openFile(result.file_path);
		});

		// メタ情報
		const metaInfo = item.createDiv("mcp-search-meta");
		metaInfo.style.display = "flex";
		metaInfo.style.gap = "1rem";
		metaInfo.style.marginBottom = "0.5rem";
		metaInfo.style.fontSize = "0.85em";
		metaInfo.style.color = "var(--text-muted)";

		metaInfo.createEl("span", { text: `タイプ: ${result.file_type}` });
		metaInfo.createEl("span", { text: ` | 場所: ${result.location_info}` });

		// スニペット
		const snippet = item.createDiv("mcp-search-snippet");
		snippet.style.marginTop = "0.5rem";
		snippet.style.padding = "0.75rem";
		snippet.style.backgroundColor = "var(--background-primary)";
		snippet.style.borderRadius = "4px";
		snippet.style.borderLeft = "3px solid var(--interactive-accent)";
		snippet.style.fontSize = "0.9em";
		snippet.style.lineHeight = "1.6";
		snippet.createEl("p", { text: result.snippet });

		return item;
	}

	/**
	 * ファイルを開く（新しいタブで）
	 */
	private async openFile(filePath: string) {
		try {
			// ファイルパスをObsidianのバルト内のパスに変換
			// MCPサーバーから返されるパスは絶対パスの可能性があるため、
			// バルトのベースパスと比較して相対パスに変換
			const vaultPath = this.plugin.app.vault.adapter.basePath;
			let relativePath = filePath;

			// 絶対パスの場合、バルトパスを基準に相対パスに変換
			if (filePath.startsWith(vaultPath)) {
				relativePath = filePath.substring(vaultPath.length).replace(/\\/g, "/");
				if (relativePath.startsWith("/")) {
					relativePath = relativePath.substring(1);
				}
			} else {
				// 既に相対パスの場合、Windowsのパス区切り文字を変換
				relativePath = filePath.replace(/\\/g, "/");
			}

			// ファイルを取得
			const file = this.plugin.app.vault.getAbstractFileByPath(relativePath);
			if (file instanceof TFile) {
				// 新しいタブでファイルを開く
				const leaf = this.app.workspace.getLeaf("tab");
				await leaf.openFile(file);
				// 開いたタブをアクティブにする
				this.app.workspace.setActiveLeaf(leaf, { focus: true });
			} else {
				// ファイルが見つからない場合、外部ファイルとして扱う
				// Obsidianの外部リンクとして開く
				showError(
					`ファイルが見つかりません: ${relativePath}`,
					this.plugin.settings.notificationSettings
				);
				console.log("[MCP Search] File not found in vault:", relativePath);
				console.log("[MCP Search] Original path:", filePath);
				console.log("[MCP Search] Vault path:", vaultPath);
			}
		} catch (error) {
			showError(
				error instanceof Error ? error.message : "ファイルを開くのに失敗しました",
				this.plugin.settings.notificationSettings
			);
			console.error("[MCP Search] Error opening file:", error);
		}
	}

	/**
	 * 統計情報を表示
	 */
	private async showStats() {
		try {
			const stats = await this.mcpService.getSearchStats();
			const message = `インデックス済みドキュメント: ${stats.total_documents}件`;
			showSuccess(message, this.plugin.settings.notificationSettings);
			console.log("[MCP Search] Stats:", stats);
		} catch (error) {
			showError(
				error instanceof Error ? error.message : "統計情報の取得に失敗しました",
				this.plugin.settings.notificationSettings
			);
		}
	}

	/**
	 * ローディング状態を設定
	 */
	private setLoadingState(loading: boolean) {
		if (!this.searchButton) return;

		if (loading) {
			this.searchButton.disabled = true;
			this.searchButton.textContent = "検索中...";
		} else {
			this.searchButton.disabled = false;
			this.searchButton.textContent = "検索";
		}
	}
}

