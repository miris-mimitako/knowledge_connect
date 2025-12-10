/**
 * Directory Selector Modal
 * ディレクトリ指定UI（チェックボックス付きツリービュー）
 */

import { App, Modal, Setting } from 'obsidian';
import { TFolder } from 'obsidian';

export type DirectoryStatus = 'included' | 'excluded' | 'inherited';

interface DirectoryNode {
	path: string;
	name: string;
	status: DirectoryStatus;
	children: DirectoryNode[];
	expanded: boolean;
}

export class DirectorySelectorModal extends Modal {
	private excludedFolders: string[];
	private onConfirm: (excludedFolders: string[]) => void;
	private treeRoot: DirectoryNode | null = null;

	constructor(
		app: App,
		excludedFolders: string[],
		onConfirm: (excludedFolders: string[]) => void
	) {
		super(app);
		this.excludedFolders = [...excludedFolders];
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'ベクトル化対象ディレクトリの設定' });

		// 説明文
		contentEl.createEl('p', {
			text: 'ベクトル化から除外するフォルダを選択してください。初期設定は全域（すべてのフォルダ）が対象です。',
		});

		// 警告メッセージ
		const warningEl = contentEl.createDiv('directory-selector-warning');
		warningEl.createEl('p', {
			text: '⚠️ 注意: 除外したフォルダ内のファイルは検索結果に表示されません。',
		});

		// ツリービュー
		const treeContainer = contentEl.createDiv('directory-selector-tree');
		this.buildTree();
		this.renderTree(treeContainer);

		// ボタン
		const buttonContainer = contentEl.createDiv('directory-selector-buttons');
		const confirmButton = buttonContainer.createEl('button', {
			text: '保存',
			cls: 'mod-cta',
		});
		confirmButton.onclick = () => {
			this.onConfirm(this.excludedFolders);
			this.close();
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
	 * ディレクトリツリーを構築
	 */
	private buildTree(): void {
		const folders = this.app.vault.getAllFolders();
		const root: DirectoryNode = {
			path: '',
			name: 'ルート',
			status: this.excludedFolders.length === 0 ? 'included' : 'inherited',
			children: [],
			expanded: true,
		};

		// フォルダを階層構造に変換
		const pathMap = new Map<string, DirectoryNode>();
		pathMap.set('', root);

		for (const folder of folders) {
			const parts = folder.path.split('/').filter((p) => p);
			let currentPath = '';

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				const parentPath = currentPath;
				currentPath = currentPath ? `${currentPath}/${part}` : part;

				if (!pathMap.has(currentPath)) {
					const node: DirectoryNode = {
						path: currentPath,
						name: part,
						status: this.excludedFolders.includes(currentPath)
							? 'excluded'
							: 'inherited',
						children: [],
						expanded: false,
					};

					const parent = pathMap.get(parentPath);
					if (parent) {
						parent.children.push(node);
						pathMap.set(currentPath, node);
					}
				}
			}
		}

		// 子ノードをソート
		this.sortNode(root);
		this.treeRoot = root;
	}

	/**
	 * ノードとその子ノードをソート
	 */
	private sortNode(node: DirectoryNode): void {
		node.children.sort((a, b) => a.name.localeCompare(b.name));
		for (const child of node.children) {
			this.sortNode(child);
		}
	}

	/**
	 * ツリーをレンダリング
	 */
	private renderTree(container: HTMLElement): void {
		if (!this.treeRoot) return;

		container.empty();
		this.renderNode(container, this.treeRoot, 0);
	}

	/**
	 * ノードをレンダリング
	 */
	private renderNode(container: HTMLElement, node: DirectoryNode, level: number): void {
		const nodeEl = container.createDiv('directory-selector-node');
		nodeEl.style.paddingLeft = `${level * 20}px`;

		// チェックボックス
		const checkbox = nodeEl.createEl('input', {
			type: 'checkbox',
			cls: 'directory-selector-checkbox',
		}) as HTMLInputElement;

		// ステータスに応じてチェックボックスの状態を設定
		if (node.status === 'included') {
			checkbox.checked = true;
			checkbox.indeterminate = false;
		} else if (node.status === 'excluded') {
			checkbox.checked = false;
			checkbox.indeterminate = false;
		} else {
			// inherited
			checkbox.checked = false;
			checkbox.indeterminate = true;
		}

		checkbox.onchange = () => {
			if (checkbox.checked) {
				node.status = 'included';
				// 除外リストから削除
				const index = this.excludedFolders.indexOf(node.path);
				if (index >= 0) {
					this.excludedFolders.splice(index, 1);
				}
			} else {
				node.status = 'excluded';
				// 除外リストに追加
				if (node.path && !this.excludedFolders.includes(node.path)) {
					this.excludedFolders.push(node.path);
				}
			}

			// 子ノードの状態を更新
			this.updateChildrenStatus(node, node.status);
			// 親ノードの状態を更新
			this.updateParentStatus(node);

			// ツリーを再レンダリング
			const { contentEl } = this;
			const treeContainer = contentEl.querySelector('.directory-selector-tree');
			if (treeContainer) {
				this.renderTree(treeContainer as HTMLElement);
			}
		};

		// フォルダ名
		const label = nodeEl.createEl('label', {
			text: node.name,
			cls: 'directory-selector-label',
		});
		label.prepend(checkbox);

		// 展開/折りたたみボタン（子ノードがある場合）
		if (node.children.length > 0) {
			const expandButton = nodeEl.createEl('button', {
				text: node.expanded ? '−' : '+',
				cls: 'directory-selector-expand',
			});
			expandButton.onclick = () => {
				node.expanded = !node.expanded;
				const treeContainer = this.contentEl.querySelector('.directory-selector-tree');
				if (treeContainer) {
					this.renderTree(treeContainer as HTMLElement);
				}
			};
		}

		// 子ノードをレンダリング（展開されている場合）
		if (node.expanded && node.children.length > 0) {
			const childrenContainer = container.createDiv('directory-selector-children');
			for (const child of node.children) {
				this.renderNode(childrenContainer, child, level + 1);
			}
		}
	}

	/**
	 * 子ノードの状態を更新
	 */
	private updateChildrenStatus(node: DirectoryNode, status: DirectoryStatus): void {
		for (const child of node.children) {
			if (status === 'included' || status === 'excluded') {
				child.status = status;
				// 除外リストを更新
				if (status === 'excluded') {
					if (child.path && !this.excludedFolders.includes(child.path)) {
						this.excludedFolders.push(child.path);
					}
				} else {
					const index = this.excludedFolders.indexOf(child.path);
					if (index >= 0) {
						this.excludedFolders.splice(index, 1);
					}
				}
			}
			this.updateChildrenStatus(child, status);
		}
	}

	/**
	 * 親ノードの状態を更新
	 */
	private updateParentStatus(node: DirectoryNode): void {
		// 親ノードを探す
		const findParent = (root: DirectoryNode, target: DirectoryNode): DirectoryNode | null => {
			for (const child of root.children) {
				if (child === target) {
					return root;
				}
				const found = findParent(child, target);
				if (found) {
					return found;
				}
			}
			return null;
		};

		if (!this.treeRoot) return;

		const parent = findParent(this.treeRoot, node);
		if (parent) {
			// すべての子ノードが同じ状態か確認
			const allIncluded = parent.children.every((child) => child.status === 'included');
			const allExcluded = parent.children.every((child) => child.status === 'excluded');

			if (allIncluded) {
				parent.status = 'included';
			} else if (allExcluded) {
				parent.status = 'excluded';
			} else {
				parent.status = 'inherited';
			}

			this.updateParentStatus(parent);
		}
	}
}

