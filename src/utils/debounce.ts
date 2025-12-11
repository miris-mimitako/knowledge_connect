/**
 * Debounce Utility
 * デバウンス処理のユーティリティ
 */

export interface DebounceOptions {
	delay?: number; // 待機時間（ミリ秒、デフォルト3000ms）
}

/**
 * デバウンス処理
 * 最後の呼び出しから指定時間経過後に実行
 */
export class Debouncer {
	private timers: Map<string, NodeJS.Timeout> = new Map();
	private defaultDelay: number;

	constructor(defaultDelay: number = 3000) {
		this.defaultDelay = defaultDelay;
	}

	/**
	 * デバウンス処理を実行
	 * @param key 一意のキー（ファイルパスなど）
	 * @param callback 実行するコールバック関数
	 * @param options オプション
	 */
	debounce(
		key: string,
		callback: () => void | Promise<void>,
		options?: DebounceOptions
	): void {
		// 既存のタイマーをクリア
		const existingTimer = this.timers.get(key);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// 新しいタイマーを設定
		const delay = options?.delay ?? this.defaultDelay;
		const timer = setTimeout(async () => {
			try {
				await callback();
			} catch (error) {
				console.error(`[Debouncer] Error in debounced callback for key "${key}":`, error);
			} finally {
				// タイマーを削除
				this.timers.delete(key);
			}
		}, delay);

		this.timers.set(key, timer);
	}

	/**
	 * 指定キーのデバウンス処理をキャンセル
	 */
	cancel(key: string): void {
		const timer = this.timers.get(key);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(key);
		}
	}

	/**
	 * すべてのデバウンス処理をキャンセル
	 */
	cancelAll(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
	}

	/**
	 * 指定キーのデバウンス処理が待機中かどうか
	 */
	isPending(key: string): boolean {
		return this.timers.has(key);
	}
}

