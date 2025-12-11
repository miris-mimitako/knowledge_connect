/**
 * RRF (Reciprocal Rank Fusion) Algorithm
 * 複数の検索結果を統合するアルゴリズム
 * k=60固定、重み付け1:1、順位ベースの統合
 */

export interface SearchResult {
	id: string;
	score: number;
	rank: number;
	document: any;
}

export interface RRFResult {
	id: string;
	rrfScore: number;
	document: any;
	ranks: number[]; // 各検索結果での順位
}

/**
 * RRFアルゴリズムで検索結果を統合
 * @param results 複数の検索結果（各検索結果は順位順にソートされている）
 * @param k RRFの定数（デフォルト60）
 * @param weights 各検索結果の重み（デフォルト1:1）
 * @returns 統合された検索結果（RRFスコア順）
 */
export function reciprocalRankFusion(
	results: SearchResult[][],
	k: number = 60,
	weights: number[] = []
): RRFResult[] {
	// 重みが指定されていない場合は、すべて1.0に設定
	if (weights.length === 0) {
		weights = new Array(results.length).fill(1.0);
	}

	// 重みの数が結果の数と一致しない場合は、不足分を1.0で埋める
	while (weights.length < results.length) {
		weights.push(1.0);
	}

	// 各ドキュメントのRRFスコアを計算
	const rrfScores: Map<string, RRFResult> = new Map();

	for (let i = 0; i < results.length; i++) {
		const resultSet = results[i];
		const weight = weights[i] || 1.0;

		for (let rank = 0; rank < resultSet.length; rank++) {
			const result = resultSet[rank];
			const documentId = result.id;

			// RRFスコアを計算: 1 / (k + rank)
			const rrfScore = weight / (k + rank);

			if (rrfScores.has(documentId)) {
				// 既に存在する場合はスコアを加算
				const existing = rrfScores.get(documentId)!;
				existing.rrfScore += rrfScore;
				existing.ranks.push(rank + 1); // 1ベースの順位
			} else {
				// 新規の場合は追加
				rrfScores.set(documentId, {
					id: documentId,
					rrfScore,
					document: result.document,
					ranks: [rank + 1], // 1ベースの順位
				});
			}
		}
	}

	// RRFスコアでソート（降順）
	const sortedResults = Array.from(rrfScores.values()).sort(
		(a, b) => b.rrfScore - a.rrfScore
	);

	return sortedResults;
}

/**
 * 検索結果を順位に変換
 * @param hits 検索結果のヒット配列
 * @returns 順位付きの検索結果
 */
export function convertToRankedResults(hits: any[]): SearchResult[] {
	return hits.map((hit, index) => ({
		id: hit.id || hit.document?.filePath || String(index),
		score: hit.score || 0,
		rank: index + 1, // 1ベースの順位
		document: hit.document || hit,
	}));
}

