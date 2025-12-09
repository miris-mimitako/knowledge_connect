/**
 * Save Dialog
 * ファイル保存先選択ダイアログ
 */

import { App, Modal, Setting, TFolder } from "obsidian";
import { showError } from "./error-handler";

export interface SaveDialogResult {
	folder: string;
	fileName: string;
	cancelled: boolean;
}

export class SaveDialog extends Modal {
	result: SaveDialogResult = {
		folder: "",
		fileName: "",
		cancelled: true,
	};
	onSubmit: (result: SaveDialogResult) => void;

	constructor(
		app: App,
		defaultFolder: string,
		defaultFileName: string,
		onSubmit: (result: SaveDialogResult) => void
	) {
		super(app);
		this.result.folder = defaultFolder;
		this.result.fileName = defaultFileName;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.empty();
		contentEl.createEl("h2", { text: "ページを保存" });

		// フォルダ選択
		const folderSetting = new Setting(contentEl)
			.setName("保存先フォルダ")
			.setDesc("ファイルを保存するフォルダを指定してください。")
			.addText((text) => {
				text
					.setPlaceholder("例: AI出力/チャット履歴")
					.setValue(this.result.folder)
					.onChange((value) => {
						this.result.folder = value;
					});
			})
			.addButton((button) => {
				button.setButtonText("フォルダを選択").onClick(async () => {
					// Obsidianのフォルダ選択機能を使用
					const folder = await this.selectFolder();
					if (folder !== null) {
						this.result.folder = folder;
						const textComponent = folderSetting.components[0] as any;
						if (textComponent && textComponent.setValue) {
							textComponent.setValue(folder);
						}
					}
				});
			});

		// ファイル名入力
		new Setting(contentEl)
			.setName("ファイル名")
			.setDesc("保存するファイル名を入力してください（拡張子は不要）")
			.addText((text) => {
				text
					.setPlaceholder("例: チャット履歴-2024-01-01")
					.setValue(this.result.fileName)
					.onChange((value) => {
						this.result.fileName = value;
					});
			});

		// ボタン
		new Setting(contentEl).addButton((button) => {
			button
				.setButtonText("保存")
				.setCta()
				.onClick(() => {
					if (!this.result.fileName || this.result.fileName.trim() === "") {
						showError("ファイル名を入力してください。", {
							showSuccess: true,
							showError: true,
							showInfo: false,
						});
						return;
					}
					this.result.cancelled = false;
					this.close();
					this.onSubmit(this.result);
				});
		}).addButton((button) => {
			button.setButtonText("キャンセル").onClick(() => {
				this.close();
			});
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		if (this.result.cancelled) {
			this.onSubmit(this.result);
		}
	}

	private async selectFolder(): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new FolderTreeModal(this.app, (selectedFolder) => {
				resolve(selectedFolder);
			});
			modal.open();
		});
	}
}

/**
 * Folder Tree Node
 * フォルダツリーのノード
 */
interface FolderTreeNode {
	path: string;
	name: string;
	children: FolderTreeNode[];
	expanded: boolean;
	level: number;
}

/**
 * Folder Tree Modal
 * 階層構造でフォルダを表示するモーダル
 */
class FolderTreeModal extends Modal {
	onSelect: (folder: string) => void;
	private treeContainer: HTMLElement;
	private rootNode: FolderTreeNode;
	private originalRootNode: FolderTreeNode;
	private selectedPath: string | null = null;

	constructor(app: App, onSelect: (folder: string) => void) {
		super(app);
		this.onSelect = onSelect;
		this.originalRootNode = this.buildFolderTree();
		this.rootNode = this.originalRootNode;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("folder-tree-modal");

		// タイトル
		contentEl.createEl("h2", { text: "フォルダを選択" });

		// 検索ボックス
		const searchContainer = contentEl.createDiv("folder-tree-search");
		const searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "フォルダを検索...",
			cls: "folder-tree-search-input",
		});
		searchInput.addEventListener("input", (e) => {
			const query = (e.target as HTMLInputElement).value.toLowerCase();
			this.filterTree(query);
		});

		// ツリーコンテナ
		this.treeContainer = contentEl.createDiv("folder-tree-container");
		this.renderTree();

		// ボタン
		const buttonContainer = contentEl.createDiv("folder-tree-buttons");
		const selectButton = buttonContainer.createEl("button", {
			text: "選択",
			cls: "mod-cta",
		});
		selectButton.onclick = () => {
			if (this.selectedPath !== null) {
				this.onSelect(this.selectedPath);
				this.close();
			}
		};

		const cancelButton = buttonContainer.createEl("button", {
			text: "キャンセル",
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
	 * フォルダツリーを構築
	 */
	private buildFolderTree(): FolderTreeNode {
		const folders = this.app.vault.getAllFolders();
		const root: FolderTreeNode = {
			path: "",
			name: "ルートフォルダ",
			children: [],
			expanded: true,
			level: 0,
		};

		// フォルダパスを階層構造に変換
		const pathMap = new Map<string, FolderTreeNode>();
		pathMap.set("", root);

		// すべてのフォルダをソート
		const sortedFolders = Array.from(folders)
			.map((f) => f.path)
			.filter((path) => path)
			.sort();

		// 各フォルダパスを処理
		for (const folderPath of sortedFolders) {
			const parts = folderPath.split("/").filter((p) => p);
			let currentPath = "";

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				const parentPath = currentPath;
				currentPath = currentPath ? `${currentPath}/${part}` : part;

				if (!pathMap.has(currentPath)) {
					const node: FolderTreeNode = {
						path: currentPath,
						name: part,
						children: [],
						expanded: false,
						level: i + 1,
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
		return root;
	}

	/**
	 * ノードとその子ノードをソート
	 */
	private sortNode(node: FolderTreeNode): void {
		node.children.sort((a, b) => a.name.localeCompare(b.name));
		node.children.forEach((child) => this.sortNode(child));
	}

	/**
	 * ツリーをレンダリング
	 */
	private renderTree(): void {
		this.treeContainer.empty();
		this.renderNode(this.rootNode, this.treeContainer);
	}

	/**
	 * ノードをレンダリング
	 */
	private renderNode(node: FolderTreeNode, container: HTMLElement): void {
		const nodeEl = container.createDiv("folder-tree-node");
		nodeEl.style.paddingLeft = `${node.level * 20}px`;

		// ノードの内容
		const nodeContent = nodeEl.createDiv("folder-tree-node-content");
		if (node.children.length > 0) {
			const expandIcon = nodeContent.createSpan("folder-tree-expand-icon");
			expandIcon.textContent = node.expanded ? "▼" : "▶";
			expandIcon.onclick = (e) => {
				e.stopPropagation();
				node.expanded = !node.expanded;
				this.renderTree();
			};
		} else {
			const spacer = nodeContent.createSpan("folder-tree-expand-icon");
			spacer.textContent = "  ";
		}

		const folderIcon = nodeContent.createSpan("folder-tree-icon");
		folderIcon.textContent = "📁";

		const nodeName = nodeContent.createSpan("folder-tree-name");
		nodeName.textContent = node.name;

		// 選択状態のスタイル
		if (this.selectedPath === node.path) {
			nodeContent.addClass("is-selected");
		}

		// クリックで選択
		nodeContent.onclick = () => {
			this.selectedPath = node.path;
			this.renderTree();
		};

		// 子ノードをレンダリング（展開されている場合）
		if (node.expanded && node.children.length > 0) {
			const childrenContainer = nodeEl.createDiv("folder-tree-children");
			node.children.forEach((child) => {
				this.renderNode(child, childrenContainer);
			});
		}
	}

	/**
	 * ツリーをフィルタリング
	 */
	private filterTree(query: string): void {
		if (!query) {
			// 元のツリーを復元
			this.rootNode = this.deepCopyNode(this.originalRootNode);
			this.renderTree();
			return;
		}

		const filteredRoot: FolderTreeNode = {
			path: "",
			name: "ルートフォルダ",
			children: [],
			expanded: true,
			level: 0,
		};

		const filterNode = (node: FolderTreeNode): FolderTreeNode | null => {
			const matches = node.name.toLowerCase().includes(query);
			const filteredChildren: FolderTreeNode[] = [];

			// 子ノードを再帰的にフィルタリング
			for (const child of node.children) {
				const filteredChild = filterNode(child);
				if (filteredChild) {
					filteredChildren.push(filteredChild);
				}
			}

			// 自分自身がマッチするか、子ノードがマッチする場合
			if (matches || filteredChildren.length > 0) {
				return {
					...node,
					children: filteredChildren,
					expanded: true, // フィルタリング時は展開
				};
			}

			return null;
		};

		// ルートノードの子ノードをフィルタリング
		for (const child of this.originalRootNode.children) {
			const filteredChild = filterNode(child);
			if (filteredChild) {
				filteredRoot.children.push(filteredChild);
			}
		}

		this.rootNode = filteredRoot;
		this.renderTree();
	}

	/**
	 * ノードをディープコピー
	 */
	private deepCopyNode(node: FolderTreeNode): FolderTreeNode {
		return {
			...node,
			children: node.children.map((child) => this.deepCopyNode(child)),
		};
	}
}

