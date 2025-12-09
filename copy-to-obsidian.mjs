/**
 * Copy plugin files to Obsidian vault
 * プラグインのビルド済みファイルをObsidianのプラグインフォルダにコピー
 */

import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const TARGET_DIR = "G:\\マイドライブ\\Obsidian\\MyVault\\MyVault\\.obsidian\\plugins\\knowledge-connect";

const FILES_TO_COPY = [
	"main.js",
	"manifest.json",
	"styles.css",
];

console.log("プラグインファイルをObsidianにコピー中...");

// ターゲットディレクトリが存在しない場合は作成
if (!existsSync(TARGET_DIR)) {
	console.log(`ディレクトリを作成: ${TARGET_DIR}`);
	mkdirSync(TARGET_DIR, { recursive: true });
}

// ファイルをコピー
let copiedCount = 0;
for (const file of FILES_TO_COPY) {
	const sourcePath = join(process.cwd(), file);
	const targetPath = join(TARGET_DIR, file);

	if (!existsSync(sourcePath)) {
		console.warn(`⚠️  ファイルが見つかりません: ${file}`);
		continue;
	}

	try {
		copyFileSync(sourcePath, targetPath);
		console.log(`✅ コピー完了: ${file}`);
		copiedCount++;
	} catch (error) {
		console.error(`❌ コピーエラー (${file}):`, error.message);
	}
}

console.log(`\n完了: ${copiedCount}/${FILES_TO_COPY.length} ファイルをコピーしました。`);
console.log(`ターゲット: ${TARGET_DIR}`);

