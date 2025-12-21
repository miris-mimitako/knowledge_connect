/**
 * MCP Service
 * MCPサーバーとの通信を管理するサービス
 */

export interface MCPServerResponse {
	message?: string;
	status?: string;
	version?: string;
	[key: string]: any;
}

export interface HelloWorldResponse {
	message: string;
	version: string;
	status: string;
}

export interface IndexJobRequest {
	directory_path: string;
	clear_existing?: boolean;
}

export interface IndexJobResponse {
	message: string;
	job_id: number;
	directory_path: string;
}

export interface SearchQueryRequest {
	query: string;
	limit?: number;
}

export interface SearchResult {
	file_path: string;
	file_type: string;
	location_info: string;
	snippet: string;
}

export interface SearchResponse {
	query: string;
	results: SearchResult[];
	total: number;
}

export interface JobProgress {
	current: number;
	total: number;
	percentage: number;
	message: string;
}

export interface Job {
	id: number;
	job_type: string;
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
	parameters: any;
	progress: JobProgress;
	created_at: string;
	started_at?: string;
	updated_at: string;
	error_message?: string;
	result?: any;
}

export interface SearchStats {
	total_documents: number;
	database_path: string;
}

export interface VectorizeRequest {
	directory_path: string;
	provider?: string;
	model?: string;
	api_base?: string;
	chunk_size?: number;
	chunk_overlap?: number;
}

export interface VectorizeResponse {
	message: string;
	job_id: number;
	directory_path: string;
}

export interface VectorizeStats {
	collection_name: string;
	total_chunks: number;
	persist_directory: string;
}

export interface HybridSearchRequest {
	query: string;
	limit?: number;
	hybrid_weight?: number;
	keyword_limit?: number;
	vector_limit?: number;
	expand_synonyms?: boolean;
}

export interface HybridSearchResponse {
	query: string;
	results: SearchResult[];
	total: number;
}

export interface RAGRequest {
	query: string;
	limit?: number;
	hybrid_weight?: number;
	keyword_limit?: number;
	vector_limit?: number;
	expand_synonyms?: boolean;
	llm_provider?: string;
	model?: string;
	api_base?: string;
	temperature?: number;
	max_tokens?: number | null;
}

export interface RAGResponse {
	query: string;
	answer: string;
	sources: SearchResult[];
	model_used: string;
	provider_used: string;
}

export interface LLMModel {
	id: string;
	name: string;
	object: string;
}

export interface LLMModelsResponse {
	api_base: string;
	models: LLMModel[];
	total: number;
}

export class MCPService {
	private readonly baseUrl: string;

	constructor(baseUrl?: string) {
		this.baseUrl = baseUrl || 'http://127.0.0.1:8000';
	}

	/**
	 * MCPサーバーにGETリクエストを送信
	 */
	async callServer(endpoint: string): Promise<MCPServerResponse> {
		try {
			const response = await fetch(`${this.baseUrl}${endpoint}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			return await response.json();
		} catch (error) {
			console.error('MCPサーバーへの接続エラー:', error);
			throw error;
		}
	}

	/**
	 * MCPサーバーにPOSTリクエストを送信
	 */
	async postToServer(endpoint: string, data: any): Promise<MCPServerResponse> {
		try {
			const response = await fetch(`${this.baseUrl}${endpoint}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(data),
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			return await response.json();
		} catch (error) {
			console.error('MCPサーバーへの接続エラー:', error);
			throw error;
		}
	}

	/**
	 * サーバーのヘルスチェック
	 */
	async checkHealth(): Promise<{ status: string; healthy: boolean }> {
		try {
			const result = await this.callServer('/health');
			return {
				status: result.status || 'unknown',
				healthy: result.status === 'healthy',
			};
		} catch (error) {
			return {
				status: 'unreachable',
				healthy: false,
			};
		}
	}

	/**
	 * Hello Worldエンドポイントを呼び出す
	 */
	async getHelloWorld(): Promise<HelloWorldResponse> {
		try {
			const result = await this.callServer('/');
			return {
				message: result.message || 'No message received',
				version: result.version || 'unknown',
				status: result.status || 'unknown',
			};
		} catch (error) {
			throw new Error('MCPサーバーに接続できません。サーバーが起動しているか確認してください。');
		}
	}

	/**
	 * サーバーが利用可能か確認
	 */
	async isServerAvailable(): Promise<boolean> {
		try {
			const health = await this.checkHealth();
			return health.healthy;
		} catch (error) {
			return false;
		}
	}

	/**
	 * インデックス作成ジョブを開始
	 */
	async createIndex(directoryPath: string, clearExisting: boolean = false): Promise<IndexJobResponse> {
		try {
			const result = await this.postToServer('/search/index', {
				directory_path: directoryPath,
				clear_existing: clearExisting,
			});
			return {
				message: result.message || 'インデックス作成ジョブを開始しました',
				job_id: result.job_id,
				directory_path: result.directory_path || directoryPath,
			};
		} catch (error) {
			throw new Error('インデックス作成に失敗しました。サーバーが起動しているか確認してください。');
		}
	}

	/**
	 * 全文検索を実行
	 */
	async searchDocuments(query: string, limit: number = 50): Promise<SearchResponse> {
		try {
			const encodedQuery = encodeURIComponent(query);
			const result = await this.callServer(`/search/query?query=${encodedQuery}&limit=${limit}`);
			return {
				query: result.query || query,
				results: result.results || [],
				total: result.total || 0,
			};
		} catch (error) {
			throw new Error('検索に失敗しました。サーバーが起動しているか確認してください。');
		}
	}

	/**
	 * 全文検索を実行（POST版）
	 */
	async searchDocumentsPost(query: string, limit: number = 50): Promise<SearchResponse> {
		try {
			const result = await this.postToServer('/search/query', {
				query: query,
				limit: limit,
			});
			return {
				query: result.query || query,
				results: result.results || [],
				total: result.total || 0,
			};
		} catch (error) {
			throw new Error('検索に失敗しました。サーバーが起動しているか確認してください。');
		}
	}

	/**
	 * ジョブの進捗状況を取得
	 */
	async getJobStatus(jobId: number): Promise<Job> {
		try {
			const result = await this.callServer(`/search/jobs/${jobId}`);
			return result as Job;
		} catch (error) {
			throw new Error(`ジョブ ${jobId} の取得に失敗しました。`);
		}
	}

	/**
	 * ジョブ一覧を取得
	 */
	async getJobs(status?: string, limit: number = 100): Promise<Job[]> {
		try {
			let endpoint = `/search/jobs?limit=${limit}`;
			if (status) {
				endpoint += `&status=${encodeURIComponent(status)}`;
			}
			const result = await this.callServer(endpoint);
			return Array.isArray(result) ? result : result.jobs || [];
		} catch (error) {
			throw new Error('ジョブ一覧の取得に失敗しました。');
		}
	}

	/**
	 * ジョブをキャンセル
	 */
	async cancelJob(jobId: number): Promise<{ message: string; job_id: number }> {
		try {
			const result = await this.postToServer(`/search/jobs/${jobId}/cancel`, {});
			return {
				message: result.message || `ジョブ ${jobId} をキャンセルしました`,
				job_id: result.job_id || jobId,
			};
		} catch (error) {
			throw new Error(`ジョブ ${jobId} のキャンセルに失敗しました。`);
		}
	}

	/**
	 * 統計情報を取得
	 */
	async getSearchStats(): Promise<SearchStats> {
		try {
			const result = await this.callServer('/search/stats');
			return {
				total_documents: result.total_documents || 0,
				database_path: result.database_path || '',
			};
		} catch (error) {
			throw new Error('統計情報の取得に失敗しました。');
		}
	}

	/**
	 * ディレクトリをベクトル化
	 */
	async vectorizeDirectory(
		directoryPath: string,
		provider?: string,
		model?: string,
		apiBase?: string,
		chunkSize: number = 512,
		chunkOverlap: number = 50
	): Promise<VectorizeResponse> {
		try {
			const requestBody: VectorizeRequest = {
				directory_path: directoryPath,
				chunk_size: chunkSize,
				chunk_overlap: chunkOverlap,
			};
			if (provider) requestBody.provider = provider;
			if (model) requestBody.model = model;
			if (apiBase) requestBody.api_base = apiBase;

			const result = await this.postToServer('/search/vectorize', requestBody);
			return {
				message: result.message || 'ベクトル化ジョブを開始しました',
				job_id: result.job_id,
				directory_path: result.directory_path || directoryPath,
			};
		} catch (error) {
			throw new Error('ベクトル化に失敗しました。サーバーが起動しているか確認してください。');
		}
	}

	/**
	 * ベクトルストアの統計情報を取得
	 */
	async getVectorizeStats(): Promise<VectorizeStats> {
		try {
			const result = await this.callServer('/search/vectorize/stats');
			return {
				collection_name: result.collection_name || '',
				total_chunks: result.total_chunks || 0,
				persist_directory: result.persist_directory || '',
			};
		} catch (error) {
			throw new Error('ベクトルストアの統計情報の取得に失敗しました。');
		}
	}

	/**
	 * ハイブリッド検索を実行
	 */
	async hybridSearch(
		query: string,
		limit: number = 20,
		hybridWeight: number = 0.5,
		keywordLimit: number = 10,
		vectorLimit: number = 20,
		expandSynonyms: boolean = false
	): Promise<HybridSearchResponse> {
		try {
			const encodedQuery = encodeURIComponent(query);
			const url = `/search/hybrid?query=${encodedQuery}&limit=${limit}&hybrid_weight=${hybridWeight}&keyword_limit=${keywordLimit}&vector_limit=${vectorLimit}&expand_synonyms=${expandSynonyms}`;
			const result = await this.callServer(url);
			return {
				query: result.query || query,
				results: result.results || [],
				total: result.total || 0,
			};
		} catch (error) {
			throw new Error('ハイブリッド検索に失敗しました。サーバーが起動しているか確認してください。');
		}
	}

	/**
	 * ハイブリッド検索を実行（POST版）
	 */
	async hybridSearchPost(
		query: string,
		limit: number = 20,
		hybridWeight: number = 0.5,
		keywordLimit: number = 10,
		vectorLimit: number = 20,
		expandSynonyms: boolean = false
	): Promise<HybridSearchResponse> {
		try {
			const result = await this.postToServer('/search/hybrid', {
				query: query,
				limit: limit,
				hybrid_weight: hybridWeight,
				keyword_limit: keywordLimit,
				vector_limit: vectorLimit,
				expand_synonyms: expandSynonyms,
			});
			return {
				query: result.query || query,
				results: result.results || [],
				total: result.total || 0,
			};
		} catch (error) {
			throw new Error('ハイブリッド検索に失敗しました。サーバーが起動しているか確認してください。');
		}
	}

	/**
	 * RAG回答生成を実行
	 */
	async ragQuery(
		query: string,
		llmProvider?: string,
		model?: string,
		apiBase?: string,
		limit: number = 20,
		hybridWeight: number = 0.5,
		keywordLimit: number = 10,
		vectorLimit: number = 20,
		expandSynonyms: boolean = false,
		temperature: number = 0.7,
		maxTokens?: number | null
	): Promise<RAGResponse> {
		try {
			const encodedQuery = encodeURIComponent(query);
			let url = `/search/rag?query=${encodedQuery}&limit=${limit}&hybrid_weight=${hybridWeight}&keyword_limit=${keywordLimit}&vector_limit=${vectorLimit}&expand_synonyms=${expandSynonyms}&temperature=${temperature}`;
			if (llmProvider) url += `&llm_provider=${encodeURIComponent(llmProvider)}`;
			if (model) url += `&model=${encodeURIComponent(model)}`;
			if (apiBase) url += `&api_base=${encodeURIComponent(apiBase)}`;
			if (maxTokens !== undefined && maxTokens !== null) url += `&max_tokens=${maxTokens}`;

			const result = await this.callServer(url);
			return {
				query: result.query || query,
				answer: result.answer || '',
				sources: result.sources || [],
				model_used: result.model_used || '',
				provider_used: result.provider_used || '',
			};
		} catch (error) {
			throw new Error('RAG回答生成に失敗しました。サーバーが起動しているか確認してください。');
		}
	}

	/**
	 * RAG回答生成を実行（POST版）
	 */
	async ragQueryPost(
		query: string,
		llmProvider?: string,
		model?: string,
		apiBase?: string,
		limit: number = 20,
		hybridWeight: number = 0.5,
		keywordLimit: number = 10,
		vectorLimit: number = 20,
		expandSynonyms: boolean = false,
		temperature: number = 0.7,
		maxTokens?: number | null
	): Promise<RAGResponse> {
		try {
			const requestBody: RAGRequest = {
				query: query,
				limit: limit,
				hybrid_weight: hybridWeight,
				keyword_limit: keywordLimit,
				vector_limit: vectorLimit,
				expand_synonyms: expandSynonyms,
				temperature: temperature,
			};
			if (llmProvider) requestBody.llm_provider = llmProvider;
			if (model) requestBody.model = model;
			if (apiBase) requestBody.api_base = apiBase;
			if (maxTokens !== undefined && maxTokens !== null) requestBody.max_tokens = maxTokens;

			const result = await this.postToServer('/search/rag', requestBody);
			return {
				query: result.query || query,
				answer: result.answer || '',
				sources: result.sources || [],
				model_used: result.model_used || '',
				provider_used: result.provider_used || '',
			};
		} catch (error) {
			throw new Error('RAG回答生成に失敗しました。サーバーが起動しているか確認してください。');
		}
	}

	/**
	 * LiteLLMモデルリストを取得
	 */
	async getLLMModels(apiBase: string): Promise<LLMModelsResponse> {
		try {
			const encodedApiBase = encodeURIComponent(apiBase);
			const result = await this.callServer(`/search/llm/models?api_base=${encodedApiBase}`);
			return {
				api_base: result.api_base || apiBase,
				models: result.models || [],
				total: result.total || 0,
			};
		} catch (error) {
			throw new Error('LiteLLMモデルリストの取得に失敗しました。');
		}
	}
}

