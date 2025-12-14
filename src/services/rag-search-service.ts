/**
 * RAG Search Service
 * Oramaを使用した全文検索ベースのRAG検索サービス
 */

import { create, insert, search, type Orama, type SearchResult } from "@orama/orama";
import { createTokenizer } from "@orama/tokenizers/japanese";
import { App, TFile } from "obsidian";

/**
 * Oramaのスキーマ定義
 */
interface DocumentSchema {
	path: string;
	content: string;
}

/**
 * 検索結果の型
 */
export interface SearchHit {
	path: string;
	content: string;
	score: number;
}

/**
 * RAG検索サービス
 */
export class RAGSearchService {
	private db: Orama<DocumentSchema> | null = null;
	private app: App;
	private isIndexing: boolean = false;
	private indexProgress: { current: number; total: number } | null = null;
	private indexedCount: number = 0; // インデックスされたドキュメント数を追跡

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 検索データベースを初期化
	 */
	async initialize(): Promise<void> {
		if (this.db) {
			return; // 既に初期化済み
		}

		try {
			this.db = await create({
				schema: {
					path: "string",
					content: "string",
				},
				components: {
					tokenizer: createTokenizer(),
				},
			});
			console.log("[RAG Search] データベースを初期化しました（日本語トークナイザー有効）");
		} catch (error) {
			console.error("[RAG Search] データベースの初期化に失敗しました:", error);
			throw error;
		}
	}

	/**
	 * Vault内の全Markdownファイルをインデックス
	 */
	async indexAllFiles(): Promise<void> {
		if (!this.db) {
			await this.initialize();
		}

		if (this.isIndexing) {
			console.log("[RAG Search] インデックス処理は既に実行中です");
			return;
		}

		this.isIndexing = true;
		this.indexProgress = { current: 0, total: 0 };

		try {
			// 全Markdownファイルを取得
			const markdownFiles = this.app.vault.getMarkdownFiles();
			this.indexProgress.total = markdownFiles.length;

			console.log(`[RAG Search] ${markdownFiles.length}個のファイルをインデックスします`);

			// 既存のデータをクリア（簡易的な方法として、新しいDBを作成）
			if (this.db) {
				this.db = await create({
					schema: {
						path: "string",
						content: "string",
					},
					components: {
						tokenizer: createTokenizer(),
					},
				});
			}

			// カウンターをリセット
			this.indexedCount = 0;

			// ファイルを順次インデックス
			for (let i = 0; i < markdownFiles.length; i++) {
				const file = markdownFiles[i];
				try {
					await this.indexFile(file);
					this.indexedCount++;
					this.indexProgress.current = i + 1;

					// 進捗をログに出力（100ファイルごと）
					if ((i + 1) % 100 === 0) {
						console.log(`[RAG Search] インデックス進捗: ${i + 1}/${markdownFiles.length}`);
					}

					// UIをブロックしないように、適宜待機
					if (i % 10 === 0) {
						await new Promise((resolve) => setTimeout(resolve, 0));
					}
				} catch (error) {
					console.error(`[RAG Search] ファイルのインデックスに失敗: ${file.path}`, error);
					// エラーが発生しても処理を続行
				}
			}

			console.log(`[RAG Search] インデックス完了: ${markdownFiles.length}個のファイル`);
			console.log(`[RAG Search] 実際にインデックスされたドキュメント数: ${this.indexedCount}`);
			
			if (this.indexedCount === 0) {
				console.warn("[RAG Search] 警告: インデックスされたドキュメントが0件です。");
			}
		} catch (error) {
			console.error("[RAG Search] インデックス処理中にエラーが発生しました:", error);
			throw error;
		} finally {
			this.isIndexing = false;
			this.indexProgress = null;
		}
	}

	/**
	 * 単一ファイルをインデックス
	 */
	private async indexFile(file: TFile): Promise<void> {
		if (!this.db) {
			throw new Error("データベースが初期化されていません");
		}

		try {
			// ファイルの内容を読み込み
			const content = await this.app.vault.read(file);

			// Oramaに挿入
			await insert(this.db, {
				path: file.path,
				content: content,
			});
		} catch (error) {
			console.error(`[RAG Search] ファイル読み込みエラー: ${file.path}`, error);
			throw error;
		}
	}

	/**
	 * 検索を実行
	 * @param query 検索クエリ
	 * @param limit 取得件数（デフォルト: 20）
	 * @returns 検索結果の配列
	 */
	async search(query: string, limit: number = 20): Promise<SearchHit[]> {
		if (!this.db) {
			await this.initialize();
		}

		if (!this.db) {
			throw new Error("データベースが初期化されていません");
		}

		try {
			console.log(`[RAG Search] 検索クエリ: "${query}"`);
			
			// Oramaで検索を実行（contentプロパティを明示的に指定）
			const results = await search(this.db, {
				term: query,
				properties: ["content"], // contentプロパティのみを検索対象に
				limit: limit,
			});

			console.log(`[RAG Search] 検索結果: ${results.hits.length}件`);

			// 検索結果を整形
			const hits: SearchHit[] = results.hits.map((hit) => ({
				path: (hit.document as DocumentSchema).path,
				content: (hit.document as DocumentSchema).content,
				score: hit.score || 0,
			}));

			// デバッグ用: 検索結果の詳細をログに出力
			if (hits.length > 0) {
				console.log(`[RAG Search] 検索結果のサンプル:`, {
					path: hits[0].path,
					contentPreview: hits[0].content.substring(0, 100) + "...",
					score: hits[0].score,
				});
			} else {
				console.warn(`[RAG Search] 検索結果が0件です。インデックスが正しく作成されているか確認してください。`);
			}

			return hits;
		} catch (error) {
			console.error("[RAG Search] 検索エラー:", error);
			throw error;
		}
	}

	/**
	 * インデックスされたドキュメント数を取得（デバッグ用）
	 */
	async getIndexedCount(): Promise<number> {
		return this.indexedCount;
	}

	/**
	 * インデックス処理中かどうか
	 */
	isIndexingInProgress(): boolean {
		return this.isIndexing;
	}

	/**
	 * インデックス進捗を取得
	 */
	getIndexProgress(): { current: number; total: number } | null {
		return this.indexProgress;
	}

	/**
	 * データベースが初期化されているか
	 */
	isInitialized(): boolean {
		return this.db !== null;
	}
}

