/**
 * Commands
 * プラグインのコマンド登録
 */

import { Editor, MarkdownView } from "obsidian";
import KnowledgeConnectPlugin from "../main";
import { CHAT_VIEW_TYPE } from "../views/chat-view";
import { SUMMARY_VIEW_TYPE } from "../views/summary-view";
import { URL_SUMMARY_VIEW_TYPE } from "../views/url-summary-view";
import { RAG_VIEW_TYPE } from "../views/rag-view";
import { showError } from "../utils/error-handler";

export function registerCommands(plugin: KnowledgeConnectPlugin) {
	// チャットViewを開く
	plugin.addCommand({
		id: "open-chat-view",
		name: "AIチャットを開く",
		callback: () => {
			const existing = plugin.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
			if (existing.length > 0) {
				plugin.app.workspace.revealLeaf(existing[0]);
			} else {
				const leaf = plugin.app.workspace.getRightLeaf(false);
				if (leaf) {
					leaf.setViewState({
						type: CHAT_VIEW_TYPE,
						active: true,
					});
				}
			}
		},
	});

	// 要約Viewを開く
	plugin.addCommand({
		id: "open-summary-view",
		name: "AI要約を開く",
		callback: () => {
			const existing = plugin.app.workspace.getLeavesOfType(SUMMARY_VIEW_TYPE);
			if (existing.length > 0) {
				plugin.app.workspace.revealLeaf(existing[0]);
			} else {
				const leaf = plugin.app.workspace.getRightLeaf(false);
				if (leaf) {
					leaf.setViewState({
						type: SUMMARY_VIEW_TYPE,
						active: true,
					});
				}
			}
		},
	});

	// URL要約Viewを開く
	plugin.addCommand({
		id: "open-url-summary-view",
		name: "URL要約を開く",
		callback: () => {
			const existing = plugin.app.workspace.getLeavesOfType(URL_SUMMARY_VIEW_TYPE);
			if (existing.length > 0) {
				plugin.app.workspace.revealLeaf(existing[0]);
			} else {
				const leaf = plugin.app.workspace.getRightLeaf(false);
				if (leaf) {
					leaf.setViewState({
						type: URL_SUMMARY_VIEW_TYPE,
						active: true,
					});
				}
			}
		},
	});

	// RAG Viewを開く
	plugin.addCommand({
		id: "open-rag-view",
		name: "RAG Chatを開く",
		callback: () => {
			const existing = plugin.app.workspace.getLeavesOfType(RAG_VIEW_TYPE);
			if (existing.length > 0) {
				plugin.app.workspace.revealLeaf(existing[0]);
			} else {
				const leaf = plugin.app.workspace.getRightLeaf(false);
				if (leaf) {
					leaf.setViewState({
						type: RAG_VIEW_TYPE,
						active: true,
					});
				}
			}
		},
	});

	// RAGインデックスを更新
	plugin.addCommand({
		id: "update-rag-index",
		name: "RAGインデックスを更新",
		callback: async () => {
			const existing = plugin.app.workspace.getLeavesOfType(RAG_VIEW_TYPE);
			if (existing.length > 0) {
				const ragView = existing[0].view;
				if (ragView && "updateIndex" in ragView) {
					await (ragView as any).updateIndex();
				} else {
					showError(
						"RAG Viewが見つかりませんでした。先にRAG Chatを開いてください。",
						plugin.settings.notificationSettings
					);
				}
			} else {
				// RAG Viewが開いていない場合は、開いてからインデックスを更新
				const leaf = plugin.app.workspace.getRightLeaf(false);
				if (leaf) {
					await leaf.setViewState({
						type: RAG_VIEW_TYPE,
						active: true,
					});
					// Viewが開かれるまで少し待機
					await new Promise(resolve => setTimeout(resolve, 500));
					const ragView = leaf.view;
					if (ragView && "updateIndex" in ragView) {
						await (ragView as any).updateIndex();
					}
				}
			}
		},
	});

	// 選択テキストを要約
	plugin.addCommand({
		id: "summarize-selection",
		name: "選択テキストを要約",
		editorCallback: async (editor: Editor, view: MarkdownView) => {
			const selectedText = editor.getSelection();
			if (!selectedText) {
				showError(
					"テキストを選択してください",
					plugin.settings.notificationSettings
				);
				return;
			}

			// 要約Viewを開く
			const existing = plugin.app.workspace.getLeavesOfType(SUMMARY_VIEW_TYPE);
			let summaryLeaf;
			if (existing.length > 0) {
				summaryLeaf = existing[0];
				plugin.app.workspace.revealLeaf(summaryLeaf);
			} else {
				summaryLeaf = plugin.app.workspace.getRightLeaf(false);
				if (summaryLeaf) {
					await summaryLeaf.setViewState({
						type: SUMMARY_VIEW_TYPE,
						active: true,
					});
				} else {
					return;
				}
			}

			// 要約を実行
			const summaryView = summaryLeaf.view;
			if (summaryView && "summarizeText" in summaryView) {
				await (summaryView as any).summarizeText(
					selectedText,
					plugin.settings.summaryDefaultDetail
				);
			}
		},
	});

	// 現在のファイル全体を要約
	plugin.addCommand({
		id: "summarize-file",
		name: "現在のファイルを要約",
		editorCallback: async (editor: Editor, view: MarkdownView) => {
			const fileContent = editor.getValue();
			if (!fileContent) {
				showError(
					"ファイルが空です",
					plugin.settings.notificationSettings
				);
				return;
			}

			// 要約Viewを開く
			const existing = plugin.app.workspace.getLeavesOfType(SUMMARY_VIEW_TYPE);
			let summaryLeaf;
			if (existing.length > 0) {
				summaryLeaf = existing[0];
				plugin.app.workspace.revealLeaf(summaryLeaf);
			} else {
				summaryLeaf = plugin.app.workspace.getRightLeaf(false);
				if (summaryLeaf) {
					await summaryLeaf.setViewState({
						type: SUMMARY_VIEW_TYPE,
						active: true,
					});
				} else {
					return;
				}
			}

			// 要約を実行
			const summaryView = summaryLeaf.view;
			if (summaryView && "summarizeText" in summaryView) {
				await (summaryView as any).summarizeText(
					fileContent,
					plugin.settings.summaryDefaultDetail
				);
			}
		},
	});
}

