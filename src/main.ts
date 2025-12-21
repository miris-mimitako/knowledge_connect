/**
 * Knowledge Connect Plugin
 * Obsidian用のAI統合プラグイン
 */

import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings";
import { KnowledgeConnectSettingTab } from "./settings-tab";
import type { KnowledgeConnectSettings } from "./types";
import { AIServiceFactory } from "./services/ai-service-factory";
import type { AIService } from "./services/ai-service-interface";
import { ChatView, CHAT_VIEW_TYPE } from "./views/chat-view";
import { SummaryView, SUMMARY_VIEW_TYPE } from "./views/summary-view";
import { UrlSummaryView, URL_SUMMARY_VIEW_TYPE } from "./views/url-summary-view";
import { RAGView, RAG_VIEW_TYPE } from "./views/rag-view";
import { MCPSearchView, MCP_SEARCH_VIEW_TYPE } from "./views/mcp-search-view";
import { registerCommands } from "./commands";
import { registerContextMenu } from "./context-menu";
import { registerEditorSummarizeButton } from "./utils/editor-summarize-button";
import { registerEditorTagButton } from "./utils/editor-tag-button";
import { AutoTagService } from "./services/auto-tag-service";
import { FileWatcher } from "./services/file-watcher";
import { MCPService } from "./services/mcp-service";
import { TFile } from "obsidian";

export default class KnowledgeConnectPlugin extends Plugin {
	settings: KnowledgeConnectSettings;
	private aiService: AIService | null = null;
	private autoTagService: AutoTagService | null = null;
	private fileWatcher: FileWatcher | null = null;

	async onload() {
		try {
			await this.loadSettings();

			// 設定タブを追加
			this.addSettingTab(new KnowledgeConnectSettingTab(this.app, this));

			// AIサービスを初期化（エラーが発生してもプラグインは起動を続行）
			this.initializeAIService();

			// Viewを登録
			this.registerView(
				CHAT_VIEW_TYPE,
				(leaf) => new ChatView(leaf, this)
			);
			this.registerView(
				SUMMARY_VIEW_TYPE,
				(leaf) => new SummaryView(leaf, this)
			);
			this.registerView(
				URL_SUMMARY_VIEW_TYPE,
				(leaf) => new UrlSummaryView(leaf, this)
			);
			this.registerView(
				RAG_VIEW_TYPE,
				(leaf) => new RAGView(leaf, this)
			);
			this.registerView(
				MCP_SEARCH_VIEW_TYPE,
				(leaf) => new MCPSearchView(leaf, this)
			);

			// コマンドを登録
			registerCommands(this);

			// コンテキストメニューを登録
			registerContextMenu(this);

			// エディタに要約ボタンを追加
			registerEditorSummarizeButton(this);

			// 自動タグ生成サービスを初期化
			this.initializeAutoTagService();

			// エディタにタグ生成ボタンを追加
			registerEditorTagButton(this);

			// MCPサーバーへの接続確認（非同期、エラーが発生してもプラグインは起動を続行）
			this.checkMCPServerConnection();

			console.log("Knowledge Connect Plugin loaded");
		} catch (error) {
			// 起動時のエラーをログに記録（プラグインは可能な限り起動を続行）
			console.error("[Knowledge Connect] プラグインの起動中にエラーが発生しました:", error);
			// エラーが発生しても基本的な機能は利用可能にするため、ここではエラーを再スローしない
		}
	}

	onunload() {
		this.aiService = null;
		if (this.fileWatcher) {
			this.fileWatcher.stop();
			this.fileWatcher = null;
		}
		this.autoTagService = null;
		console.log("Knowledge Connect Plugin unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// 設定読み込み後にAIサービスを再初期化
		this.initializeAIService();
		// 自動タグサービスの設定も更新
		if (this.autoTagService) {
			this.autoTagService.updateSettings(this.settings);
			this.autoTagService.updateAIService(this.aiService);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// 設定保存後にAIサービスを再初期化
		this.initializeAIService();
		// 自動タグサービスの設定も更新
		if (this.autoTagService) {
			this.autoTagService.updateSettings(this.settings);
			this.autoTagService.updateAIService(this.aiService);
		}
	}

	/**
	 * AIサービスを初期化
	 * エラーが発生してもプラグインは正常に動作する（AIサービスはnullのまま）
	 */
	private initializeAIService(): void {
		try {
			if (AIServiceFactory.isServiceAvailable(this.settings)) {
				this.aiService = AIServiceFactory.createService(this.settings);
				console.log(`[Knowledge Connect] AI Service initialized: ${this.aiService.getServiceName()}`);
			} else {
				this.aiService = null;
				console.log("[Knowledge Connect] AI Service not available: API key not set");
			}
		} catch (error) {
			// エラーが発生してもプラグインは起動を続行
			this.aiService = null;
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			console.error(`[Knowledge Connect] Failed to initialize AI service: ${errorMessage}`);
			console.error("[Knowledge Connect] プラグインはAIサービスなしで動作します。設定画面で接続を確認してください。");
		}
		// 自動タグサービスのAIサービスも更新
		if (this.autoTagService) {
			this.autoTagService.updateAIService(this.aiService);
		}
	}

	/**
	 * 自動タグ生成サービスを初期化
	 */
	private initializeAutoTagService(): void {
		try {
			this.autoTagService = new AutoTagService(this.app, this.settings, this.aiService);

			// ファイル変更監視を開始
			this.fileWatcher = new FileWatcher(this);
			this.fileWatcher.start();

			// ファイル変更イベントハンドラーを登録
			this.fileWatcher.on(async (event) => {
				if (event.type === "modify" && event.file instanceof TFile) {
					// 少し遅延を入れてから処理（連続する変更に対応）
					await new Promise(resolve => setTimeout(resolve, 1000));
					if (this.autoTagService && event.file instanceof TFile) {
						// 自動タグ生成（既存タグがある場合はスキップ）
						await this.autoTagService.handleFileModify(event.file, false);
					}
				}
			});

			console.log("[Knowledge Connect] Auto tag service initialized");
		} catch (error) {
			console.error("[Knowledge Connect] Failed to initialize auto tag service:", error);
		}
	}

	/**
	 * AIサービスインスタンスを取得
	 */
	getAIService(): AIService | null {
		return this.aiService;
	}

	/**
	 * AIサービスが利用可能か確認
	 */
	isAIServiceAvailable(): boolean {
		return this.aiService !== null && this.aiService.isApiKeySet();
	}

	/**
	 * 検索サービスを取得
	 * 注意: 現在は未実装のため、常にnullを返します
	 */
	getSearchService(): any {
		return null;
	}

	/**
	 * 自動タグサービスを取得
	 */
	getAutoTagService(): AutoTagService | null {
		return this.autoTagService;
	}

	/**
	 * MCPサーバーへの接続確認
	 * エラーが発生してもプラグインは正常に動作する
	 */
	private async checkMCPServerConnection(): Promise<void> {
		try {
			const baseUrl = this.settings.mcpServerUrl || 'http://127.0.0.1:8000';
			const mcpService = new MCPService(baseUrl);
			const health = await mcpService.checkHealth();
			if (health.healthy) {
				console.log(`[Knowledge Connect] MCPサーバーに接続しました: ${health.status}`);
			} else {
				console.log(`[Knowledge Connect] MCPサーバーに接続できません: ${health.status}`);
			}
		} catch (error) {
			console.log("[Knowledge Connect] MCPサーバーが起動していない可能性があります");
			console.error("[Knowledge Connect] MCPサーバー接続エラー:", error);
		}
	}
}

