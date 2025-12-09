/**
 * File Manager
 * ファイル保存機能のユーティリティ
 */

import { App, TFile } from "obsidian";
import { KnowledgeConnectSettings } from "../types";
import { showError, showSuccess } from "./error-handler";

export interface SaveOptions {
	folder?: string;
	fileName: string;
	content: string;
	format?: "markdown" | "text" | "json";
	append?: boolean;
}

/**
 * ファイルを保存
 */
export async function saveToFile(
	app: App,
	settings: KnowledgeConnectSettings,
	options: SaveOptions
): Promise<TFile | null> {
	try {
		// フォルダパスを決定
		const folderPath = options.folder || settings.defaultSaveFolder || "";
		const sanitizedFolder = sanitizePath(folderPath);

		// ファイル名を決定
		const extension = getExtension(options.format || "markdown");
		const sanitizedFileName = sanitizeFileName(options.fileName);
		const fullFileName = sanitizedFileName.endsWith(extension)
			? sanitizedFileName
			: `${sanitizedFileName}${extension}`;

		// フルパス
		const fullPath = sanitizedFolder
			? `${sanitizedFolder}/${fullFileName}`
			: fullFileName;

		// フォルダが存在しない場合は作成
		if (sanitizedFolder) {
			const folderExists = await app.vault.adapter.exists(sanitizedFolder);
			if (!folderExists) {
				await app.vault.createFolder(sanitizedFolder);
			}
		}

		// ファイルが既に存在する場合
		const existingFile = app.vault.getAbstractFileByPath(fullPath);
		if (existingFile instanceof TFile) {
			if (options.append) {
				// 追記モード
				const currentContent = await app.vault.read(existingFile);
				const newContent = `${currentContent}\n\n---\n\n${options.content}`;
				await app.vault.modify(existingFile, newContent);
				showSuccess(
					`ファイルに追記しました: ${fullPath}`,
					settings.notificationSettings
				);
				return existingFile;
			} else {
				// 上書き確認（簡易版：上書きする）
				await app.vault.modify(existingFile, options.content);
				showSuccess(
					`ファイルを更新しました: ${fullPath}`,
					settings.notificationSettings
				);
				return existingFile;
			}
		} else {
			// 新規ファイル作成
			const file = await app.vault.create(fullPath, options.content);
			showSuccess(
				`ファイルを保存しました: ${fullPath}`,
				settings.notificationSettings
			);
			return file;
		}
	} catch (error) {
		showError(error, settings.notificationSettings);
		return null;
	}
}

/**
 * パスをサニタイズ
 */
function sanitizePath(path: string): string {
	return path
		.replace(/[<>:"|?*]/g, "")
		.replace(/\/+/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

/**
 * ファイル名をサニタイズ
 */
function sanitizeFileName(fileName: string): string {
	return fileName
		.replace(/[<>:"|?*\/\\]/g, "_")
		.replace(/\s+/g, "_")
		.replace(/^\.+/, "")
		.trim();
}

/**
 * フォーマットに応じた拡張子を取得
 */
function getExtension(format: "markdown" | "text" | "json"): string {
	switch (format) {
		case "markdown":
			return ".md";
		case "text":
			return ".txt";
		case "json":
			return ".json";
		default:
			return ".md";
	}
}

/**
 * チャット履歴を保存
 */
export async function saveChatHistory(
	app: App,
	settings: KnowledgeConnectSettings,
	messages: Array<{ role: string; content: string }>
): Promise<TFile | null> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const fileName = `chat-history-${timestamp}`;

	const content = messages
		.map((msg) => `## ${msg.role === "user" ? "あなた" : "AI"}\n\n${msg.content}`)
		.join("\n\n---\n\n");

	return saveToFile(app, settings, {
		fileName,
		content,
		format: "markdown",
		folder: settings.defaultSaveFolder,
	});
}

/**
 * 要約結果を保存
 */
export async function saveSummary(
	app: App,
	settings: KnowledgeConnectSettings,
	summary: string,
	originalText?: string
): Promise<TFile | null> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const fileName = `summary-${timestamp}`;

	let content = `# 要約結果\n\n${summary}`;
	if (originalText) {
		content += `\n\n---\n\n## 元のテキスト\n\n${originalText}`;
	}

	return saveToFile(app, settings, {
		fileName,
		content,
		format: "markdown",
		folder: settings.defaultSaveFolder,
	});
}

/**
 * 検索結果を保存
 */
export async function saveSearchResult(
	app: App,
	settings: KnowledgeConnectSettings,
	query: string,
	content: string
): Promise<TFile | null> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const fileName = `search-${query.replace(/[<>:"|?*\/\\]/g, "_")}-${timestamp}`;

	const fileContent = `# 検索結果: ${query}\n\n${content}`;

	return saveToFile(app, settings, {
		fileName,
		content: fileContent,
		format: "markdown",
		folder: settings.defaultSaveFolder,
	});
}

