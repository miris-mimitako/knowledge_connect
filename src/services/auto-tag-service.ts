/**
 * Auto Tag Service
 * ファイル編集後に自動でAIタグを生成するサービス
 */

import { TFile, App } from "obsidian";
import type { KnowledgeConnectSettings } from "../types";
import type { AIService } from "./ai-service-interface";
import { showError, showInfo } from "../utils/error-handler";

export class AutoTagService {
	private app: App;
	private settings: KnowledgeConnectSettings;
	private aiService: AIService | null;
	private processingFiles: Set<string> = new Set(); // 処理中のファイルを追跡（重複処理を防止）

	constructor(app: App, settings: KnowledgeConnectSettings, aiService: AIService | null) {
		this.app = app;
		this.settings = settings;
		this.aiService = aiService;
	}

	/**
	 * AIサービスを更新
	 */
	updateAIService(aiService: AIService | null) {
		this.aiService = aiService;
	}

	/**
	 * 設定を更新
	 */
	updateSettings(settings: KnowledgeConnectSettings) {
		this.settings = settings;
	}

	/**
	 * ファイル変更時に自動タグを生成
	 * @param force 既存タグがあっても強制的に生成するか（デフォルト: false）
	 */
	async handleFileModify(file: TFile, force: boolean = false): Promise<void> {
		// Markdownファイルのみ処理
		if (!file.path.endsWith(".md")) {
			return;
		}

		// 既に処理中の場合はスキップ
		if (this.processingFiles.has(file.path)) {
			return;
		}

		// AIサービスが利用可能か確認
		if (!this.aiService || !this.aiService.isApiKeySet()) {
			return;
		}

		try {
			this.processingFiles.add(file.path);

			// ファイル内容を読み込み
			const content = await this.app.vault.read(file);

			// 既存のタグをチェック
			if (!force) {
				const existingTags = this.getExistingTags(content);
				if (existingTags && existingTags.length > 0) {
					// 既にタグが存在する場合はスキップ
					console.log(`[AutoTagService] 既存のタグが見つかりました。スキップ: ${file.path}`);
					return;
				}
			}

			// frontmatterを除去した本文を取得
			const bodyContent = this.extractBodyContent(content);

			// 本文が空の場合はスキップ
			if (!bodyContent || bodyContent.trim().length === 0) {
				return;
			}

			// タグ生成用のテキストを取得
			const textForTagging = this.getTextForTagging(bodyContent);

			// AIでタグを生成
			const tags = await this.generateTags(textForTagging);

			if (tags && tags.length > 0) {
				// frontmatterを更新
				await this.updateFrontmatter(file, content, tags);
			}
		} catch (error) {
			console.error(`[AutoTagService] エラー: ${file.path}`, error);
			// エラーは通知しない（自動処理のため）
		} finally {
			this.processingFiles.delete(file.path);
		}
	}

	/**
	 * 既存のタグを取得
	 */
	getExistingTags(content: string): string[] | null {
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
		const match = content.match(frontmatterRegex);

		if (match) {
			try {
				const frontmatter = this.parseFrontmatter(match[1]);
				if (frontmatter["aigen-tag"]) {
					if (Array.isArray(frontmatter["aigen-tag"])) {
						return frontmatter["aigen-tag"];
					} else if (typeof frontmatter["aigen-tag"] === "string") {
						return [frontmatter["aigen-tag"]];
					}
				}
			} catch (error) {
				// パースエラーは無視
			}
		}

		return null;
	}

	/**
	 * frontmatterを除去した本文を取得
	 */
	private extractBodyContent(content: string): string {
		// YAML frontmatterを除去
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
		const match = content.match(frontmatterRegex);
		
		if (match) {
			// frontmatterがある場合は、その後の本文を返す
			return content.substring(match[0].length);
		}
		
		// frontmatterがない場合は全文を返す
		return content;
	}

	/**
	 * タグ生成用のテキストを取得
	 * - 400文字以下の場合: 全文
	 * - それ以上の場合: 最初の200文字 + 最後の200文字
	 */
	private getTextForTagging(content: string): string {
		const trimmedContent = content.trim();

		if (trimmedContent.length <= 400) {
			return trimmedContent;
		}

		const firstPart = trimmedContent.substring(0, 200);
		const lastPart = trimmedContent.substring(trimmedContent.length - 200);

		return `${firstPart}\n\n...\n\n${lastPart}`;
	}

	/**
	 * AIでタグを生成
	 */
	private async generateTags(text: string): Promise<string[] | null> {
		if (!this.aiService) {
			return null;
		}

		try {
			// Obsidianの設定で登録されたモデルを確実に使用
			// this.settings.aiModelが空でない場合は、その値を明示的に使用
			const modelToUse = this.settings.aiModel && this.settings.aiModel.trim() !== ""
				? this.settings.aiModel
				: undefined; // 空の場合はundefinedにして、AIサービス側のデフォルト値にフォールバック

			const response = await this.aiService.chatCompletion({
				messages: [
					{
						role: "system",
						content: "あなたはタグ生成アシスタントです。与えられた記事の内容を分析して、適切なタグを生成してください。タグは3-10個（最大10個）で、記事の主要なトピックやキーワードを表すものにしてください。タグはカンマ区切りで出力してください。説明や補足は不要です。",
					},
					{
						role: "user",
						content: `以下の記事の内容から適切なタグを生成してください（最大10個まで）：\n\n${text}`,
					},
				],
				maxTokens: 200,
				model: modelToUse, // Obsidianの設定で登録されたモデルを明示的に使用
			});

			// レスポンスからタグを抽出
			const tagsText = response.content.trim();

			// カンマや改行で分割
			let tags = tagsText
				.split(/[,、\n]/)
				.map((tag) => tag.trim())
				.filter((tag) => tag.length > 0 && !tag.match(/^(タグ|tags|tag):/i)) // 「タグ:」などのプレフィックスを除去
				.filter((tag, index, self) => self.indexOf(tag) === index); // 重複を除去

			// 最大10個までに制限
			if (tags.length > 10) {
				tags = tags.slice(0, 10);
			}

			return tags.length > 0 ? tags : null;
		} catch (error) {
			console.error("[AutoTagService] タグ生成エラー:", error);
			return null;
		}
	}

	/**
	 * frontmatterを更新してファイルを保存
	 */
	private async updateFrontmatter(file: TFile, currentContent: string, tags: string[]): Promise<void> {
		try {
			// 現在のfrontmatterをパース
			const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
			const match = currentContent.match(frontmatterRegex);

			let frontmatter: Record<string, any> = {};
			let bodyContent = currentContent;

			if (match) {
				// 既存のfrontmatterがある場合
				try {
					// YAMLを簡易的にパース（複雑なYAMLには対応していない）
					const frontmatterText = match[1];
					frontmatter = this.parseFrontmatter(frontmatterText);
					bodyContent = currentContent.substring(match[0].length);
				} catch (error) {
					console.error("[AutoTagService] frontmatterのパースエラー:", error);
					// パースに失敗した場合は新規作成
					frontmatter = {};
				}
			}

			// aigen-tagキーでタグを設定
			frontmatter["aigen-tag"] = tags;

			// frontmatterをYAML形式に変換
			const frontmatterYaml = this.stringifyFrontmatter(frontmatter);

			// 新しい内容を構築
			const newContent = `---\n${frontmatterYaml}---\n${bodyContent}`;

			// ファイルを更新（ただし、内容が変更された場合のみ）
			if (newContent !== currentContent) {
				await this.app.vault.modify(file, newContent);
				console.log(`[AutoTagService] タグを更新しました: ${file.path}`, tags);
			}
		} catch (error) {
			console.error("[AutoTagService] frontmatter更新エラー:", error);
			throw error;
		}
	}

	/**
	 * frontmatterテキストをパース（簡易版）
	 */
	private parseFrontmatter(text: string): Record<string, any> {
		const result: Record<string, any> = {};
		const lines = text.split("\n");

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine || trimmedLine.startsWith("#")) {
				continue;
			}

			// key: value の形式をパース
			const colonIndex = trimmedLine.indexOf(":");
			if (colonIndex === -1) {
				continue;
			}

			const key = trimmedLine.substring(0, colonIndex).trim();
			let value = trimmedLine.substring(colonIndex + 1).trim();

			// 引用符を除去
			if ((value.startsWith('"') && value.endsWith('"')) || 
				(value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}

			// リスト形式をパース
			if (value.startsWith("[") && value.endsWith("]")) {
				// 配列形式
				const listContent = value.slice(1, -1).trim();
				if (listContent) {
					const items = listContent
						.split(",")
						.map((item) => item.trim().replace(/^["']|["']$/g, ""))
						.filter((item) => item.length > 0);
					result[key] = items;
				} else {
					result[key] = [];
				}
			} else {
				result[key] = value;
			}
		}

		return result;
	}

	/**
	 * frontmatterオブジェクトをYAML形式に変換
	 */
	private stringifyFrontmatter(frontmatter: Record<string, any>): string {
		const lines: string[] = [];

		for (const [key, value] of Object.entries(frontmatter)) {
			if (Array.isArray(value)) {
				// 配列形式
				if (value.length === 0) {
					lines.push(`${key}: []`);
				} else {
					const items = value.map((item) => {
						const str = String(item);
						// 特殊文字が含まれる場合は引用符で囲む
						if (str.includes(":") || str.includes(" ") || str.includes(",")) {
							return `"${str.replace(/"/g, '\\"')}"`;
						}
						return str;
					}).join(", ");
					lines.push(`${key}: [${items}]`);
				}
			} else {
				// 文字列形式
				const str = String(value);
				// 特殊文字が含まれる場合は引用符で囲む
				if (str.includes(":") || str.includes("\n")) {
					lines.push(`${key}: "${str.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`);
				} else {
					lines.push(`${key}: ${str}`);
				}
			}
		}

		return lines.join("\n") + "\n";
	}
}

