/**
 * Knowledge Connect Plugin - Settings
 */

import { KnowledgeConnectSettings } from "./types";

/**
 * デフォルト設定値
 */
export const DEFAULT_SETTINGS: KnowledgeConnectSettings = {
	// 必須設定
	apiKey: "", // 後方互換性のため残す
	openrouterApiKey: "",
	litellmApiKey: "",
	aiService: "openrouter",
	defaultSaveFolder: "",

	// オプション設定
	chatHistoryRetentionDays: 30,
	summaryDefaultDetail: "standard",
	searchMaxResults: 10,
	notificationSettings: {
		showSuccess: true,
		showError: true,
		showInfo: false,
	},
	theme: "auto",
	enableContextMenu: true,
	enableAutoSave: false,
	timeoutSeconds: 60,
	maxTokens: 2000,
	aiModel: "google/gemini-2.5-flash", // デフォルトモデル
	litellmEndpointUrl: "http://localhost:4000", // LiteLLMデフォルトエンドポイント
	embeddingModel: "openai/text-embedding-ada-002", // デフォルトベクトル化モデル
	excludedFolders: [], // ベクトル化対象から除外するフォルダのリスト（デフォルトは空、強制除外リストは自動適用）
	failedVectorizationFiles: [], // ベクトル化に失敗したファイルのリスト
	vectorizationConcurrency: 2, // ベクトル化キューの同時実行数
	searchResultLimit: 10, // 検索結果の最大件数
};

/**
 * 設定のバリデーション
 */
export function validateSettings(settings: Partial<KnowledgeConnectSettings>): {
	valid: boolean;
	errors: string[];
} {
	const errors: string[] = [];

	// APIキーのバリデーション
	if (settings.apiKey !== undefined) {
		if (settings.apiKey.length > 0 && settings.apiKey.length < 10) {
			errors.push("APIキーは10文字以上である必要があります。");
		}
		if (settings.apiKey.length > 500) {
			errors.push("APIキーは500文字以内である必要があります。");
		}
	}

	// チャット履歴保持期間のバリデーション
	if (settings.chatHistoryRetentionDays !== undefined) {
		if (settings.chatHistoryRetentionDays < 1 || settings.chatHistoryRetentionDays > 365) {
			errors.push("チャット履歴の保持期間は1から365日の範囲で設定してください。");
		}
	}

	// 検索結果最大数のバリデーション
	if (settings.searchMaxResults !== undefined) {
		if (settings.searchMaxResults < 1 || settings.searchMaxResults > 50) {
			errors.push("検索結果の最大取得数は1から50の範囲で設定してください。");
		}
	}

	// タイムアウトのバリデーション
	if (settings.timeoutSeconds !== undefined) {
		if (settings.timeoutSeconds < 10 || settings.timeoutSeconds > 300) {
			errors.push("タイムアウト時間は10から300秒の範囲で設定してください。");
		}
	}

	// 最大トークン数のバリデーション
	if (settings.maxTokens !== undefined) {
		if (settings.maxTokens < 100 || settings.maxTokens > 8000) {
			errors.push("最大トークン数は100から8000の範囲で設定してください。");
		}
	}

	// 自動保存の依存関係チェック
	if (settings.enableAutoSave && (!settings.defaultSaveFolder || settings.defaultSaveFolder.trim() === "")) {
		errors.push("自動保存を有効にするには、デフォルトの保存先フォルダを設定してください。");
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

