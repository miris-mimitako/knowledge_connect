/**
 * Knowledge Connect Plugin - Settings
 */

import { KnowledgeConnectSettings, PromptTemplate } from "./types";

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
	mcpServerUrl: "http://127.0.0.1:8000", // MCPサーバーのデフォルトURL
	
	// ページ要約機能のデフォルト設定
	promptTemplates: [
		{
			id: "brief",
			name: "簡潔サマリー",
			content: "以下の内容を5行程度の文章で簡潔にサマライズしてください。要点だけをまとめてください。",
		},
		{
			id: "detailed",
			name: "詳細サマリー",
			content: "以下の内容を要約してください。詳細情報を残しつつも、要点だけが残された形にしてください。重要な情報は省略せずに含めてください。",
		},
		{
			id: "email",
			name: "メール用サマリー",
			content: "以下の内容をメール送信用に適した形式で要約してください。簡潔で読みやすく、重要なポイントが明確に伝わるようにしてください。",
		},
	] as PromptTemplate[],
	defaultSummaryModel: "", // 空の場合はaiModelを使用
	summarySaveFolder: "", // 空の場合は元のページと同じフォルダ

	// MCP APIパラメータ設定（デフォルト値）
	mcpVectorizeProvider: undefined, // ベクトル化のプロバイダー（未設定の場合はaiServiceから推論）
	mcpVectorizeModel: undefined, // ベクトル化のモデル名
	mcpVectorizeApiBase: undefined, // LiteLLMのカスタムエンドポイントURL
	mcpChunkSize: 512, // チャンクサイズ
	mcpChunkOverlap: 50, // オーバーラップサイズ
	mcpSearchLimit: 20, // 検索結果の最大数
	mcpHybridWeight: 0.5, // ベクトル検索の重み
	mcpKeywordLimit: 10, // 全文検索取得件数
	mcpVectorLimit: 20, // ベクトル検索取得件数
	mcpExpandSynonyms: false, // 類義語展開を使用するか
	mcpRagLLMProvider: undefined, // RAG用LLMプロバイダー（未設定の場合はaiServiceから推論）
	mcpRagModel: undefined, // RAG用LLMモデル名
	mcpRagApiBase: undefined, // RAG用LiteLLMのカスタムエンドポイントURL
	mcpRagTemperature: 0.7, // RAG用温度パラメータ
	mcpRagMaxTokens: undefined, // RAG用最大トークン数（未設定の場合はnull）
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

