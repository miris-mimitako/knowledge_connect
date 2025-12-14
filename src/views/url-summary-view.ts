/**
 * URL Summary View
 * URLからコンテンツを取得してAI要約するView実装
 */

import { ItemView, WorkspaceLeaf, MarkdownRenderer, requestUrl } from "obsidian";
import KnowledgeConnectPlugin from "../main";
import { showError, showInfo, showSuccess } from "../utils/error-handler";
import { saveToFile } from "../utils/file-manager";
import { SaveDialog } from "../utils/save-dialog";
import { ModelSelectDialog, type ModelSelectResult } from "../utils/model-select-dialog";
import { LiteLLMService } from "../services/litellm-service";

export const URL_SUMMARY_VIEW_TYPE = "knowledge-connect-url-summary";

export class UrlSummaryView extends ItemView {
	plugin: KnowledgeConnectPlugin;
	private urlInputEl: HTMLInputElement | null = null;
	private fetchButton: HTMLButtonElement | null = null;
	private contentEl: HTMLElement | null = null;
	private summaryEl: HTMLElement | null = null;
	private isLoading: boolean = false;
	private fetchedContent: string = "";
	private summaryText: string = "";
	private currentModel: string = "";

	constructor(leaf: WorkspaceLeaf, plugin: KnowledgeConnectPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return URL_SUMMARY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "URL要約";
	}

	getIcon(): string {
		return "link";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		// ヘッダー
		const header = container.createDiv("url-summary-header");
		header.style.backgroundColor = "var(--background-primary)";
		header.style.position = "sticky";
		header.style.top = "0";
		header.style.zIndex = "100";
		header.createEl("h2", { text: "URL要約" });

		// URL入力エリア
		const inputContainer = container.createDiv("url-summary-input-container");
		const urlLabel = inputContainer.createEl("label", {
			text: "URL:",
			cls: "url-summary-label",
		});
		this.urlInputEl = inputContainer.createEl("input", {
			type: "text",
			placeholder: "https://example.com/article",
			cls: "url-summary-input",
		});

		// フェッチボタン
		this.fetchButton = inputContainer.createEl("button", {
			text: "取得して要約",
			cls: "mod-cta",
		});
		this.fetchButton.onclick = () => this.fetchAndSummarize();

		// Enterキーで実行
		this.urlInputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.fetchAndSummarize();
			}
		});

		// コンテンツ表示エリア
		this.contentEl = container.createDiv("url-summary-content");
		
		// 要約結果エリア
		this.summaryEl = container.createDiv("url-summary-summary");

		// 初期メッセージ
		this.showInitialMessage();
	}

	async onClose() {
		this.urlInputEl = null;
		this.fetchButton = null;
		this.contentEl = null;
		this.summaryEl = null;
	}

	/**
	 * URLからコンテンツを取得して要約
	 */
	private async fetchAndSummarize() {
		if (!this.urlInputEl || !this.fetchButton || this.isLoading) {
			return;
		}

		const url = this.urlInputEl.value.trim();
		if (!url) {
			showError(
				"URLを入力してください",
				this.plugin.settings.notificationSettings
			);
			return;
		}

		// URL形式のバリデーション
		try {
			new URL(url);
		} catch {
			showError(
				"有効なURLを入力してください",
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

		this.setLoading(true);
		
		if (this.contentEl) {
			this.contentEl.empty();
			this.contentEl.createEl("p", { text: "コンテンツを取得中..." });
		}
		
		if (this.summaryEl) {
			this.summaryEl.empty();
		}

		try {
			// URLからコンテンツを取得
			showInfo("コンテンツを取得中...", this.plugin.settings.notificationSettings);
			const htmlContent = await this.fetchUrlContent(url);
			
			// h1を含む親要素のテキストを抽出
			this.fetchedContent = this.extractContentFromHtml(htmlContent);
			
			if (!this.fetchedContent || this.fetchedContent.trim().length === 0) {
				throw new Error("コンテンツが見つかりませんでした。h1タグを含む要素が見つからない可能性があります。");
			}

			// 取得したコンテンツを表示
			if (this.contentEl) {
				this.contentEl.empty();
				const contentHeader = this.contentEl.createEl("h3", { text: "取得したコンテンツ" });
				const contentPreview = this.contentEl.createDiv("url-summary-content-preview");
				contentPreview.style.maxHeight = "200px";
				contentPreview.style.overflow = "auto";
				contentPreview.style.padding = "10px";
				contentPreview.style.border = "1px solid var(--background-modifier-border)";
				contentPreview.style.borderRadius = "4px";
				contentPreview.style.whiteSpace = "pre-wrap";
				contentPreview.textContent = this.fetchedContent.substring(0, 1000);
				if (this.fetchedContent.length > 1000) {
					contentPreview.textContent += "\n\n... (以下省略)";
				}
			}

			// モデル選択ダイアログを表示
			await this.showModelSelectAndSummarize(aiService);

		} catch (error) {
			showError(error, this.plugin.settings.notificationSettings);
			this.showInitialMessage();
		} finally {
			this.setLoading(false);
		}
	}

	/**
	 * URLからコンテンツを取得
	 * ObsidianのrequestUrlを使用してCORSエラーを回避
	 */
	private async fetchUrlContent(url: string): Promise<string> {
		try {
			const response = await requestUrl({
				url: url,
				method: "GET",
				headers: {
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
					"Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
				},
			});

			if (response.status < 200 || response.status >= 300) {
				throw new Error(`HTTPエラー: ${response.status} ${response.statusText || "Unknown"}`);
			}

			return response.text;
		} catch (error) {
			if (error instanceof Error) {
				// より詳細なエラーメッセージを提供
				if (error.message.includes("ECONNREFUSED") || error.message.includes("ENOTFOUND")) {
					throw new Error(`接続エラー: URLにアクセスできません。URLを確認してください。 (${error.message})`);
				}
				if (error.message.includes("timeout") || error.message.includes("ETIMEDOUT")) {
					throw new Error(`タイムアウト: URLへの接続がタイムアウトしました。 (${error.message})`);
				}
				throw error;
			}
			throw new Error(`予期しないエラーが発生しました: ${String(error)}`);
		}
	}

	/**
	 * HTMLからh1を含む親要素のテキストを抽出
	 */
	private extractContentFromHtml(html: string): string {
		try {
			// DOMParserを使用してHTMLをパース
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, "text/html");

			// h1タグを検索
			const h1Elements = doc.querySelectorAll("h1");

			if (h1Elements.length === 0) {
				// h1が見つからない場合、bodyの内容を返す
				const body = doc.body;
				if (body) {
					return this.getTextContent(body);
				}
				return "";
			}

			// 各h1に対して、その親要素を探してテキストを抽出
			const contents: string[] = [];

			for (const h1 of Array.from(h1Elements)) {
				// h1を含む最小の親要素を見つける
				// 通常はarticle、main、section、divなどのコンテナ要素
				let parent = h1.parentElement;
				
				// 適切な親要素を探す（article > main > section > div の順で優先）
				while (parent && parent !== doc.body) {
					const tagName = parent.tagName.toLowerCase();
					if (["article", "main", "section"].includes(tagName)) {
						break;
					}
					parent = parent.parentElement;
				}

				// 親要素が見つからない場合は、h1の直接の親を使用
				if (!parent || parent === doc.body) {
					parent = h1.parentElement;
				}

				if (parent) {
					const text = this.getTextContent(parent);
					if (text.trim().length > 0) {
						contents.push(text);
					}
				}
			}

			// 複数のh1がある場合は結合
			return contents.join("\n\n---\n\n");
		} catch (error) {
			console.error("HTMLパースエラー:", error);
			// パースに失敗した場合、HTMLタグを除去してテキストのみを返す
			return html.replace(/<[^>]*>/g, "").trim();
		}
	}

	/**
	 * 要素からテキストコンテンツを取得（スクリプトやスタイルを除く）
	 */
	private getTextContent(element: Element): string {
		// クローンを作成してスクリプトとスタイルを削除
		const clone = element.cloneNode(true) as Element;
		
		// スクリプトとスタイルを削除
		const scripts = clone.querySelectorAll("script, style, nav, header, footer, aside");
		scripts.forEach((el) => el.remove());

		// HTMLをMarkdownに変換
		return this.htmlToMarkdown(clone);
	}

	/**
	 * HTML要素をMarkdown形式に変換
	 */
	private htmlToMarkdown(element: Element): string {
		let markdown = "";

		for (const node of Array.from(element.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) {
				// テキストノード
				const text = node.textContent || "";
				if (text.trim()) {
					markdown += text;
				}
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as Element;
				const tagName = el.tagName.toLowerCase();

				switch (tagName) {
					case "h1":
						markdown += `\n# ${this.getInlineContent(el)}\n\n`;
						break;
					case "h2":
						markdown += `\n## ${this.getInlineContent(el)}\n\n`;
						break;
					case "h3":
						markdown += `\n### ${this.getInlineContent(el)}\n\n`;
						break;
					case "h4":
						markdown += `\n#### ${this.getInlineContent(el)}\n\n`;
						break;
					case "h5":
						markdown += `\n##### ${this.getInlineContent(el)}\n\n`;
						break;
					case "h6":
						markdown += `\n###### ${this.getInlineContent(el)}\n\n`;
						break;
					case "p":
						const pContent = this.getInlineContent(el);
						if (pContent.trim()) {
							markdown += `${pContent}\n\n`;
						}
						break;
					case "br":
						markdown += "\n";
						break;
					case "strong":
					case "b":
						markdown += `**${this.getInlineContent(el)}**`;
						break;
					case "em":
					case "i":
						markdown += `*${this.getInlineContent(el)}*`;
						break;
					case "code":
						markdown += `\`${this.getInlineContent(el)}\``;
						break;
					case "pre":
						const codeContent = this.getInlineContent(el).trim();
						markdown += `\n\`\`\`\n${codeContent}\n\`\`\`\n\n`;
						break;
					case "blockquote":
						const quoteContent = this.htmlToMarkdown(el);
						const quoteLines = quoteContent.split("\n").filter(l => l.trim());
						markdown += "\n" + quoteLines.map(l => `> ${l}`).join("\n") + "\n\n";
						break;
					case "ul":
					case "ol":
						const listItems = Array.from(el.querySelectorAll(":scope > li"));
						listItems.forEach((li, index) => {
							const liContent = this.htmlToMarkdown(li).trim();
							const prefix = tagName === "ul" ? "- " : `${index + 1}. `;
							markdown += `${prefix}${liContent}\n`;
						});
						markdown += "\n";
						break;
					case "li":
						// liは親のul/olで処理されるため、ここでは子要素を処理
						for (const child of Array.from(el.childNodes)) {
							if (child.nodeType === Node.TEXT_NODE) {
								markdown += child.textContent || "";
							} else if (child.nodeType === Node.ELEMENT_NODE) {
								const childEl = child as Element;
								const childTag = childEl.tagName.toLowerCase();
								if (childTag === "ul" || childTag === "ol") {
									// ネストされたリスト
									const nestedList = this.htmlToMarkdown(childEl);
									const nestedLines = nestedList.split("\n").filter(l => l.trim());
									markdown += "\n" + nestedLines.map(l => `  ${l}`).join("\n") + "\n";
								} else {
									markdown += this.getInlineContent(childEl);
								}
							}
						}
						break;
					case "a":
						const linkText = this.getInlineContent(el);
						const href = el.getAttribute("href") || "";
						if (href) {
							markdown += `[${linkText}](${href})`;
						} else {
							markdown += linkText;
						}
						break;
					case "hr":
						markdown += "\n---\n\n";
						break;
					case "div":
					case "section":
					case "article":
					case "main":
						// コンテナ要素は再帰的に処理
						markdown += this.htmlToMarkdown(el);
						break;
					default:
						// その他の要素は内部テキストを取得
						markdown += this.getInlineContent(el);
						break;
				}
			}
		}

		// 余分な空白を整理
		markdown = markdown
			.replace(/\n{3,}/g, "\n\n")  // 3つ以上の連続する改行を2つに
			.replace(/[ \t]+/g, " ")      // 連続する空白を1つに（ただし行内）
			.trim();

		return markdown;
	}

	/**
	 * インライン要素のコンテンツを取得（Markdown形式）
	 */
	private getInlineContent(element: Element): string {
		let content = "";
		
		for (const node of Array.from(element.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) {
				content += node.textContent || "";
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as Element;
				const tagName = el.tagName.toLowerCase();
				
				switch (tagName) {
					case "strong":
					case "b":
						content += `**${this.getInlineContent(el)}**`;
						break;
					case "em":
					case "i":
						content += `*${this.getInlineContent(el)}*`;
						break;
					case "code":
						content += `\`${this.getInlineContent(el)}\``;
						break;
					case "a":
						const linkText = this.getInlineContent(el);
						const href = el.getAttribute("href") || "";
						if (href) {
							content += `[${linkText}](${href})`;
						} else {
							content += linkText;
						}
						break;
					case "br":
						content += "\n";
						break;
					default:
						content += this.getInlineContent(el);
						break;
				}
			}
		}
		
		return content.trim();
	}

	/**
	 * モデル選択ダイアログを表示して要約を実行
	 */
	private async showModelSelectAndSummarize(aiService: any) {
		// 現在のモデルを初期化
		this.currentModel = this.plugin.settings.aiModel;

		// 利用可能なモデルリストを取得
		let availableModels: Array<{ value: string; label: string }> = [];

		if (this.plugin.settings.aiService === "openrouter") {
			availableModels = [
				{ value: "google/gemini-2.5-flash", label: "Google Gemini 2.5 Flash" },
				{ value: "qwen/qwen3-235b-a22b-2507", label: "Qwen3 235B" },
				{ value: "openai/gpt-oss-120b", label: "OpenAI GPT-OSS 120B" },
				{ value: "openai/gpt-5-mini", label: "OpenAI GPT-5 Mini" },
				{ value: "openai/gpt-5.1", label: "OpenAI GPT-5.1" },
				{ value: "anthropic/claude-sonnet-4.5", label: "Anthropic Claude Sonnet 4.5" },
			];
		} else if (this.plugin.settings.aiService === "litellm") {
			try {
				const litellmService = new LiteLLMService(this.plugin.settings);
				if (litellmService.isApiKeySet()) {
					const modelIds = await litellmService.getModels();
					availableModels = modelIds.map((id) => ({ value: id, label: id }));
				} else {
					showError(
						"APIキーが設定されていません。",
						this.plugin.settings.notificationSettings
					);
					return;
				}
			} catch (error) {
				console.error("[UrlSummaryView] モデルリストの取得に失敗:", error);
				showError(
					error instanceof Error ? error.message : "モデルリストの取得に失敗しました",
					this.plugin.settings.notificationSettings
				);
				return;
			}
		}

		// モデル選択ダイアログを表示
		new ModelSelectDialog(
			this.app,
			this.currentModel,
			availableModels,
			async (modelResult: ModelSelectResult) => {
				if (modelResult.cancelled) {
					return;
				}

				const selectedModel = modelResult.model;
				this.currentModel = selectedModel;

				// 要約を実行
				await this.summarizeContent(aiService, selectedModel);
			}
		).open();
	}

	/**
	 * コンテンツを要約
	 */
	private async summarizeContent(aiService: any, model: string) {
		if (!this.summaryEl) {
			return;
		}

		this.summaryEl.empty();
		this.summaryEl.createEl("p", { text: "要約を生成中..." });

		showInfo("要約を生成中...", this.plugin.settings.notificationSettings);

		try {
			const response = await aiService.chatCompletion({
				messages: [
					{
						role: "system",
						content: "あなたは優秀な要約アシスタントです。与えられたWebページのコンテンツを適切に要約してください。",
					},
					{
						role: "user",
						content: `以下のWebページのコンテンツを要約してください：\n\n${this.fetchedContent}`,
					},
				],
				maxTokens: this.plugin.settings.maxTokens,
				model: model,
			});

			this.summaryText = response.content.trim();
			this.renderSummary();

			showSuccess(
				"要約が完了しました",
				this.plugin.settings.notificationSettings
			);
		} catch (error) {
			showError(error, this.plugin.settings.notificationSettings);
			this.summaryEl.empty();
			this.summaryEl.createEl("p", {
				text: "要約の生成に失敗しました。",
				cls: "url-summary-error",
			});
		}
	}

	/**
	 * 要約結果を表示
	 */
	private renderSummary() {
		if (!this.summaryEl || !this.summaryText) {
			return;
		}

		this.summaryEl.empty();

		// 要約結果
		const summaryHeader = this.summaryEl.createEl("h3", { text: "要約結果" });
		const summaryContent = this.summaryEl.createDiv("url-summary-result-content");
		summaryContent.style.userSelect = "text";
		(summaryContent.style as any).webkitUserSelect = "text";

		// Markdownとしてレンダリング
		MarkdownRenderer.render(
			this.app,
			this.summaryText,
			summaryContent,
			"",
			this
		);

		// 区切り線
		const separator = this.summaryEl.createEl("hr");

		// 元データ（取得したコンテンツ）
		const originalHeader = this.summaryEl.createEl("h3", { text: "元データ" });
		const originalContent = this.summaryEl.createDiv("url-summary-original-content");
		originalContent.style.userSelect = "text";
		(originalContent.style as any).webkitUserSelect = "text";
		originalContent.style.maxHeight = "400px";
		originalContent.style.overflow = "auto";
		originalContent.style.padding = "10px";
		originalContent.style.border = "1px solid var(--background-modifier-border)";
		originalContent.style.borderRadius = "4px";
		
		// Markdownとしてレンダリング
		MarkdownRenderer.render(
			this.app,
			this.fetchedContent,
			originalContent,
			"",
			this
		);

		// アクションボタン
		const actionsEl = this.summaryEl.createDiv("url-summary-actions");
		
		const copyButton = actionsEl.createEl("button", {
			text: "クリップボードにコピー",
			cls: "mod-cta",
		});
		copyButton.onclick = () => {
			navigator.clipboard.writeText(this.summaryText);
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
			this.saveToFile();
		};
	}

	/**
	 * ファイルに保存
	 */
	private async saveToFile() {
		if (!this.summaryText) {
			return;
		}

		// URLからタイトルを生成（ドメイン名を使用）
		let defaultTitle = "URL要約";
		if (this.urlInputEl?.value) {
			try {
				const url = new URL(this.urlInputEl.value);
				defaultTitle = `${url.hostname}-要約`;
				// ファイル名として使用できない文字を削除
				defaultTitle = defaultTitle.replace(/[<>:"|?*\/\\]/g, "");
			} catch {
				// URLパースに失敗した場合はデフォルトを使用
			}
		}

		// タイトルにタイムスタンプを追加
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
		defaultTitle = `${defaultTitle}-${timestamp}`;

		// 保存ダイアログを表示
		new SaveDialog(
			this.app,
			this.plugin.settings.defaultSaveFolder,
			defaultTitle,
			async (result) => {
				if (result.cancelled) {
					return;
				}

				// URLと元のコンテンツも含める
				const url = this.urlInputEl?.value || "";
				const content = `# ${result.fileName}\n\n**URL:** ${url}\n\n**取得日時:** ${new Date().toLocaleString("ja-JP")}\n\n---\n\n## 要約\n\n${this.summaryText}\n\n---\n\n## 元のコンテンツ\n\n${this.fetchedContent.substring(0, 5000)}${this.fetchedContent.length > 5000 ? "\n\n... (以下省略)" : ""}`;

				// ファイルを保存
				const file = await saveToFile(this.app, this.plugin.settings, {
					folder: result.folder,
					fileName: result.fileName,
					content: content,
					format: "markdown",
				});

				if (file) {
					showSuccess(
						`ファイルに保存しました: ${file.path}`,
						this.plugin.settings.notificationSettings
					);
				}
			}
		).open();
	}

	/**
	 * 初期メッセージを表示
	 */
	private showInitialMessage() {
		if (!this.contentEl) {
			return;
		}

		this.contentEl.empty();
		const emptyMessage = this.contentEl.createDiv("url-summary-empty");
		emptyMessage.createEl("p", {
			text: "URLを入力して「取得して要約」ボタンをクリックしてください。",
		});
	}

	/**
	 * ローディング状態を設定
	 */
	private setLoading(loading: boolean) {
		this.isLoading = loading;
		if (this.fetchButton) {
			this.fetchButton.disabled = loading;
			this.fetchButton.textContent = loading ? "処理中..." : "取得して要約";
		}
		if (this.urlInputEl) {
			this.urlInputEl.disabled = loading;
		}
	}
}

