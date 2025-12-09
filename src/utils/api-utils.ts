/**
 * API Utilities
 * API呼び出しに関するユーティリティ関数
 */

/**
 * リトライ付きAPI呼び出し
 */
export async function retryApiCall<T>(
	fn: () => Promise<T>,
	maxRetries: number = 3,
	delayMs: number = 1000
): Promise<T> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;

			// 最後の試行でない場合、待機してからリトライ
			if (attempt < maxRetries) {
				await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
			}
		}
	}

	throw lastError;
}

/**
 * APIキーの形式を検証（簡易版）
 */
export function validateApiKey(apiKey: string): {
	valid: boolean;
	message?: string;
} {
	if (!apiKey || apiKey.trim().length === 0) {
		return {
			valid: false,
			message: "APIキーが空です。",
		};
	}

	if (apiKey.length < 10) {
		return {
			valid: false,
			message: "APIキーが短すぎます。",
		};
	}

	if (apiKey.length > 500) {
		return {
			valid: false,
			message: "APIキーが長すぎます。",
		};
	}

	return { valid: true };
}

