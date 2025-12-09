/**
 * Error Handler Utilities
 * エラーハンドリングのユーティリティ関数
 */

import { Notice } from "obsidian";
import { NotificationSettings } from "../types";

/**
 * エラーメッセージをユーザーフレンドリーな形式に変換
 */
export function formatErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	return "予期しないエラーが発生しました。";
}

/**
 * エラーを通知として表示
 */
export function showError(
	error: unknown,
	notificationSettings: NotificationSettings
): void {
	if (!notificationSettings.showError) {
		return;
	}

	const message = formatErrorMessage(error);
	new Notice(`❌ ${message}`, 5000);
}

/**
 * 成功メッセージを通知として表示
 */
export function showSuccess(
	message: string,
	notificationSettings: NotificationSettings
): void {
	if (!notificationSettings.showSuccess) {
		return;
	}

	new Notice(`✅ ${message}`, 3000);
}

/**
 * 情報メッセージを通知として表示
 */
export function showInfo(
	message: string,
	notificationSettings: NotificationSettings
): void {
	if (!notificationSettings.showInfo) {
		return;
	}

	new Notice(`ℹ️ ${message}`, 3000);
}

