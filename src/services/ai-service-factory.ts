/**
 * AI Service Factory
 * AIサービスプロバイダーのファクトリー
 */

import { AIService } from "./ai-service-interface";
import { OpenRouterService } from "./openrouter-service";
import { KnowledgeConnectSettings } from "../types";

export class AIServiceFactory {
	/**
	 * 設定に基づいて適切なAIサービスインスタンスを作成
	 */
	static createService(settings: KnowledgeConnectSettings): AIService {
		switch (settings.aiService) {
			case "openrouter":
				return new OpenRouterService(settings);
			case "litellm":
				// 将来実装
				throw new Error("LiteLLMはまだ実装されていません。");
			default:
				throw new Error(`不明なAIサービス: ${settings.aiService}`);
		}
	}

	/**
	 * サービスが利用可能か確認
	 */
	static isServiceAvailable(settings: KnowledgeConnectSettings): boolean {
		try {
			const service = this.createService(settings);
			return service.isApiKeySet();
		} catch {
			return false;
		}
	}
}

