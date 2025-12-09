/**
 * Commands
 * プラグインのコマンド登録
 */

import { Editor, MarkdownView } from "obsidian";
import KnowledgeConnectPlugin from "../main";
import { CHAT_VIEW_TYPE } from "../views/chat-view";
import { SUMMARY_VIEW_TYPE } from "../views/summary-view";
import { SEARCH_VIEW_TYPE } from "../views/search-view";
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

	// 検索Viewを開く
	plugin.addCommand({
		id: "open-search-view",
		name: "AI検索を開く",
		callback: () => {
			const existing = plugin.app.workspace.getLeavesOfType(SEARCH_VIEW_TYPE);
			if (existing.length > 0) {
				plugin.app.workspace.revealLeaf(existing[0]);
			} else {
				const leaf = plugin.app.workspace.getRightLeaf(false);
				if (leaf) {
					leaf.setViewState({
						type: SEARCH_VIEW_TYPE,
						active: true,
					});
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

