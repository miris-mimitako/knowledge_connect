/**
 * AI Service Interface
 * AIサービスプロバイダーの共通インターフェース
 */

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ChatCompletionOptions {
	messages: ChatMessage[];
	maxTokens?: number;
	temperature?: number;
	model?: string;
}

export interface ChatCompletionResponse {
	content: string;
	model: string;
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

export interface AIService {
	/**
	 * チャット補完を実行
	 */
	chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse>;

	/**
	 * サービス名を取得
	 */
	getServiceName(): string;

	/**
	 * APIキーが設定されているか確認
	 */
	isApiKeySet(): boolean;
}

