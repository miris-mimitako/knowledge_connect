/**
 * Exclusion List
 * ベクトル化対象から除外するファイル・フォルダの管理
 */

/**
 * デフォルト強制除外リスト
 * 隠しファイル・フォルダ（`.`で始まるもの）を自動的に除外
 */
export const DEFAULT_FORCED_EXCLUSIONS: string[] = [
	'.obsidian',
	'.git',
	'.DS_Store',
	'.vscode',
	'.idea',
	'node_modules',
	'.trash',
];

/**
 * ファイルパスが除外対象かどうかを判定
 * @param filePath ファイルパス
 * @param excludedPaths 除外パスのリスト
 * @param forcedExclusions 強制除外リスト（デフォルト使用）
 * @returns 除外対象の場合true
 */
export function isExcluded(
	filePath: string,
	excludedPaths: string[] = [],
	forcedExclusions: string[] = DEFAULT_FORCED_EXCLUSIONS
): boolean {
	// 強制除外リストをチェック
	for (const exclusion of forcedExclusions) {
		if (filePath.startsWith(exclusion + '/') || filePath === exclusion) {
			return true;
		}
		// パスの一部に含まれるかチェック
		const parts = filePath.split('/');
		if (parts.some((part) => part === exclusion || part.startsWith('.'))) {
			return true;
		}
	}

	// ユーザー指定の除外リストをチェック
	for (const excludedPath of excludedPaths) {
		if (filePath.startsWith(excludedPath + '/') || filePath === excludedPath) {
			return true;
		}
	}

	return false;
}

/**
 * ファイルパスが隠しファイル・フォルダかどうかを判定
 * @param filePath ファイルパス
 * @returns 隠しファイル・フォルダの場合true
 */
export function isHiddenFileOrFolder(filePath: string): boolean {
	const parts = filePath.split('/');
	return parts.some((part) => part.startsWith('.'));
}

