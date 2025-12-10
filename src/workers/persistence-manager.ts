/**
 * Persistence Manager
 * Oramaのインデックスデータの永続化を管理
 */

import { persist, restore } from '@orama/plugin-data-persistence';
import type { AnyOrama } from '@orama/orama';

/**
 * インデックスデータをバイナリ形式に変換
 */
export async function serializeIndex(db: AnyOrama): Promise<ArrayBuffer> {
	try {
		// dpack形式でシリアライズ（バイナリ形式、推奨）
		const data = await persist(db, 'dpack', 'browser');
		
		// ArrayBufferに変換
		if (data instanceof ArrayBuffer) {
			return data;
		} else if (data instanceof Buffer) {
			return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
		} else if (typeof data === 'string') {
			// 文字列の場合はUint8Arrayに変換
			const encoder = new TextEncoder();
			return encoder.encode(data).buffer;
		} else {
			throw new Error('Unexpected data type from persist');
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		throw new Error(`Failed to serialize index: ${errorMessage}`);
	}
}

/**
 * バイナリ形式からインデックスデータを復元
 */
export async function deserializeIndex(
	data: ArrayBuffer,
	schema: any,
	vectorDimensions: number = 1536
): Promise<AnyOrama> {
	try {
		// dpack形式でデシリアライズ
		const db = await restore('dpack', data, 'browser');
		return db;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		throw new Error(`Failed to deserialize index: ${errorMessage}`);
	}
}

