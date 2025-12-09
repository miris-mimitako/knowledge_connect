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
 * プラグインの設定インターフェース
 */
export interface KnowledgeConnectSettings {
	// 必須設定
	apiKey: string;
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
}

