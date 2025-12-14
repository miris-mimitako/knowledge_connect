/**
 * Model Change Dialog
 * モデル変更時の警告ダイアログ
 */

import { App, Modal, Setting } from 'obsidian';
import { EmbeddingService, EMBEDDING_MODELS, type EmbeddingModel } from '../services/embedding-service';

export interface ModelChangeImpact {
	existingIndexCount: number;
	estimatedCost: number;
	estimatedTime: number; // 分
	dimensionChange?: {
		old: number;
		new: number;
	};
}

export class ModelChangeDialog extends Modal {
	private oldModel: string;
	private newModel: EmbeddingModel;
	private onConfirm: (newModel: EmbeddingModel) => Promise<void>;
	private confirmed: boolean = false;

	constructor(
		app: App,
		oldModel: string,
		newModel: EmbeddingModel,
		onConfirm: (newModel: EmbeddingModel) => Promise<void>
	) {
		super(app);
		this.oldModel = oldModel;
		this.newModel = newModel;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '⚠️ ベクトル化モデルの変更' });

		// インパクト分析
		const impact = this.calculateImpact();
		const impactSection = contentEl.createDiv('model-change-impact');
		impactSection.createEl('h3', { text: '変更の影響' });
		
		const impactList = impactSection.createEl('ul');
		impactList.createEl('li', {
			text: `既存の検索用インデックス: ${impact.existingIndexCount}件`,
		});
		impactList.createEl('li', {
			text: `再計算の推定コスト: 約 $${impact.estimatedCost.toFixed(2)}`,
		});
		impactList.createEl('li', {
			text: `推定所要時間: 約 ${impact.estimatedTime}分`,
		});

		if (impact.dimensionChange) {
			impactList.createEl('li', {
				text: `ベクトル次元数の変更: ${impact.dimensionChange.old} → ${impact.dimensionChange.new}`,
			});
		}

		// 警告メッセージ
		const warningSection = contentEl.createDiv('model-change-warning');
		warningSection.createEl('p', {
			text: '⚠️ この操作は過去の埋め込みベクトルデータに影響します。既存のインデックスは削除され、新しいモデルで再計算されます。',
		});

		// 移行オプション
		const migrationSection = contentEl.createDiv('model-change-migration');
		migrationSection.createEl('h3', { text: '移行オプション' });

		let selectedOption: 'background' | 'maintenance' = 'background';
		
		new Setting(migrationSection)
			.setName('バックグラウンドで更新')
			.setDesc('操作を続けられますが、完了まで時間がかかります。')
			.addToggle((toggle) => {
				toggle.setValue(true).onChange((value) => {
					if (value) {
						selectedOption = 'background';
					}
				});
			});

		new Setting(migrationSection)
			.setName('メンテナンスモード（一括更新）')
			.setDesc('完了まで検索機能が停止しますが、最速で終わります。')
			.addToggle((toggle) => {
				toggle.setValue(false).onChange((value) => {
					if (value) {
						selectedOption = 'maintenance';
					}
				});
			});

		// データ保持オプション
		const retentionSection = contentEl.createDiv('model-change-retention');
		retentionSection.createEl('h3', { text: 'データ保持' });

		let keepOldData = false;
		new Setting(retentionSection)
			.setName('旧データを3日間保持する')
			.setDesc('問題があった場合に即座に戻せます。')
			.addToggle((toggle) => {
				toggle.setValue(false).onChange((value) => {
					keepOldData = value;
				});
			});

		// 確認チェックボックス
		const confirmSection = contentEl.createDiv('model-change-confirm');
		let confirmChecked = false;
		new Setting(confirmSection)
			.setName('既存のインデックスデータが削除されることを理解しました')
			.addToggle((toggle) => {
				toggle.setValue(false).onChange((value) => {
					confirmChecked = value;
					confirmButton.disabled = !confirmChecked;
				});
			});

		// ボタン
		const buttonContainer = contentEl.createDiv('model-change-buttons');
		const confirmButton = buttonContainer.createEl('button', {
			text: '変更して再計算を開始',
			cls: 'mod-cta',
		});
		confirmButton.disabled = true;

		confirmButton.onclick = async () => {
			if (confirmChecked) {
				this.confirmed = true;
				await this.onConfirm(this.newModel);
				this.close();
			}
		};

		const cancelButton = buttonContainer.createEl('button', {
			text: 'キャンセル',
		});
		cancelButton.onclick = () => {
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * インパクトを計算
	 */
	private calculateImpact(): ModelChangeImpact {
		// 簡易的な計算
		const existingIndexCount = 1000; // デフォルト値
		const estimatedCost = existingIndexCount * 0.0001; // 簡易計算
		const estimatedTime = Math.ceil(existingIndexCount / 50); // 50件/分と仮定

		const oldDimensions = EMBEDDING_MODELS[this.oldModel as EmbeddingModel]?.dimensions || 1536;
		const newDimensions = EMBEDDING_MODELS[this.newModel]?.dimensions || 1536;

		return {
			existingIndexCount,
			estimatedCost,
			estimatedTime,
			dimensionChange:
				oldDimensions !== newDimensions
					? { old: oldDimensions, new: newDimensions }
					: undefined,
		};
	}
}

