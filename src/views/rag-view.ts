/**
 * RAG View
 * 全文検索ベースのRAGシステムのView実装
 */

import { ItemView, MarkdownView, WorkspaceLeaf } from "obsidian";
import KnowledgeConnectPlugin from "../main";
import { RAGSearchService, type SearchHit } from "../services/rag-search-service";
import { MCPService, type SearchResult } from "../services/mcp-service";
import { showError, showInfo, showSuccess } from "../utils/error-handler";
import { saveToFile } from "../utils/file-manager";
import { SaveDialog } from "../utils/save-dialog";
import type { ChatMessage } from "../services/ai-service-interface";

export const RAG_VIEW_TYPE = "knowledge-connect-rag";

/**
 * メッセージの型定義
 */
interface RAGMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	searchHits?: SearchHit[];
	timestamp: Date;
}

export class RAGView extends ItemView {
	plugin: KnowledgeConnectPlugin;
	private searchService: RAGSearchService;
	private mcpService: MCPService;
	private messages: RAGMessage[] = [];
	private inputEl: HTMLTextAreaElement | null = null;
	private messagesEl: HTMLElement | null = null;
	private sendButton: HTMLButtonElement | null = null;
	private clearButton: HTMLButtonElement | null = null;
	private indexButton: HTMLButtonElement | null = null;
	private saveButton: HTMLButtonElement | null = null;
	private isLoading: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: KnowledgeConnectPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.searchService = new RAGSearchService(plugin.app, plugin.settings);
		const baseUrl = plugin.settings?.mcpServerUrl || 'http://127.0.0.1:8000';
		this.mcpService = new MCPService(baseUrl);
	}

	getViewType(): string {
		return RAG_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "RAG Chat";
	}

	getIcon(): string {
		return "search";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		// ヘッダー
		const header = container.createDiv("rag-header");
		header.style.backgroundColor = "var(--background-primary)";
		header.style.position = "sticky";
		header.style.top = "0";
		header.style.zIndex = "100";
		header.createEl("h2", { text: "RAG Chat" });

		// インデックスボタン
		const indexContainer = header.createDiv("rag-index-container");
		this.indexButton = indexContainer.createEl("button", {
			text: "インデックスを更新",
			cls: "mod-cta",
		});
		this.indexButton.onclick = () => this.updateIndex();

		// メッセージ表示エリア
		this.messagesEl = container.createDiv("rag-messages");
		this.messagesEl.style.flex = "1";
		this.messagesEl.style.overflowY = "auto";
		this.messagesEl.style.padding = "1rem";
		this.messagesEl.style.userSelect = "text";
		this.messagesEl.style.webkitUserSelect = "text";
		this.messagesEl.style.mozUserSelect = "text";
		this.messagesEl.style.msUserSelect = "text";

		// 入力エリア
		const inputContainer = container.createDiv("rag-input-container");
		inputContainer.style.borderTop = "1px solid var(--background-modifier-border)";
		inputContainer.style.padding = "1rem";
		inputContainer.style.backgroundColor = "var(--background-primary)";

		// テキストエリア
		this.inputEl = inputContainer.createEl("textarea", {
			placeholder: "質問を入力してください...",
			cls: "rag-input",
		});
		this.inputEl.style.width = "100%";
		this.inputEl.style.minHeight = "80px";
		this.inputEl.style.resize = "vertical";
		this.inputEl.style.padding = "0.5rem";
		this.inputEl.style.marginBottom = "0.5rem";

		// Enterキーで送信（Shift+Enterで改行）
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.handleSend();
			}
		});

		// ボタンコンテナ
		const buttonContainer = inputContainer.createDiv("rag-button-container");
		buttonContainer.style.display = "flex";
		buttonContainer.style.gap = "0.5rem";

		// 送信ボタン
		this.sendButton = buttonContainer.createEl("button", {
			text: "送信",
			cls: "mod-cta",
		});
		this.sendButton.onclick = () => this.handleSend();

		// クリアボタン
		this.clearButton = buttonContainer.createEl("button", {
			text: "クリア",
		});
		this.clearButton.onclick = () => this.clearMessages();

		// 保存ボタン
		this.saveButton = buttonContainer.createEl("button", {
			text: "ページに保存",
		});
		this.saveButton.onclick = () => this.createPageFromHistory();

		// 初期化メッセージ
		this.addWelcomeMessage();

		// 検索サービスを初期化
		await this.initializeSearchService();
	}

	async onClose() {
		// クリーンアップ処理があれば実装
	}

	/**
	 * 検索サービスを初期化
	 */
	private async initializeSearchService(): Promise<void> {
		try {
			await this.searchService.initialize();
			// 初回は自動でインデックスを実行（バックグラウンドで実行）
			this.updateIndex().catch((error) => {
				console.error("[RAG View] 初回インデックスの実行に失敗しました:", error);
			});
		} catch (error) {
			console.error("[RAG View] 検索サービスの初期化に失敗しました:", error);
			showError("検索サービスの初期化に失敗しました", this.plugin.settings.notificationSettings);
		}
	}

	/**
	 * 質問を日本語として分かち書き（簡易版）
	 * Obsidianプラグイン環境では、kuromojiの辞書ファイルが読み込めないため、
	 * シンプルな日本語処理を使用します
	 */
	private tokenizeQuery(query: string): string[] {
		// 日本語の文字（ひらがな、カタカナ、漢字）を抽出
		const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g;
		const japaneseWords = query.match(japaneseRegex) || [];
		
		// 英語の単語も抽出
		const englishWords = query.match(/[a-zA-Z]+/g) || [];
		
		// 数字も抽出
		const numbers = query.match(/\d+/g) || [];
		
		// すべての単語を結合（重複を除去）
		const allWords = [...new Set([...japaneseWords, ...englishWords, ...numbers])]
			.filter((word) => word.length > 0);
		
		// 単語が抽出できない場合は、元のクエリを返す
		return allWords.length > 0 ? allWords : [query];
	}

	/**
	 * AIで類似単語を抽出
	 */
	private async extractSimilarWords(words: string[]): Promise<string[]> {
		const aiService = this.plugin.getAIService();
		if (!aiService) {
			return words; // AIサービスが利用できない場合は元の単語を返す
		}

		try {
			const response = await aiService.chatCompletion({
				messages: [
					{
						role: "system",
						content:
							"あなたは検索クエリ最適化アシスタントです。与えられた単語リストから、検索に有用な類似語や関連語を抽出してください。",
					},
					{
						role: "user",
						content: `以下の単語リストから、検索に有用な類似語や関連語を抽出してください。\n単語リスト: ${words.join(", ")}\n\n抽出した単語をカンマ区切りで出力してください。元の単語も含めてください。`,
					},
				],
				maxTokens: 200,
			});

			// レスポンスから単語を抽出
			const extractedWords = response.content
				.split(/[,、，]/)
				.map((word) => word.trim())
				.filter((word) => word.length > 0);

			// 元の単語と抽出した単語を結合（重複を除去）
			const allWords = [...new Set([...words, ...extractedWords])];
			return allWords;
		} catch (error) {
			console.error("[RAG View] 類似単語抽出エラー:", error);
			return words; // エラー時は元の単語を返す
		}
	}

	/**
	 * インデックスを更新（公開メソッド）
	 */
	async updateIndex(directoryPath?: string): Promise<void> {
		if (this.indexButton) {
			this.indexButton.disabled = true;
			this.indexButton.textContent = "インデックス中...";
		}

		try {
			// 進捗表示用のメッセージを追加
			this.addMessage({
				id: this.generateId(),
				role: "assistant",
				content: "インデックスの更新を開始します...",
				timestamp: new Date(),
			});

			await this.searchService.indexAllFiles(directoryPath);
			
			// インデックス数を確認
			const indexedCount = await this.searchService.getIndexedCount();
			
			// 完了メッセージ
			this.addMessage({
				id: this.generateId(),
				role: "assistant",
				content: `インデックスの更新が完了しました。\nインデックスされたドキュメント数: ${indexedCount}件`,
				timestamp: new Date(),
			});
			
			showInfo("インデックスの更新が完了しました", this.plugin.settings.notificationSettings);
		} catch (error) {
			console.error("[RAG View] インデックスの更新に失敗しました:", error);
			const errorMessage = error instanceof Error ? error.message : "不明なエラーが発生しました";
			this.addMessage({
				id: this.generateId(),
				role: "assistant",
				content: `インデックスの更新に失敗しました: ${errorMessage}`,
				timestamp: new Date(),
			});
			showError("インデックスの更新に失敗しました", this.plugin.settings.notificationSettings);
		} finally {
			if (this.indexButton) {
				this.indexButton.disabled = false;
				this.indexButton.textContent = "インデックスを更新";
			}
		}
	}

	/**
	 * 送信処理
	 */
	private async handleSend(): Promise<void> {
		if (!this.inputEl || !this.sendButton) {
			return;
		}

		const query = this.inputEl.value.trim();
		if (!query || this.isLoading) {
			return;
		}

		// ユーザーメッセージを追加
		this.addMessage({
			id: this.generateId(),
			role: "user",
			content: query,
			timestamp: new Date(),
		});

		// 入力欄をクリア
		this.inputEl.value = "";
		this.inputEl.style.height = "auto";

		// ローディング状態に設定
		this.setLoading(true);

		try {
			// MCPサーバーのRAGエンドポイントを使用して回答を取得
			const settings = this.plugin.settings;
			
			// 設定からパラメータを取得
			const limit = settings.mcpSearchLimit || 20;
			const hybridWeight = settings.mcpHybridWeight || 0.5;
			const keywordLimit = settings.mcpKeywordLimit || 10;
			const vectorLimit = settings.mcpVectorLimit || 20;
			const expandSynonyms = settings.mcpExpandSynonyms || false;
			const llmProvider = settings.mcpRagLLMProvider;
			const model = settings.mcpRagModel;
			const apiBase = settings.mcpRagApiBase;
			const temperature = settings.mcpRagTemperature || 0.7;
			const maxTokens = settings.mcpRagMaxTokens;

			console.log(`[RAG View] RAGエンドポイントを呼び出し: "${query}"`);

			// POST /search/rag エンドポイントを呼び出し
			const ragResponse = await this.mcpService.ragQueryPost(
				query,
				llmProvider,
				model,
				apiBase,
				limit,
				hybridWeight,
				keywordLimit,
				vectorLimit,
				expandSynonyms,
				temperature,
				maxTokens
			);

			console.log(`[RAG View] RAG回答を取得: モデル=${ragResponse.model_used}, プロバイダー=${ragResponse.provider_used}, ソース数=${ragResponse.sources.length}`);

			// SearchResultをSearchHitに変換
			const searchHits: SearchHit[] = ragResponse.sources.map((source: SearchResult) => ({
				path: source.file_path,
				content: source.snippet || '',
				score: 1.0,
				file_type: source.file_type,
				location_info: source.location_info,
				snippet: source.snippet,
			}));

			// 検索結果を表示（デバッグ用）
			if (searchHits.length > 0) {
				this.addSearchResults(searchHits);
			}

			// 回答を表示（検索結果も含める）
			this.addMessage({
				id: this.generateId(),
				role: "assistant",
				content: ragResponse.answer,
				searchHits: searchHits,
				timestamp: new Date(),
			});
		} catch (error) {
			console.error("[RAG View] エラーが発生しました:", error);
			const errorMessage = error instanceof Error ? error.message : "不明なエラーが発生しました";
			this.addMessage({
				id: this.generateId(),
				role: "assistant",
				content: `エラー: ${errorMessage}`,
				timestamp: new Date(),
			});
			showError(error, this.plugin.settings.notificationSettings);
		} finally {
			this.setLoading(false);
		}
	}

	/**
	 * コンテキストを構築
	 */
	private buildContext(searchHits: SearchHit[]): string {
		if (searchHits.length === 0) {
			return "参考情報: 該当するドキュメントが見つかりませんでした。";
		}

		const contextParts = searchHits.map((hit, index) => {
			// snippetがあればそれを使用、なければcontentを使用
			const content = hit.snippet || hit.content;
			// コンテンツを適切な長さに切り詰め（各ドキュメント最大2000文字）
			const truncatedContent = content.length > 2000
				? content.substring(0, 2000) + "..."
				: content;

			return `[参考情報 ${index + 1}]
ファイルパス: ${hit.path}
${hit.location_info ? `位置情報: ${hit.location_info}\n` : ''}内容:
${truncatedContent}`;
		});

		return `参考情報:\n\n${contextParts.join("\n\n---\n\n")}`;
	}

	/**
	 * 検索結果を表示
	 */
	private addSearchResults(searchHits: SearchHit[]): void {
		if (!this.messagesEl) {
			return;
		}

		const resultsContainer = this.messagesEl.createDiv("rag-search-results");
		resultsContainer.style.marginTop = "0.5rem";
		resultsContainer.style.marginBottom = "0.5rem";
		resultsContainer.style.padding = "0.75rem";
		resultsContainer.style.backgroundColor = "var(--background-secondary)";
		resultsContainer.style.borderRadius = "4px";
		resultsContainer.style.border = "1px solid var(--background-modifier-border)";
		resultsContainer.style.userSelect = "text";
		resultsContainer.style.webkitUserSelect = "text";
		resultsContainer.style.mozUserSelect = "text";
		resultsContainer.style.msUserSelect = "text";

		const resultsTitle = resultsContainer.createEl("div", {
			text: `検索結果: ${searchHits.length}件`,
			cls: "rag-search-results-title",
		});
		resultsTitle.style.fontWeight = "bold";
		resultsTitle.style.marginBottom = "0.5rem";
		resultsTitle.style.fontSize = "0.9em";
		resultsTitle.style.color = "var(--text-muted)";
		resultsTitle.style.userSelect = "text";
		resultsTitle.style.webkitUserSelect = "text";
		resultsTitle.style.mozUserSelect = "text";
		resultsTitle.style.msUserSelect = "text";

		searchHits.forEach((hit, index) => {
			const hitContainer = resultsContainer.createDiv("rag-search-hit");
			hitContainer.style.marginTop = "0.5rem";
			hitContainer.style.padding = "0.5rem";
			hitContainer.style.backgroundColor = "var(--background-primary)";
			hitContainer.style.borderRadius = "2px";
			hitContainer.style.userSelect = "text";
			hitContainer.style.webkitUserSelect = "text";
			hitContainer.style.mozUserSelect = "text";
			hitContainer.style.msUserSelect = "text";

			const pathEl = hitContainer.createEl("div", {
				text: `${index + 1}. ${hit.path}`,
				cls: "rag-search-hit-path",
			});
			pathEl.style.fontSize = "0.85em";
			pathEl.style.color = "var(--text-accent)";
			pathEl.style.marginBottom = "0.25rem";
			pathEl.style.userSelect = "text";
			pathEl.style.webkitUserSelect = "text";
			pathEl.style.mozUserSelect = "text";
			pathEl.style.msUserSelect = "text";

			// スニペットを表示（あれば）
			if (hit.snippet) {
				const snippetEl = hitContainer.createEl("div", {
					text: hit.snippet.substring(0, 200) + (hit.snippet.length > 200 ? "..." : ""),
					cls: "rag-search-hit-snippet",
				});
				snippetEl.style.fontSize = "0.8em";
				snippetEl.style.color = "var(--text-normal)";
				snippetEl.style.marginTop = "0.25rem";
				snippetEl.style.fontStyle = "italic";
				snippetEl.style.userSelect = "text";
				snippetEl.style.webkitUserSelect = "text";
				snippetEl.style.mozUserSelect = "text";
				snippetEl.style.msUserSelect = "text";
			}
		});
	}

	/**
	 * メッセージを追加
	 */
	private addMessage(message: RAGMessage): void {
		this.messages.push(message);
		this.renderMessage(message);
		this.scrollToBottom();
	}

	/**
	 * メッセージをレンダリング
	 */
	private renderMessage(message: RAGMessage): void {
		if (!this.messagesEl) {
			return;
		}

		const messageContainer = this.messagesEl.createDiv("rag-message");
		messageContainer.style.marginBottom = "1rem";
		messageContainer.style.padding = "0.75rem";
		messageContainer.style.borderRadius = "4px";
		messageContainer.style.userSelect = "text";
		messageContainer.style.webkitUserSelect = "text";
		messageContainer.style.mozUserSelect = "text";
		messageContainer.style.msUserSelect = "text";

		if (message.role === "user") {
			messageContainer.style.backgroundColor = "var(--interactive-normal)";
			messageContainer.style.marginLeft = "2rem";
		} else {
			messageContainer.style.backgroundColor = "var(--background-secondary)";
			messageContainer.style.marginRight = "2rem";
		}

		// ロール表示
		const roleEl = messageContainer.createDiv("rag-message-header");
		roleEl.style.display = "flex";
		roleEl.style.justifyContent = "space-between";
		roleEl.style.alignItems = "center";
		roleEl.style.marginBottom = "0.5rem";

		const roleTextEl = roleEl.createEl("div", {
			text: message.role === "user" ? "あなた" : "AI",
			cls: "rag-message-role",
		});
		roleTextEl.style.fontWeight = "bold";
		roleTextEl.style.fontSize = "0.9em";

		// AI回答で検索結果がある場合、保存ボタンを追加
		if (message.role === "assistant" && message.searchHits && message.searchHits.length > 0) {
			const saveButton = roleEl.createEl("button", {
				text: "この回答をページに保存",
				cls: "mod-cta",
			});
			saveButton.style.fontSize = "0.85em";
			saveButton.style.padding = "0.25rem 0.5rem";
			saveButton.onclick = () => this.saveRAGResponse(message);
		}

		// コンテンツ表示
		const contentEl = messageContainer.createDiv("rag-message-content");
		contentEl.style.whiteSpace = "pre-wrap";
		contentEl.style.wordBreak = "break-word";
		contentEl.style.userSelect = "text";
		contentEl.style.webkitUserSelect = "text";
		contentEl.style.mozUserSelect = "text";
		contentEl.style.msUserSelect = "text";
		contentEl.textContent = message.content;
	}

	/**
	 * ウェルカムメッセージを追加
	 */
	private addWelcomeMessage(): void {
		this.addMessage({
			id: this.generateId(),
			role: "assistant",
			content: "こんにちは！RAG Chatへようこそ。\n\nVault内のドキュメントを検索して、その内容を基に質問にお答えします。\n\n質問を入力して送信してください。",
			timestamp: new Date(),
		});
	}

	/**
	 * メッセージをクリア
	 */
	private clearMessages(): void {
		this.messages = [];
		if (this.messagesEl) {
			this.messagesEl.empty();
		}
		this.addWelcomeMessage();
	}

	/**
	 * ローディング状態を設定
	 */
	private setLoading(loading: boolean): void {
		this.isLoading = loading;
		if (this.sendButton) {
			this.sendButton.disabled = loading;
			this.sendButton.textContent = loading ? "送信中..." : "送信";
		}
		if (this.inputEl) {
			this.inputEl.disabled = loading;
		}
	}

	/**
	 * 最下部にスクロール
	 */
	private scrollToBottom(): void {
		if (this.messagesEl) {
			this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
		}
	}

	/**
	 * IDを生成
	 */
	private generateId(): string {
		return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * ファイルパスをObsidianリンク形式に変換
	 */
	private pathToWikiLink(filePath: string): string {
		// 拡張子を除去
		const pathWithoutExt = filePath.replace(/\.md$/, "");
		// パス区切りを/から保持
		return `[[${pathWithoutExt}]]`;
	}

	/**
	 * RAG回答をページとして保存
	 */
	private async saveRAGResponse(message: RAGMessage): Promise<void> {
		if (!message.searchHits || message.searchHits.length === 0) {
			showError(
				"引用元の情報がありません。",
				this.plugin.settings.notificationSettings
			);
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

		// AIにタイトルを生成してもらう
		showInfo("タイトルを生成中...", this.plugin.settings.notificationSettings);
		let generatedTitle = "";

		try {
			const titleResponse = await aiService.chatCompletion({
				messages: [
					{
						role: "system",
						content:
							"あなたはタイトル生成アシスタントです。与えられた回答の内容を分析して、適切なタイトルを1つだけ生成してください。タイトルは30文字以内で、日本語で、ファイル名として使用できる形式（特殊文字なし）で出力してください。タイトル以外の説明や補足は不要です。",
					},
					{
						role: "user",
						content: `以下の回答から適切なタイトルを生成してください：\n\n${message.content.substring(0, 500)}`,
					},
				],
				maxTokens: 50,
			});

			generatedTitle = titleResponse.content.trim();

			// 改行で分割して最初の行を取得
			const firstLine = generatedTitle.split("\n")[0].trim();
			if (firstLine) {
				generatedTitle = firstLine;
			}

			// ファイル名として使用できない文字を削除
			generatedTitle = generatedTitle
				.replace(/[<>:"|?*\/\\]/g, "")
				.replace(/\n/g, " ")
				.replace(/^タイトル[:：]\s*/i, "")
				.replace(/^「|」$/g, "")
				.trim()
				.slice(0, 50);

			if (!generatedTitle) {
				generatedTitle = `RAG回答-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
			}
		} catch (error) {
			console.error("タイトル生成エラー:", error);
			generatedTitle = `RAG回答-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
		}

		// 保存ダイアログを表示
		new SaveDialog(
			this.app,
			this.plugin.settings.defaultSaveFolder,
			generatedTitle,
			async (result) => {
				if (result.cancelled) {
					return;
				}

				// 引用元のリンクを生成
				const referenceLinks = message.searchHits!
					.map((hit) => {
						const link = this.pathToWikiLink(hit.path);
						return `- ${link} (スコア: ${hit.score.toFixed(4)})`;
					})
					.join("\n");

				// ページ内容を構築
				const content = `# ${result.fileName}\n\n## 回答\n\n${message.content}\n\n## 引用元\n\n${referenceLinks}\n\n---\n\n*このページはRAG Chatから生成されました。*`;

				// ファイルを保存
				const file = await saveToFile(this.app, this.plugin.settings, {
					folder: result.folder,
					fileName: result.fileName,
					content: content,
					format: "markdown",
				});

				if (file) {
					showSuccess(
						`ページを作成しました: ${file.path}`,
						this.plugin.settings.notificationSettings
					);
				}
			}
		).open();
	}

	/**
	 * チャット履歴からページを作成
	 */
	private async createPageFromHistory(): Promise<void> {
		if (this.messages.length === 0) {
			showError(
				"チャット履歴がありません。",
				this.plugin.settings.notificationSettings
			);
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

		// AIにタイトルを生成してもらう
		showInfo("タイトルを生成中...", this.plugin.settings.notificationSettings);
		let generatedTitle = "";

		try {
			// チャット履歴の最初の数メッセージを取得（タイトル生成用）
			const previewText = this.messages
				.slice(0, 4)
				.map((msg) => msg.content)
				.join("\n")
				.slice(0, 500); // 最初の500文字のみ

			const titleResponse = await aiService.chatCompletion({
				messages: [
					{
						role: "system",
						content:
							"あなたはタイトル生成アシスタントです。与えられたチャット履歴の内容を分析して、適切なタイトルを1つだけ生成してください。タイトルは30文字以内で、日本語で、ファイル名として使用できる形式（特殊文字なし）で出力してください。タイトル以外の説明や補足は不要です。",
					},
					{
						role: "user",
						content: `以下のチャット履歴から適切なタイトルを生成してください：\n\n${previewText}`,
					},
				],
				maxTokens: 50,
			});

			generatedTitle = titleResponse.content.trim();

			// 改行で分割して最初の行を取得（タイトル以外の説明が含まれる場合があるため）
			const firstLine = generatedTitle.split("\n")[0].trim();
			if (firstLine) {
				generatedTitle = firstLine;
			}

			// ファイル名として使用できない文字を削除
			generatedTitle = generatedTitle
				.replace(/[<>:"|?*\/\\]/g, "")
				.replace(/\n/g, " ")
				.replace(/^タイトル[:：]\s*/i, "") // 「タイトル:」などのプレフィックスを削除
				.replace(/^「|」$/g, "") // 引用符を削除
				.trim()
				.slice(0, 50); // 最大50文字

			if (!generatedTitle) {
				console.warn("タイトルが生成されませんでした。レスポンス:", titleResponse.content);
				generatedTitle = `RAGチャット履歴-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
			}
		} catch (error) {
			// エラーを表示
			showError(error, this.plugin.settings.notificationSettings);
			console.error("タイトル生成エラー:", error);
			// エラー時はタイムスタンプベースのタイトルを使用
			generatedTitle = `RAGチャット履歴-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
		}

		// 保存ダイアログを表示
		new SaveDialog(
			this.app,
			this.plugin.settings.defaultSaveFolder,
			generatedTitle,
			async (result) => {
				if (result.cancelled) {
					return;
				}

				// チャット履歴をMarkdown形式に変換
				const content = `# ${result.fileName}\n\n${this.messages
					.map((msg) => {
						const role = msg.role === "user" ? "あなた" : "AI";
						return `## ${role}\n\n${msg.content}`;
					})
					.join("\n\n---\n\n")}`;

				// ファイルを保存
				const file = await saveToFile(this.app, this.plugin.settings, {
					folder: result.folder,
					fileName: result.fileName,
					content: content,
					format: "markdown",
				});

				if (file) {
					showSuccess(
						`ページを作成しました: ${file.path}`,
						this.plugin.settings.notificationSettings
					);
				}
			}
		).open();
	}
}

