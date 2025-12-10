/**
 * Cache Manager
 * キャッシュ戦略の実装（mtimeハッシュによる変更検知）
 */

import { TFile } from 'obsidian';

/**
 * ファイルのキャッシュ情報
 */
export interface FileCacheInfo {
	filePath: string;
	mtime: number;
	hash: string; // mtimeベースのハッシュ
}

/**
 * キャッシュマネージャー
 */
export class CacheManager {
	private cache: Map<string, FileCacheInfo> = new Map();

	/**
	 * ファイルのハッシュを計算（mtimeベース）
	 */
	private calculateHash(file: TFile): string {
		// mtimeとファイルサイズからハッシュを生成
		return `${file.stat.mtime}-${file.stat.size}`;
	}

	/**
	 * ファイルが変更されているか確認
	 */
	isFileChanged(file: TFile): boolean {
		const cached = this.cache.get(file.path);
		if (!cached) {
			return true; // キャッシュにない場合は変更ありとみなす
		}

		const currentHash = this.calculateHash(file);
		return cached.hash !== currentHash;
	}

	/**
	 * ファイルのキャッシュを更新
	 */
	updateCache(file: TFile): void {
		const hash = this.calculateHash(file);
		this.cache.set(file.path, {
			filePath: file.path,
			mtime: file.stat.mtime,
			hash,
		});
	}

	/**
	 * ファイルのキャッシュを削除
	 */
	removeCache(filePath: string): void {
		this.cache.delete(filePath);
	}

	/**
	 * キャッシュをクリア
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * キャッシュ情報を取得
	 */
	getCache(filePath: string): FileCacheInfo | undefined {
		return this.cache.get(filePath);
	}
}

