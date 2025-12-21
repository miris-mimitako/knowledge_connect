/**
 * Knowledge Connect Plugin - Type Definitions
 */

/**
 * AIサービスプロバイダーの種類
 */
export type AIService = "openrouter" | "litellm";

/**
 * 要約の詳細度
 */
export type SummaryDetail = "brief" | "standard" | "detailed";

/**
 * テーマ設定
 */
export type Theme = "auto" | "light" | "dark";

/**
 * 通知設定
 */
export interface NotificationSettings {
	showSuccess: boolean;
	showError: boolean;
	showInfo: boolean;
}

/**
 * テンプレートプロンプト
 */
export interface PromptTemplate {
	id: string;
	name: string;
	content: string;
}

/**
 * プラグインの設定インターフェース
 */
export interface KnowledgeConnectSettings {
	// 必須設定
	apiKey: string; // 後方互換性のため残す（現在選択中のサービスのAPIキー）
	openrouterApiKey?: string; // OpenRouter APIキー
	litellmApiKey?: string; // LiteLLM APIキー
	aiService: AIService;
	defaultSaveFolder: string;

	// オプション設定
	chatHistoryRetentionDays: number;
	summaryDefaultDetail: SummaryDetail;
	searchMaxResults: number;
	notificationSettings: NotificationSettings;
	theme: Theme;
	enableContextMenu: boolean;
	enableAutoSave: boolean;
	timeoutSeconds: number;
	maxTokens: number;
	aiModel: string; // デフォルトAIモデル
	litellmEndpointUrl?: string; // LiteLLMエンドポイントURL（オプション）
	mcpServerUrl?: string; // MCPサーバーのベースURL（オプション）
	
	// ページ要約機能の設定
	promptTemplates?: PromptTemplate[]; // テンプレートプロンプトのリスト
	defaultSummaryModel?: string; // ページ要約のデフォルトモデル
	summarySaveFolder?: string; // ページ要約結果の保存先フォルダ

	// MCP APIパラメータ設定
	mcpVectorizeProvider?: string; // ベクトル化のプロバイダー（openrouter, aws_bedrock, litellm）
	mcpVectorizeModel?: string; // ベクトル化のモデル名
	mcpVectorizeApiBase?: string; // LiteLLMのカスタムエンドポイントURL
	mcpChunkSize?: number; // チャンクサイズ（デフォルト: 512）
	mcpChunkOverlap?: number; // オーバーラップサイズ（デフォルト: 50）
	mcpSearchLimit?: number; // 検索結果の最大数（デフォルト: 20）
	mcpHybridWeight?: number; // ベクトル検索の重み（デフォルト: 0.5）
	mcpKeywordLimit?: number; // 全文検索取得件数（デフォルト: 10）
	mcpVectorLimit?: number; // ベクトル検索取得件数（デフォルト: 20）
	mcpExpandSynonyms?: boolean; // 類義語展開を使用するか（デフォルト: false）
	mcpRagLLMProvider?: string; // RAG用LLMプロバイダー（openrouter, litellm）
	mcpRagModel?: string; // RAG用LLMモデル名
	mcpRagApiBase?: string; // RAG用LiteLLMのカスタムエンドポイントURL
	mcpRagTemperature?: number; // RAG用温度パラメータ（デフォルト: 0.7）
	mcpRagMaxTokens?: number | null; // RAG用最大トークン数（オプション）
}

