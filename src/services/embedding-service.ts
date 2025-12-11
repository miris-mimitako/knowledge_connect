/**
 * Embedding Service
 * OpenRouter APIを使用したベクトル化（Embedding）サービス
 */

import { KnowledgeConnectSettings } from '../types';

/**
 * サポートされているベクトル化モデル
 * 次元数は実際のAPIレスポンスから取得する（ここはデフォルト値）
 */
export const EMBEDDING_MODELS = {
	'qwen/qwen3-embedding-8b': {
		name: 'Qwen3 Embedding 8B',
		dimensions: 1024, // 実際の次元数はAPIレスポンスから取得
	},
	'google/gemini-embedding-001': {
		name: 'Google Gemini Embedding 001',
		dimensions: 768, // 実際の次元数はAPIレスポンスから取得
	},
	'openai/text-embedding-ada-002': {
		name: 'OpenAI Text Embedding Ada 002',
		dimensions: 1536, // デフォルト、実際の次元数はAPIレスポンスから取得
	},
} as const;

export type EmbeddingModel = keyof typeof EMBEDDING_MODELS;

/**
 * Embedding APIのレスポンス
 */
export interface EmbeddingResponse {
	/** ベクトル（浮動小数点の配列） */
	vector: number[];
	/** モデル名 */
	model: string;
	/** 次元数 */
	dimensions: number;
	/** 使用トークン数（利用可能な場合） */
	usage?: {
		promptTokens: number;
		totalTokens: number;
	};
}

/**
 * Embedding Service
 */
export class EmbeddingService {
	private settings: KnowledgeConnectSettings;
	private apiKey: string;
	private readonly OPENROUTER_EMBEDDING_URL = 'https://openrouter.ai/api/v1/embeddings';

	constructor(settings: KnowledgeConnectSettings) {
		this.settings = settings;
		this.apiKey = settings.openrouterApiKey || settings.apiKey || '';
	}

	/**
	 * APIキーが設定されているか確認
	 */
	isApiKeySet(): boolean {
		return !!this.apiKey && this.apiKey.trim().length > 0;
	}

	/**
	 * テキストをベクトル化
	 */
	async embed(
		text: string,
		model: EmbeddingModel = 'openai/text-embedding-ada-002'
	): Promise<EmbeddingResponse> {
		if (!this.isApiKeySet()) {
			throw new Error('APIキーが設定されていません。設定画面でAPIキーを設定してください。');
		}

		// テキストが空の場合はエラー
		if (!text || text.trim().length === 0) {
			throw new Error('ベクトル化するテキストが空です。');
		}

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(
				() => controller.abort(),
				this.settings.timeoutSeconds * 1000
			);

			// OpenRouterのEmbedding APIを呼び出し
			// 注意: OpenRouterがembeddingエンドポイントを提供しているか確認が必要
			// 提供されていない場合は、chat/completionsエンドポイントを使用する必要がある
			const response = await fetch(this.OPENROUTER_EMBEDDING_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.apiKey}`,
					'HTTP-Referer': 'https://obsidian.md',
					'X-Title': 'Knowledge Connect Plugin',
				},
				body: JSON.stringify({
					model: model,
					input: text,
				}),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				// Embeddingエンドポイントが存在しない場合は、chat/completionsエンドポイントを試す
				if (response.status === 404) {
					return await this.embedViaChatCompletions(text, model);
				}

				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					`OpenRouter Embedding API エラー: ${response.status} ${response.statusText}. ${
						errorData.error?.message || ''
					}`
				);
			}

			const data = await response.json();

			// レスポンス形式の確認
			if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
				throw new Error('OpenRouter Embedding APIからの応答形式が不正です。');
			}

			const embedding = data.data[0];
			if (!embedding.embedding || !Array.isArray(embedding.embedding)) {
				throw new Error('Embeddingデータが不正です。');
			}

			// 実際の次元数はAPIレスポンスから取得
			const dimensions = embedding.embedding.length;

			return {
				vector: embedding.embedding,
				model: data.model || model,
				dimensions,
				usage: data.usage
					? {
							promptTokens: data.usage.prompt_tokens || 0,
							totalTokens: data.usage.total_tokens || 0,
					  }
					: undefined,
			};
		} catch (error: unknown) {
			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					throw new Error(
						`リクエストがタイムアウトしました（${this.settings.timeoutSeconds}秒）。タイムアウト時間を増やすか、後でもう一度お試しください。`
					);
				}
				throw error;
			}
			throw new Error('予期しないエラーが発生しました。');
		}
	}

	/**
	 * Chat Completionsエンドポイント経由でベクトル化
	 * Embeddingエンドポイントが存在しない場合のフォールバック
	 */
	private async embedViaChatCompletions(
		text: string,
		model: EmbeddingModel
	): Promise<EmbeddingResponse> {
		// 注意: この方法は実際には動作しない可能性が高い
		// Embeddingモデルは通常、専用のエンドポイントが必要
		// この実装はプレースホルダーとして残す
		throw new Error(
			`モデル ${model} はEmbeddingエンドポイントをサポートしていない可能性があります。OpenRouterのドキュメントを確認してください。`
		);
	}

	/**
	 * モデルの次元数を取得
	 */
	getModelDimensions(model: EmbeddingModel): number {
		return EMBEDDING_MODELS[model]?.dimensions || 1536;
	}

	/**
	 * サポートされているモデル一覧を取得
	 */
	getSupportedModels(): EmbeddingModel[] {
		return Object.keys(EMBEDDING_MODELS) as EmbeddingModel[];
	}

	/**
	 * モデルがサポートされているか確認
	 */
	isModelSupported(model: string): model is EmbeddingModel {
		return model in EMBEDDING_MODELS;
	}
}

