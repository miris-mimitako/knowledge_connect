/**
 * OpenRouter API Service
 * OpenRouter APIを使用したAIサービスの実装
 */

import {
	AIService,
	ChatCompletionOptions,
	ChatCompletionResponse,
	ChatMessage,
} from "./ai-service-interface";
import { KnowledgeConnectSettings } from "../types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterService implements AIService {
	private settings: KnowledgeConnectSettings;

	constructor(settings: KnowledgeConnectSettings) {
		this.settings = settings;
	}

	getServiceName(): string {
		return "OpenRouter";
	}

	isApiKeySet(): boolean {
		const apiKey = this.settings.openrouterApiKey || this.settings.apiKey;
		return !!apiKey && apiKey.trim().length > 0;
	}

	/**
	 * 使用するAPIキーを取得
	 */
	private getApiKey(): string {
		return this.settings.openrouterApiKey || this.settings.apiKey || "";
	}

	async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
		if (!this.isApiKeySet()) {
			throw new Error("APIキーが設定されていません。設定画面でAPIキーを設定してください。");
		}

		const requestBody = {
			model: options.model || this.settings.aiModel || "google/gemini-2.5-flash", // 設定のデフォルトモデルを使用
			messages: options.messages.map((msg) => ({
				role: msg.role,
				content: msg.content,
			})),
			max_tokens: options.maxTokens || this.settings.maxTokens,
			temperature: options.temperature || 0.7,
		};

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(
				() => controller.abort(),
				this.settings.timeoutSeconds * 1000
			);

			const response = await fetch(OPENROUTER_API_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.getApiKey()}`,
					"HTTP-Referer": "https://obsidian.md", // OpenRouterの推奨ヘッダー
					"X-Title": "Knowledge Connect Plugin", // OpenRouterの推奨ヘッダー
				},
				body: JSON.stringify(requestBody),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					`OpenRouter API エラー: ${response.status} ${response.statusText}. ${
						errorData.error?.message || ""
					}`
				);
			}

			const data = await response.json();

			if (!data.choices || !data.choices[0] || !data.choices[0].message) {
				throw new Error("OpenRouter APIからの応答形式が不正です。");
			}

			return {
				content: data.choices[0].message.content || "",
				model: data.model || requestBody.model,
				usage: data.usage
					? {
							promptTokens: data.usage.prompt_tokens || 0,
							completionTokens: data.usage.completion_tokens || 0,
							totalTokens: data.usage.total_tokens || 0,
					  }
					: undefined,
			};
		} catch (error: unknown) {
			if (error instanceof Error) {
				if (error.name === "AbortError") {
					throw new Error(
						`リクエストがタイムアウトしました（${this.settings.timeoutSeconds}秒）。タイムアウト時間を増やすか、後でもう一度お試しください。`
					);
				}
				throw error;
			}
			throw new Error("予期しないエラーが発生しました。");
		}
	}
}

