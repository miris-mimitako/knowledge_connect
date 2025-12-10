/**
 * Search Worker
 * 検索処理とベクトル化処理をWeb Workerで実行
 */

import { create, insert, search, searchVector, remove, update } from '@orama/orama';
import { createOramaSchema, DEFAULT_VECTOR_DIMENSIONS, type DocumentSchema } from './orama-schema';
import { serializeIndex, deserializeIndex } from './persistence-manager';

// Worker内でOramaのインスタンスを保持
let db: any = null;

// メッセージタイプの定義
type WorkerMessageType = 
	| 'INIT_DB'
	| 'ADD_DOCUMENT'
	| 'UPDATE_DOCUMENT'
	| 'REMOVE_DOCUMENT'
	| 'SEARCH_KEYWORD'
	| 'SEARCH_VECTOR'
	| 'SEARCH_HYBRID'
	| 'SAVE_INDEX'
	| 'LOAD_INDEX'
	| 'VECTORIZE_FILE'
	| 'CHECK_DOCUMENT_EXISTS';

interface WorkerMessage {
	type: WorkerMessageType;
	payload?: any;
}

interface WorkerResponse {
	type: string;
	payload?: any;
	error?: string;
}

// Worker起動時のログ
console.log('[SearchWorker] Worker script loaded and ready');

// メインスレッドからのメッセージを受信
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
	const { type, payload } = e.data;

	console.log('[SearchWorker] Received message:', type, payload ? '(with payload)' : '(no payload)');

	try {
		switch (type) {
			case 'INIT_DB':
				console.log('[SearchWorker] Handling INIT_DB...');
				await handleInitDB(payload);
				break;

			case 'ADD_DOCUMENT':
				await handleAddDocument(payload);
				break;

			case 'UPDATE_DOCUMENT':
				await handleUpdateDocument(payload);
				break;

			case 'REMOVE_DOCUMENT':
				await handleRemoveDocument(payload);
				break;

			case 'SEARCH_KEYWORD':
				await handleSearchKeyword(payload);
				break;

			case 'SEARCH_VECTOR':
				await handleSearchVector(payload);
				break;

			case 'SEARCH_HYBRID':
				await handleSearchHybrid(payload);
				break;

			case 'SAVE_INDEX':
				await handleSaveIndex();
				break;

			case 'LOAD_INDEX':
				await handleLoadIndex(payload);
				break;

			case 'VECTORIZE_FILE':
				await handleVectorizeFile(payload);
				break;

			case 'CHECK_DOCUMENT_EXISTS':
				await handleCheckDocumentExists(payload);
				break;

			default:
				sendError(`Unknown message type: ${type}`);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const errorStack = error instanceof Error ? error.stack : undefined;
		console.error('[SearchWorker] Unhandled error in message handler:', {
			message: errorMessage,
			stack: errorStack,
			error: error,
			messageType: type
		});
		sendError(`Unhandled error: ${errorMessage}`);
	}
};

// Workerエラーハンドラー
self.onerror = (event: ErrorEvent) => {
	console.error('[SearchWorker] Global error handler:', {
		message: event.message,
		filename: event.filename,
		lineno: event.lineno,
		colno: event.colno,
		error: event.error
	});
};

// 未処理のPromise拒否をキャッチ
self.onunhandledrejection = (event: PromiseRejectionEvent) => {
	console.error('[SearchWorker] Unhandled promise rejection:', event.reason);
};

/**
 * DB初期化
 */
async function handleInitDB(payload?: any) {
	try {
		console.log('[SearchWorker] Starting DB initialization...');
		
		// ベクトル次元数はペイロードから取得、デフォルトは1536
		const vectorDimensions = payload?.vectorDimensions || DEFAULT_VECTOR_DIMENSIONS;
		console.log('[SearchWorker] Vector dimensions:', vectorDimensions);
		
		// Oramaのスキーマ定義
		console.log('[SearchWorker] Creating schema...');
		const schema = createOramaSchema(vectorDimensions);
		console.log('[SearchWorker] Schema created:', Object.keys(schema));
		
		// Oramaインスタンスを作成
		console.log('[SearchWorker] Creating Orama instance...');
		db = await create({ schema });
		console.log('[SearchWorker] Orama DB created successfully, db type:', typeof db);

		// 初期化完了をメインスレッドに通知
		console.log('[SearchWorker] Sending INIT_DB_DONE message...');
		sendResponse({
			type: 'INIT_DB_DONE',
			payload: { success: true, vectorDimensions },
		});
		console.log('[SearchWorker] INIT_DB_DONE message sent successfully');
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : undefined;
		console.error('[SearchWorker] DB initialization error:', {
			message: errorMessage,
			stack: errorStack,
			error: error
		});
		sendError(`Failed to initialize DB: ${errorMessage}`);
	}
}

/**
 * ドキュメント追加
 */
async function handleAddDocument(payload: any) {
	if (!db) {
		sendError('DB not initialized');
		return;
	}

	try {
		const { filePath, title, content, vector, metadata } = payload;
		
		// metadataはスキーマに含まれていないが、ドキュメントに直接含める
		await insert(db, {
			filePath,
			title,
			content,
			vector,
			...(metadata ? { metadata } : {}),
		} as any);

		sendResponse({
			type: 'DOCUMENT_ADDED',
			payload: { filePath, success: true },
		});
	} catch (error) {
		sendError(`Failed to add document: ${error}`);
	}
}

/**
 * ドキュメント更新
 */
async function handleUpdateDocument(payload: any) {
	if (!db) {
		sendError('DB not initialized');
		return;
	}

	try {
		const { filePath, title, content, vector, metadata } = payload;
		
		// OramaのupdateはIDベースなので、まず検索してIDを取得
		// 簡易実装：削除して再追加
		await handleRemoveDocument({ filePath });
		await handleAddDocument({ filePath, title, content, vector, metadata });

		sendResponse({
			type: 'DOCUMENT_UPDATED',
			payload: { filePath, success: true },
		});
	} catch (error) {
		sendError(`Failed to update document: ${error}`);
	}
}

/**
 * ドキュメント削除
 */
async function handleRemoveDocument(payload: any) {
	if (!db) {
		sendError('DB not initialized');
		return;
	}

	try {
		const { filePath } = payload;
		
		// OramaのremoveはIDベースなので、まず検索してIDを取得
		const results = await search(db, {
			term: filePath,
			properties: ['filePath'],
		});

		if (results.hits.length > 0) {
			// 簡易実装：最初のヒットを削除
			// 実際の実装では、filePathをIDとして使用するか、適切なID管理が必要
			await remove(db, results.hits[0].id);
		}

		sendResponse({
			type: 'DOCUMENT_REMOVED',
			payload: { filePath, success: true },
		});
	} catch (error) {
		sendError(`Failed to remove document: ${error}`);
	}
}

/**
 * キーワード検索
 * AND/OR検索、AND優先表示、日付順ソートを実装
 */
async function handleSearchKeyword(payload: any) {
	if (!db) {
		sendError('DB not initialized');
		return;
	}

	try {
		const { query, limit = 20 } = payload;
		
		// クエリをスペースで分割
		const keywords = query.trim().split(/\s+/).filter((k: string) => k.length > 0);
		
		if (keywords.length === 0) {
			sendResponse({
				type: 'SEARCH_KEYWORD_RESULTS',
				payload: { hits: [], count: 0 },
			});
			return;
		}

		// AND検索: すべてのキーワードを含む結果
		const andResults: any[] = [];
		if (keywords.length > 1) {
			// 各キーワードで検索して、すべてにマッチする結果を抽出
			const keywordResults: Map<string, any[]> = new Map();
			
			for (const keyword of keywords) {
				const results = await search(db, {
					term: keyword,
					limit: limit * 2, // より多くの結果を取得
				});
				keywordResults.set(keyword, results.hits);
			}

			// すべてのキーワードにマッチする結果を抽出
			const firstKeywordHits = keywordResults.get(keywords[0]) || [];
			for (const hit of firstKeywordHits) {
				const filePath = hit.document.filePath;
				let matchesAll = true;

				// 他のキーワードでもマッチするか確認
				for (let i = 1; i < keywords.length; i++) {
					const keywordHits = keywordResults.get(keywords[i]) || [];
					const found = keywordHits.some((h: any) => h.document.filePath === filePath);
					if (!found) {
						matchesAll = false;
						break;
					}
				}

				if (matchesAll) {
					// スコアを合計（または平均）
					const totalScore = keywords.reduce((sum: number, keyword: string) => {
						const keywordHits = keywordResults.get(keyword) || [];
						const hit = keywordHits.find((h: any) => h.document.filePath === filePath);
						return sum + (hit?.score || 0);
					}, 0);
					
					andResults.push({
						...hit,
						score: totalScore / keywords.length, // 平均スコア
					});
				}
			}
		} else {
			// 単一キーワードの場合は通常の検索
			const results = await search(db, {
				term: keywords[0],
				limit: limit * 2,
			});
			andResults.push(...results.hits);
		}

		// OR検索: いずれかのキーワードを含む結果（AND結果を除く）
		const orResults: any[] = [];
		const andFilePaths = new Set(andResults.map((h: any) => h.document.filePath));
		
		for (const keyword of keywords) {
			const results = await search(db, {
				term: keyword,
				limit: limit * 2,
			});
			
			for (const hit of results.hits) {
				if (!andFilePaths.has(hit.document.filePath)) {
					// 重複チェック
					const exists = orResults.some((r: any) => r.document.filePath === hit.document.filePath);
					if (!exists) {
						orResults.push(hit);
					}
				}
			}
		}

		// メタデータから日付を取得してソート
		const sortByDate = (a: any, b: any) => {
			const dateA = a.document.metadata?.lastModified || 0;
			const dateB = b.document.metadata?.lastModified || 0;
			return dateB - dateA; // 新しい順
		};

		// AND結果を優先、その後OR結果を日付順でソート
		andResults.sort((a, b) => {
			// まずスコアでソート、同じスコアなら日付順
			if (Math.abs(a.score - b.score) > 0.001) {
				return b.score - a.score;
			}
			return sortByDate(a, b);
		});

		orResults.sort(sortByDate);

		// 結果を結合（AND優先、その後OR）
		const allResults = [...andResults, ...orResults].slice(0, limit);

		// 必要なデータのみ抽出して返す
		const filteredResults = {
			hits: allResults.map((hit: any) => ({
				id: hit.id,
				score: hit.score,
				document: {
					filePath: hit.document.filePath,
					title: hit.document.title,
					content: hit.document.content,
					metadata: hit.document.metadata,
				},
			})),
			count: allResults.length,
		};

		sendResponse({
			type: 'SEARCH_KEYWORD_RESULTS',
			payload: filteredResults,
		});
	} catch (error) {
		sendError(`Failed to search keyword: ${error}`);
	}
}

/**
 * ベクトル検索
 * 類似度順でソート、10〜100件の選択可能、デフォルト10件
 */
async function handleSearchVector(payload: any) {
	if (!db) {
		sendError('DB not initialized');
		return;
	}

	try {
		let { vector, limit = 10 } = payload;
		
		// 結果件数を10〜100の範囲に制限
		limit = Math.max(10, Math.min(100, limit));

		// Oramaのベクトル検索実装
		// searchVector関数を使用（類似度順でソートされる）
		const results = await searchVector(db, {
			mode: 'vector' as const,
			vector: {
				value: vector,
				property: 'vector',
			},
			limit,
		});

		// スコアでソート（類似度が高い順、Oramaが既にソートしているが念のため）
		const sortedHits = results.hits.sort((a: any, b: any) => b.score - a.score);

		// 必要なデータのみ抽出して返す（データ転送最適化）
		const filteredResults = {
			hits: sortedHits.map((hit: any) => ({
				id: hit.id,
				score: hit.score,
				document: {
					filePath: hit.document.filePath,
					title: hit.document.title,
					content: hit.document.content?.substring(0, 500) || '', // プレビュー用に500文字に制限
					metadata: hit.document.metadata,
				},
			})),
			count: sortedHits.length,
		};

		sendResponse({
			type: 'SEARCH_VECTOR_RESULTS',
			payload: filteredResults,
		});
	} catch (error) {
		sendError(`Failed to search vector: ${error}`);
	}
}

/**
 * RRFアルゴリズムで検索結果を統合（Worker内実装）
 */
function reciprocalRankFusion(
	keywordHits: any[],
	vectorHits: any[],
	k: number = 60
): any[] {
	const rrfScores: Map<string, any> = new Map();

	// キーワード検索結果を処理
	for (let rank = 0; rank < keywordHits.length; rank++) {
		const hit = keywordHits[rank];
		const id = hit.id || hit.document?.filePath || String(rank);
		const rrfScore = 1.0 / (k + rank);

		if (rrfScores.has(id)) {
			rrfScores.get(id).rrfScore += rrfScore;
		} else {
			rrfScores.set(id, {
				id,
				rrfScore,
				document: hit.document || hit,
				ranks: [rank + 1],
			});
		}
	}

	// ベクトル検索結果を処理
	for (let rank = 0; rank < vectorHits.length; rank++) {
		const hit = vectorHits[rank];
		const id = hit.id || hit.document?.filePath || String(rank);
		const rrfScore = 1.0 / (k + rank);

		if (rrfScores.has(id)) {
			const existing = rrfScores.get(id);
			existing.rrfScore += rrfScore;
			existing.ranks.push(rank + 1);
		} else {
			rrfScores.set(id, {
				id,
				rrfScore,
				document: hit.document || hit,
				ranks: [rank + 1],
			});
		}
	}

	// RRFスコアでソート（降順）
	return Array.from(rrfScores.values())
		.sort((a, b) => b.rrfScore - a.rrfScore)
		.map((result) => ({
			id: result.id,
			score: result.rrfScore,
			document: result.document,
			ranks: result.ranks,
		}));
}

/**
 * ハイブリッド検索
 * キーワード検索とベクトル検索の結果をRRFで統合
 */
async function handleSearchHybrid(payload: any) {
	if (!db) {
		sendError('DB not initialized');
		return;
	}

	try {
		const { query, vector, limit = 10 } = payload;
		
		// キーワード検索とベクトル検索を並行実行
		// より多くの結果を取得してからRRFで統合
		const searchLimit = Math.max(limit * 2, 20);
		
		const keywordPromise = new Promise<any>((resolve) => {
			handleSearchKeyword({ query, limit: searchLimit })
				.then(() => {
					// 結果はsendResponseで送信されるため、ここでは待機のみ
					resolve(null);
				})
				.catch(() => resolve(null));
		});

		const vectorPromise = new Promise<any>((resolve) => {
			handleSearchVector({ vector, limit: searchLimit })
				.then(() => {
					// 結果はsendResponseで送信されるため、ここでは待機のみ
					resolve(null);
				})
				.catch(() => resolve(null));
		});

		// 直接検索を実行（Promise.allは使わない）
		// キーワード検索
		const keywords = query.trim().split(/\s+/).filter((k: string) => k.length > 0);
		let keywordHits: any[] = [];
		
		if (keywords.length > 0) {
			const keywordResults = await search(db, {
				term: keywords[0],
				limit: searchLimit,
			});
			keywordHits = keywordResults.hits.map((hit: any) => ({
				id: hit.id || hit.document?.filePath,
				score: hit.score,
				document: {
					filePath: hit.document.filePath,
					title: hit.document.title,
					content: hit.document.content,
					metadata: hit.document.metadata,
				},
			}));
		}

		// ベクトル検索
		const vectorResults = await searchVector(db, {
			mode: 'vector' as const,
			vector: {
				value: vector,
				property: 'vector',
			},
			limit: searchLimit,
		});

		const vectorHits = vectorResults.hits.map((hit: any) => ({
			id: hit.id || hit.document?.filePath,
			score: hit.score,
			document: {
				filePath: hit.document.filePath,
				title: hit.document.title,
				content: hit.document.content,
				metadata: hit.document.metadata,
			},
		}));

		// RRFアルゴリズムで統合（k=60、重み付け1:1）
		const fusedResults = reciprocalRankFusion(keywordHits, vectorHits, 60);

		// 結果を制限
		const limitedResults = fusedResults.slice(0, limit);

		sendResponse({
			type: 'SEARCH_HYBRID_RESULTS',
			payload: {
				hits: limitedResults,
				count: limitedResults.length,
			},
		});
	} catch (error) {
		sendError(`Failed to search hybrid: ${error}`);
	}
}


/**
 * インデックスを保存
 */
async function handleSaveIndex() {
	if (!db) {
		sendError('DB not initialized');
		return;
	}

	try {
		const serialized = await serializeIndex(db);
		
		// ArrayBufferをTransferable Objectとして送信（ゼロコピー転送）
		// postMessageの第2引数にTransferable配列を渡す
		(self.postMessage as any)({
			type: 'INDEX_SAVED',
			payload: { data: serialized },
		}, [serialized]);
	} catch (error) {
		sendError(`Failed to save index: ${error}`);
	}
}

/**
 * インデックスを読み込み
 */
async function handleLoadIndex(payload: any) {
	try {
		const { data, vectorDimensions } = payload;
		
		// データを復元
		const restoredDb = await deserializeIndex(data, null, vectorDimensions);
		db = restoredDb;

		sendResponse({
			type: 'INDEX_LOADED',
			payload: { success: true },
		});
	} catch (error) {
		sendError(`Failed to load index: ${error}`);
	}
}

/**
 * メインスレッドにレスポンスを送信
 */
function sendResponse(response: WorkerResponse) {
	try {
		self.postMessage(response);
	} catch (e) {
		console.error('[SearchWorker] Failed to send response:', e, response);
		sendError(`Failed to send response: ${e instanceof Error ? e.message : String(e)}`);
	}
}

/**
 * ファイルをベクトル化してOramaに登録
 */
async function handleVectorizeFile(payload: any) {
	if (!db) {
		sendError('DB not initialized');
		return;
	}

	try {
		const {
			filePath,
			title,
			content,
			metadata,
			apiKey,
			model,
			timeoutSeconds,
		} = payload;

		// テキスト解析（Worker内で実行）
		const processedText = extractTextFromMarkdown(content);

		if (!processedText || processedText.trim().length === 0) {
			sendError(`File has no extractable text: ${filePath}`);
			return;
		}

		// OpenRouter APIを呼び出してベクトル化
		const vector = await callEmbeddingAPI(processedText, apiKey, model, timeoutSeconds);

		// Oramaに登録
		await insert(db, {
			filePath,
			title,
			content: processedText.substring(0, 1000), // プレビュー用（最初の1000文字）
			vector,
			...(metadata ? { metadata } : {}),
		} as any);

		sendResponse({
			type: 'FILE_VECTORIZED',
			payload: {
				filePath,
				success: true,
				dimensions: vector.length,
			},
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		sendError(`Failed to vectorize file: ${errorMessage}`);
	}
}

/**
 * OpenRouter Embedding APIを呼び出し
 */
async function callEmbeddingAPI(
	text: string,
	apiKey: string,
	model: string,
	timeoutSeconds: number
): Promise<number[]> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

	try {
		// OpenRouterのEmbedding APIエンドポイント
		// 注意: OpenRouterがembeddingエンドポイントを提供しているか確認が必要
		const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
				'HTTP-Referer': 'https://obsidian.md',
				'X-Title': 'Knowledge Connect Plugin',
			},
			body: JSON.stringify({
				model: model,
				input: text,
			}),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(
				`OpenRouter Embedding API エラー: ${response.status} ${response.statusText}. ${
					errorData.error?.message || ''
				}`
			);
		}

		const data = await response.json();

		if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
			throw new Error('OpenRouter Embedding APIからの応答形式が不正です。');
		}

		const embedding = data.data[0];
		if (!embedding.embedding || !Array.isArray(embedding.embedding)) {
			throw new Error('Embeddingデータが不正です。');
		}

		return embedding.embedding;
	} catch (error) {
		clearTimeout(timeoutId);
		if (error instanceof Error) {
			if (error.name === 'AbortError') {
				throw new Error(`リクエストがタイムアウトしました（${timeoutSeconds}秒）。`);
			}
			throw error;
		}
		throw new Error('予期しないエラーが発生しました。');
	}
}

/**
 * Markdownからテキストを抽出（Worker内で使用）
 */
function extractTextFromMarkdown(content: string): string {
	let text = content;

	// フロントマターを除去
	const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
	text = text.replace(frontMatterRegex, '');

	// コードブロックを除去
	text = text.replace(/```[\s\S]*?```/g, '');

	// インラインコードを除去
	text = text.replace(/`[^`]+`/g, '');

	// 画像を除去
	text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

	// リンクのテキストのみを抽出
	text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

	// Markdownの見出し記号を除去
	text = text.replace(/^#{1,6}\s+/gm, '');

	// リスト記号を除去
	text = text.replace(/^[\*\-\+]\s+/gm, '');
	text = text.replace(/^\d+\.\s+/gm, '');

	// 水平線を除去
	text = text.replace(/^---+\s*$/gm, '');

	// 余分な空白行を削除
	text = text.replace(/\n{3,}/g, '\n\n');

	// 前後の空白を削除
	text = text.trim();

	return text;
}

/**
 * ドキュメントの存在確認
 * filePathで完全一致検索を行う
 */
async function handleCheckDocumentExists(payload: any) {
	if (!db) {
		sendError('DB not initialized');
		return;
	}

	try {
		const { filePath } = payload;

		// filePathで検索（Oramaのsearchは全文検索なので、結果を確認する必要がある）
		// より効率的にするため、filePathの一部（ファイル名など）で検索してから完全一致を確認
		const searchTerm = filePath.split('/').pop() || filePath; // ファイル名部分を取得
		const results = await search(db, {
			term: searchTerm,
			limit: 100, // より多くの結果を取得して完全一致を確認
		});

		// 結果を確認（filePathが完全一致するものを探す）
		const exists = results.hits.some((hit: any) => {
			return hit.document.filePath === filePath;
		});

		sendResponse({
			type: 'CHECK_DOCUMENT_EXISTS_RESULT',
			payload: { exists },
		});
	} catch (error) {
		sendError(`Failed to check document exists: ${error}`);
	}
}

/**
 * エラーをメインスレッドに送信
 */
function sendError(error: string) {
	console.error('[SearchWorker] Sending error to main thread:', error);
	try {
		self.postMessage({
			type: 'ERROR',
			error,
		});
	} catch (e) {
		console.error('[SearchWorker] Failed to send error message:', e);
	}
}

