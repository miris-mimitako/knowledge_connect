/**
 * Text Processor
 * テキスト処理ユーティリティ
 * Markdownからテキストを抽出、フロントマターを除去など
 */

/**
 * Markdownのフロントマターを除去
 */
export function removeFrontMatter(content: string): string {
	// フロントマターのパターン: --- で囲まれたブロック
	const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
	return content.replace(frontMatterRegex, '');
}

/**
 * Markdownからテキストを抽出（簡易版）
 * リンク、画像、コードブロックなどを処理
 */
export function extractTextFromMarkdown(content: string): string {
	let text = content;

	// フロントマターを除去
	text = removeFrontMatter(text);

	// コードブロックを除去
	text = text.replace(/```[\s\S]*?```/g, '');

	// インラインコードを除去
	text = text.replace(/`[^`]+`/g, '');

	// 画像を除去
	text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

	// リンクのテキストのみを抽出 [text](url) -> text
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
 * テキストをチャンクに分割（将来的な拡張用）
 * 現在は全文を1チャンクとして扱う
 */
export function chunkText(text: string, maxChunkSize: number = 8000): string[] {
	// 簡易実装: 全文を1チャンクとして返す
	// 将来的には、意味のある単位（段落、セクション）で分割する
	if (text.length <= maxChunkSize) {
		return [text];
	}

	// 長いテキストの場合は段落で分割
	const paragraphs = text.split(/\n\n+/);
	const chunks: string[] = [];
	let currentChunk = '';

	for (const paragraph of paragraphs) {
		if (currentChunk.length + paragraph.length + 2 <= maxChunkSize) {
			currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
		} else {
			if (currentChunk) {
				chunks.push(currentChunk);
			}
			currentChunk = paragraph;
		}
	}

	if (currentChunk) {
		chunks.push(currentChunk);
	}

	return chunks;
}

/**
 * ファイル名からタイトルを抽出
 */
export function extractTitleFromFileName(fileName: string): string {
	// 拡張子を除去
	const nameWithoutExt = fileName.replace(/\.[^.]*$/, '');
	// アンダースコアやハイフンをスペースに変換
	return nameWithoutExt.replace(/[_-]/g, ' ').trim();
}

/**
 * Intl.Segmenterを使用した日本語単語分割
 * @param text 分割するテキスト
 * @returns 分割された単語の配列
 */
export function segmentJapanese(text: string): string[] {
	// Intl.Segmenterが利用可能か確認（型定義がない場合を考慮）
	const IntlWithSegmenter = Intl as any;
	if (typeof Intl !== 'undefined' && IntlWithSegmenter.Segmenter) {
		try {
			const Segmenter = IntlWithSegmenter.Segmenter;
			const segmenter = new Segmenter('ja-JP', { granularity: 'word' });
			const segments = segmenter.segment(text);
			const words: string[] = [];

			for (const { segment, isWordLike } of segments) {
				if (isWordLike && segment.trim().length > 0) {
					words.push(segment.trim());
				}
			}

			return words;
		} catch (error) {
			console.warn('[TextProcessor] Intl.Segmenter failed, falling back to simple split:', error);
			// フォールバック: スペースや句読点で分割
			return text.split(/[\s、。，．]+/).filter((word) => word.trim().length > 0);
		}
	} else {
		// Intl.Segmenterが利用できない場合のフォールバック
		console.warn('[TextProcessor] Intl.Segmenter not available, using simple split');
		return text.split(/[\s、。，．]+/).filter((word) => word.trim().length > 0);
	}
}

/**
 * テキストをトークン化（日本語と英語の両方に対応）
 * @param text トークン化するテキスト
 * @returns トークンの配列
 */
export function tokenizeText(text: string): string[] {
	// 日本語と英語が混在する場合を考慮
	const tokens: string[] = [];
	
	// まず日本語を分割
	const japaneseWords = segmentJapanese(text);
	
	// 各単語をさらに処理（英語の場合はスペースで分割）
	for (const word of japaneseWords) {
		// 英語部分を抽出してスペースで分割
		const englishParts = word.split(/\s+/);
		tokens.push(...englishParts.filter((part) => part.trim().length > 0));
	}

	return tokens;
}

