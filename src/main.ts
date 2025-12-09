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
import { SearchView, SEARCH_VIEW_TYPE } from "./views/search-view";
import { registerCommands } from "./commands";
import { registerContextMenu } from "./context-menu";

export default class KnowledgeConnectPlugin extends Plugin {
	settings: KnowledgeConnectSettings;
	private aiService: AIService | null = null;

	async onload() {
		await this.loadSettings();

		// 設定タブを追加
		this.addSettingTab(new KnowledgeConnectSettingTab(this.app, this));

		// AIサービスを初期化
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
			SEARCH_VIEW_TYPE,
			(leaf) => new SearchView(leaf, this)
		);

		// コマンドを登録
		registerCommands(this);

		// コンテキストメニューを登録
		registerContextMenu(this);

		console.log("Knowledge Connect Plugin loaded");
	}

	onunload() {
		this.aiService = null;
		console.log("Knowledge Connect Plugin unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// 設定読み込み後にAIサービスを再初期化
		this.initializeAIService();
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// 設定保存後にAIサービスを再初期化
		this.initializeAIService();
	}

	/**
	 * AIサービスを初期化
	 */
	private initializeAIService(): void {
		try {
			if (AIServiceFactory.isServiceAvailable(this.settings)) {
				this.aiService = AIServiceFactory.createService(this.settings);
				console.log(`AI Service initialized: ${this.aiService.getServiceName()}`);
			} else {
				this.aiService = null;
				console.log("AI Service not available: API key not set");
			}
		} catch (error) {
			this.aiService = null;
			console.error("Failed to initialize AI service:", error);
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
}

