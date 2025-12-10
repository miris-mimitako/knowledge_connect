/**
 * Index Persistence Utility
 * OramaインデックスのファイルI/Oを管理
 * ObsidianのVault APIを使用してバイナリファイルを保存・読み込み
 */

import { Plugin } from 'obsidian';
import { normalizePath } from 'obsidian';

/**
 * プラグインのデータディレクトリパスを取得（Vault相対パス）
 */
export function getPluginDataPath(plugin: Plugin): string {
	// Obsidianのプラグインデータディレクトリ
	// .obsidian/plugins/プラグインID/
	const pluginId = plugin.manifest.id || 'knowledge-connect';
	return normalizePath(`.obsidian/plugins/${pluginId}`);
}

/**
 * インデックスファイルのパスを取得（Vault相対パス）
 */
export function getIndexFilePath(plugin: Plugin): string {
	const dataPath = getPluginDataPath(plugin);
	return normalizePath(`${dataPath}/index-data.bin`);
}

/**
 * インデックスデータをファイルに保存
 * ObsidianのVault APIを使用（バイナリデータはBase64エンコードして保存）
 */
export async function saveIndexToFile(
	plugin: Plugin,
	data: ArrayBuffer
): Promise<void> {
	try {
		const filePath = getIndexFilePath(plugin);
		const dataPath = getPluginDataPath(plugin);

		// ディレクトリが存在しない場合は作成
		const adapter = plugin.app.vault.adapter;
		
		// Node.jsのfs APIを使用（Electron環境では利用可能）
		if (typeof require !== 'undefined' && (adapter as any).basePath) {
			const fs = require('fs');
			const basePath = (adapter as any).basePath;
			const fullDataPath = `${basePath}/${dataPath}`;
			
			if (!fs.existsSync(fullDataPath)) {
				fs.mkdirSync(fullDataPath, { recursive: true });
			}

			// バイナリデータをファイルに書き込み
			const buffer = Buffer.from(data);
			const fullFilePath = `${basePath}/${filePath}`;
			fs.writeFileSync(fullFilePath, buffer);

			console.log(`[IndexPersistence] Index saved to: ${fullFilePath}`);
		} else {
			// モバイル環境など、fs APIが使えない場合はBase64エンコードしてVault内に保存
			const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
			const jsonPath = normalizePath(`${dataPath}/index-data.json`);
			await adapter.write(jsonPath, JSON.stringify({ data: base64, format: 'base64' }));
			console.log(`[IndexPersistence] Index saved to: ${jsonPath} (Base64 encoded)`);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		throw new Error(`Failed to save index to file: ${errorMessage}`);
	}
}

/**
 * インデックスデータをファイルから読み込み
 */
export async function loadIndexFromFile(plugin: Plugin): Promise<ArrayBuffer | null> {
	try {
		const filePath = getIndexFilePath(plugin);
		const adapter = plugin.app.vault.adapter;

		// Node.jsのfs APIを使用（Electron環境では利用可能）
		if (typeof require !== 'undefined' && (adapter as any).basePath) {
			const fs = require('fs');
			const basePath = (adapter as any).basePath;
			const fullFilePath = `${basePath}/${filePath}`;
			
			if (!fs.existsSync(fullFilePath)) {
				console.log(`[IndexPersistence] Index file not found: ${fullFilePath}`);
				return null;
			}

			// ファイルを読み込み
			const buffer = fs.readFileSync(fullFilePath);
			return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
		} else {
			// モバイル環境など、fs APIが使えない場合はBase64デコード
			const jsonPath = normalizePath(`${getPluginDataPath(plugin)}/index-data.json`);
			try {
				const jsonContent = await adapter.read(jsonPath);
				const json = JSON.parse(jsonContent);
				if (json.format === 'base64' && json.data) {
					const binaryString = atob(json.data);
					const bytes = new Uint8Array(binaryString.length);
					for (let i = 0; i < binaryString.length; i++) {
						bytes[i] = binaryString.charCodeAt(i);
					}
					return bytes.buffer;
				}
				return null;
			} catch {
				// ファイルが存在しない場合はnullを返す
				return null;
			}
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[IndexPersistence] Failed to load index from file: ${errorMessage}`);
		return null;
	}
}

/**
 * インデックスファイルが存在するか確認
 */
export async function indexFileExists(plugin: Plugin): Promise<boolean> {
	try {
		const filePath = getIndexFilePath(plugin);
		const adapter = plugin.app.vault.adapter;

		if (typeof require !== 'undefined' && (adapter as any).basePath) {
			const fs = require('fs');
			const basePath = (adapter as any).basePath;
			const fullFilePath = `${basePath}/${filePath}`;
			return fs.existsSync(fullFilePath);
		} else {
			const jsonPath = normalizePath(`${getPluginDataPath(plugin)}/index-data.json`);
			return await adapter.exists(jsonPath);
		}
	} catch {
		return false;
	}
}

/**
 * インデックスファイルを削除
 */
export async function deleteIndexFile(plugin: Plugin): Promise<void> {
	try {
		const filePath = getIndexFilePath(plugin);
		const adapter = plugin.app.vault.adapter;

		if (typeof require !== 'undefined' && (adapter as any).basePath) {
			const fs = require('fs');
			const basePath = (adapter as any).basePath;
			const fullFilePath = `${basePath}/${filePath}`;
			if (fs.existsSync(fullFilePath)) {
				fs.unlinkSync(fullFilePath);
				console.log(`[IndexPersistence] Index file deleted: ${fullFilePath}`);
			}
		} else {
			const jsonPath = normalizePath(`${getPluginDataPath(plugin)}/index-data.json`);
			if (await adapter.exists(jsonPath)) {
				await adapter.remove(jsonPath);
				console.log(`[IndexPersistence] Index file deleted: ${jsonPath}`);
			}
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		throw new Error(`Failed to delete index file: ${errorMessage}`);
	}
}

