/**
 * Orama Schema Definition
 * Oramaのインデックススキーマ定義
 */

import type { AnySchema } from '@orama/orama';

/**
 * ドキュメントのメタデータ
 */
export interface DocumentMetadata {
	/** ファイルパス */
	filePath: string;
	/** ファイル名 */
	fileName: string;
	/** 最終更新日時（Unix timestamp） */
	lastModified: number;
	/** ファイルサイズ（バイト） */
	fileSize: number;
	/** ベクトル化済みかどうか */
	vectorized: boolean;
	/** ベクトル化日時（Unix timestamp） */
	vectorizedAt?: number;
	/** ベクトル化モデル名 */
	vectorModel?: string;
	/** ベクトルの次元数 */
	vectorDimensions?: number;
}

/**
 * Oramaのドキュメントスキーマ
 */
export interface DocumentSchema {
	/** ファイルパス（一意のIDとして使用） */
	filePath: string;
	/** ファイル名 */
	title: string;
	/** ファイル内容（プレビュー用、全文ではない） */
	content: string;
	/** ベクトル（埋め込み表現） */
	vector: number[];
	/** メタデータ */
	metadata: DocumentMetadata;
}

/**
 * Oramaのスキーマ定義
 * ベクトルの次元数はデフォルト1536次元（モデルによって異なる場合は動的に設定）
 * 注意: metadataは検索対象ではないため、スキーマから除外し、ドキュメントに直接含める
 */
export function createOramaSchema(vectorDimensions: number = 1536): AnySchema {
	return {
		filePath: 'string',
		title: 'string',
		content: 'string',
		vector: `vector[${vectorDimensions}]` as `vector[${number}]`,
	} as AnySchema;
}

/**
 * デフォルトのベクトル次元数
 */
export const DEFAULT_VECTOR_DIMENSIONS = 1536;

