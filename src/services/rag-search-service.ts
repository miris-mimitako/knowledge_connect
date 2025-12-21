/**
 * RAG Search Service
 * MCPサーバーのハイブリッド検索を使用したRAG検索サービス
 */

import { App } from "obsidian";
import { MCPService, type SearchResult } from "./mcp-service";
import type { KnowledgeConnectSettings } from "../types";

/**
 * 検索結果の型（MCPサーバーのSearchResultと互換性を保つ）
 */
export interface SearchHit {
	path: string;
	content: string;
	score: number;
	file_type?: string;
	location_info?: string;
	snippet?: string;
}

/**
 * RAG検索サービス
 */
export class RAGSearchService {
	private mcpService: MCPService;
	private app: App;
	private settings: KnowledgeConnectSettings | undefined;
	private isIndexing: boolean = false;
	private indexProgress: { current: number; total: number } | null = null;
	private indexedCount: number = 0; // インデックスされたドキュメント数を追跡

	constructor(app: App, settings?: KnowledgeConnectSettings) {
		this.app = app;
		this.settings = settings;
		const baseUrl = settings?.mcpServerUrl || 'http://127.0.0.1:8000';
		this.mcpService = new MCPService(baseUrl);
	}

	/**
	 * 検索サービスを初期化（MCPサーバーの接続確認）
	 */
	async initialize(): Promise<void> {
		try {
			const isAvailable = await this.mcpService.isServerAvailable();
			if (!isAvailable) {
				throw new Error("MCPサーバーに接続できません。サーバーが起動しているか確認してください。");
			}
			console.log("[RAG Search] MCPサーバーに接続しました");
		} catch (error) {
			console.error("[RAG Search] MCPサーバーへの接続に失敗しました:", error);
			throw error;
		}
	}

	/**
	 * Vault内の全ファイルをインデックス（MCPサーバーを使用）
	 */
	async indexAllFiles(directoryPath?: string): Promise<void> {
		if (this.isIndexing) {
			console.log("[RAG Search] インデックス処理は既に実行中です");
			return;
		}

		this.isIndexing = true;
		this.indexProgress = { current: 0, total: 0 };

		try {
			// ディレクトリパスが指定されていない場合は、Vaultのパスを使用
			const targetPath = directoryPath || this.app.vault.adapter.basePath;
			console.log(`[RAG Search] インデックス作成を開始: ${targetPath}`);

			// MCPサーバーにインデックス作成を依頼
			const result = await this.mcpService.createIndex(targetPath, false);
			console.log(`[RAG Search] インデックス作成ジョブ開始: ${result.job_id}`);

			// ジョブの進捗を監視
			await this.monitorJobProgress(result.job_id);

			// 統計情報を取得してインデックス数を更新
			const stats = await this.mcpService.getSearchStats();
			this.indexedCount = stats.total_documents;

			console.log(`[RAG Search] インデックス完了: ${stats.total_documents}個のドキュメント`);
		} catch (error) {
			console.error("[RAG Search] インデックス処理中にエラーが発生しました:", error);
			throw error;
		} finally {
			this.isIndexing = false;
			this.indexProgress = null;
		}
	}

	/**
	 * ジョブの進捗を監視
	 */
	private async monitorJobProgress(jobId: number): Promise<void> {
		const maxAttempts = 3600; // 最大1時間（2秒間隔）
		let attempts = 0;

		while (attempts < maxAttempts) {
			try {
				const job = await this.mcpService.getJobStatus(jobId);
				
				if (job.status === 'completed') {
					this.indexProgress = {
						current: job.progress.total,
						total: job.progress.total,
					};
					return;
				} else if (job.status === 'failed') {
					throw new Error(job.error_message || 'インデックス作成が失敗しました');
				} else if (job.status === 'cancelled') {
					throw new Error('インデックス作成がキャンセルされました');
				} else if (job.status === 'processing') {
					this.indexProgress = {
						current: job.progress.current,
						total: job.progress.total,
					};
				}

				// 2秒待機
				await new Promise((resolve) => setTimeout(resolve, 2000));
				attempts++;
			} catch (error) {
				console.error("[RAG Search] ジョブ進捗確認エラー:", error);
				throw error;
			}
		}

		throw new Error('インデックス作成のタイムアウト');
	}

	/**
	 * 検索を実行（MCPサーバーのハイブリッド検索を使用）
	 * @param query 検索クエリ
	 * @param limit 取得件数（デフォルト: 20）
	 * @param hybridWeight ベクトル検索の重み（デフォルト: 0.5）
	 * @param expandSynonyms 類義語展開を使用するか（デフォルト: false）
	 * @returns 検索結果の配列
	 */
	async search(
		query: string,
		limit?: number,
		hybridWeight?: number,
		expandSynonyms?: boolean
	): Promise<SearchHit[]> {
		await this.initialize();

		try {
			// 設定からパラメータを取得（未指定の場合は設定値を使用）
			const searchLimit = limit ?? (this.settings?.mcpSearchLimit || 20);
			const weight = hybridWeight ?? (this.settings?.mcpHybridWeight || 0.5);
			const keywordLimit = this.settings?.mcpKeywordLimit || 10;
			const vectorLimit = this.settings?.mcpVectorLimit || 20;
			const expand = expandSynonyms ?? (this.settings?.mcpExpandSynonyms || false);

			console.log(`[RAG Search] ハイブリッド検索クエリ: "${query}"`);
			
			// MCPサーバーでハイブリッド検索を実行
			const result = await this.mcpService.hybridSearch(
				query,
				searchLimit,
				weight,
				keywordLimit,
				vectorLimit,
				expand
			);

			console.log(`[RAG Search] 検索結果: ${result.total}件`);

			// 検索結果を整形（MCPサーバーのSearchResultをSearchHitに変換）
			const hits: SearchHit[] = result.results.map((r: SearchResult) => ({
				path: r.file_path,
				content: r.snippet || '',
				score: 1.0, // MCPサーバーはスコアを返さないため、デフォルト値を設定
				file_type: r.file_type,
				location_info: r.location_info,
				snippet: r.snippet,
			}));

			// デバッグ用: 検索結果の詳細をログに出力
			if (hits.length > 0) {
				console.log(`[RAG Search] 検索結果のサンプル:`, {
					path: hits[0].path,
					contentPreview: hits[0].snippet?.substring(0, 100) + "..." || "",
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
	 * データベースが初期化されているか（MCPサーバーが利用可能か）
	 */
	async isInitialized(): Promise<boolean> {
		try {
			return await this.mcpService.isServerAvailable();
		} catch {
			return false;
		}
	}
}

