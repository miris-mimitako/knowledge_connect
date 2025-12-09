/**
 * LiteLLM API Service
 * LiteLLM APIを使用したAIサービスの実装
 */

import {
	AIService,
	ChatCompletionOptions,
	ChatCompletionResponse,
	ChatMessage,
} from "./ai-service-interface";
import { KnowledgeConnectSettings } from "../types";

export class LiteLLMService implements AIService {
	private settings: KnowledgeConnectSettings;

	constructor(settings: KnowledgeConnectSettings) {
		this.settings = settings;
	}

	getServiceName(): string {
		return "LiteLLM";
	}

	isApiKeySet(): boolean {
		const apiKey = this.settings.litellmApiKey || this.settings.apiKey;
		return !!apiKey && apiKey.trim().length > 0;
	}

	/**
	 * 使用するAPIキーを取得
	 */
	private getApiKey(): string {
		return this.settings.litellmApiKey || this.settings.apiKey || "";
	}

	/**
	 * LiteLLMエンドポイントURLを取得
	 */
	private getEndpointUrl(): string {
		const baseUrl = this.settings.litellmEndpointUrl || "http://localhost:4000";
		// 末尾のスラッシュを削除
		const cleanUrl = baseUrl.replace(/\/$/, "");
		return `${cleanUrl}/v1/chat/completions`;
	}

	/**
	 * LiteLLMから利用可能なモデルリストを取得
	 * Pythonスクリプトの実装を参考にしています
	 */
	async getModels(): Promise<string[]> {
		const baseUrl = this.settings.litellmEndpointUrl || "http://localhost:4000";
		const cleanUrl = baseUrl.replace(/\/$/, "");
		const modelsUrl = `${cleanUrl}/v1/models`;

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(
				() => controller.abort(),
				this.settings.timeoutSeconds * 1000
			);

			const response = await fetch(modelsUrl, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					// LiteLLMのプロキシ認証にはBearerヘッダーが必要
					Authorization: `Bearer ${this.getApiKey()}`,
				},
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				// エラーレスポンスの詳細を取得
				let errorMessage = `モデルリストの取得に失敗しました: ${response.status} ${response.statusText}`;
				try {
					const errorData = await response.json();
					if (errorData.error && errorData.error.message) {
						errorMessage += `. ${errorData.error.message}`;
					}
				} catch {
					// JSONパースに失敗した場合はテキストを取得
					const errorText = await response.text().catch(() => "");
					if (errorText) {
						errorMessage += `. ${errorText}`;
					}
				}
				throw new Error(errorMessage);
			}

			const data = await response.json();
			// Pythonスクリプトと同様に data['data'] からモデルリストを取得
			if (data.data && Array.isArray(data.data)) {
				// model.id を優先し、なければ model.model を使用
				const models = data.data
					.map((model: any) => model.id || model.model)
					.filter(Boolean);
				console.log(`[LiteLLM] 利用可能なモデル数: ${models.length}`);
				return models;
			}
			console.warn("[LiteLLM] モデルリストが空です");
			return [];
		} catch (error: unknown) {
			if (error instanceof Error) {
				if (error.name === "AbortError") {
					throw new Error("モデルリストの取得がタイムアウトしました。");
				}
				// 接続エラーのチェック
				if (
					error.message.includes("Failed to fetch") ||
					error.message.includes("NetworkError") ||
					error.message.includes("ECONNREFUSED")
				) {
					throw new Error(
						`LiteLLMプロキシに接続できません。プロキシが起動しているか確認してください。エンドポイント: ${modelsUrl}`
					);
				}
				throw error;
			}
			throw new Error("モデルリストの取得中にエラーが発生しました。");
		}
	}

	async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
		if (!this.isApiKeySet()) {
			throw new Error("APIキーが設定されていません。設定画面でAPIキーを設定してください。");
		}

		const endpointUrl = this.getEndpointUrl();

		const requestBody = {
			model: options.model || this.settings.aiModel || "gpt-3.5-turbo",
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

			const response = await fetch(endpointUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					// LiteLLMのプロキシ認証にはBearerヘッダーが必要
					Authorization: `Bearer ${this.getApiKey()}`,
				},
				body: JSON.stringify(requestBody),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					`LiteLLM API エラー: ${response.status} ${response.statusText}. ${
						errorData.error?.message || ""
					}`
				);
			}

			const data = await response.json();

			if (!data.choices || !data.choices[0] || !data.choices[0].message) {
				throw new Error("LiteLLM APIからの応答形式が不正です。");
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
				if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
					throw new Error(
						`LiteLLMサーバーに接続できません。エンドポイントURL（${endpointUrl}）が正しいか確認してください。`
					);
				}
				throw error;
			}
			throw new Error("予期しないエラーが発生しました。");
		}
	}
}

