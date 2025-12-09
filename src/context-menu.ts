/**
 * Context Menu
 * コンテキストメニューからのAI問い合わせ機能
 */

import { Editor, MarkdownView, Menu } from "obsidian";
import KnowledgeConnectPlugin from "./main";
import { SUMMARY_VIEW_TYPE, SummaryView } from "./views/summary-view";
import { showError } from "./utils/error-handler";

export function registerContextMenu(plugin: KnowledgeConnectPlugin) {
	plugin.registerEvent(
		plugin.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, view: MarkdownView) => {
			if (!plugin.settings.enableContextMenu) {
				return;
			}

			const selectedText = editor.getSelection();
			if (!selectedText || selectedText.trim().length === 0) {
				return;
			}

			// AI問い合わせメニューを追加
			menu.addItem((item) => {
				item.setTitle("AIに問い合わせる")
					.setIcon("sparkles")
					.setSection("knowledge-connect");

				// 説明する
				item.setTitle("この内容について説明する")
					.setIcon("help-circle")
					.onClick(async () => {
						await handleContextQuery(
							plugin,
							selectedText,
							"説明",
							"以下の内容について、わかりやすく説明してください："
						);
					});
			});

			menu.addItem((item) => {
				// 要約する
				item.setTitle("この内容を要約する")
					.setIcon("file-text")
					.setSection("knowledge-connect")
					.onClick(async () => {
						await handleContextQuery(
							plugin,
							selectedText,
							"要約",
							"以下の内容を要約してください："
						);
					});
			});

			menu.addItem((item) => {
				// 質問する
				item.setTitle("この内容について質問する")
					.setIcon("message-circle")
					.setSection("knowledge-connect")
					.onClick(async () => {
						await handleContextQuery(
							plugin,
							selectedText,
							"質問",
							"以下の内容について、関連する質問と回答を提供してください："
						);
					});
			});

			menu.addItem((item) => {
				// 翻訳する（オプション）
				item.setTitle("この内容を英語に翻訳する")
					.setIcon("languages")
					.setSection("knowledge-connect")
					.onClick(async () => {
						await handleContextQuery(
							plugin,
							selectedText,
							"翻訳",
							"以下の内容を英語に翻訳してください："
						);
					});
			});

			menu.addItem((item) => {
				// 改善する（オプション）
				item.setTitle("この内容を改善する")
					.setIcon("wand-2")
					.setSection("knowledge-connect")
					.onClick(async () => {
						await handleContextQuery(
							plugin,
							selectedText,
							"改善",
							"以下の内容を改善してください。より明確で読みやすく、適切な表現に修正してください："
						);
					});
			});
		})
	);
}

async function handleContextQuery(
	plugin: KnowledgeConnectPlugin,
	selectedText: string,
	queryType: string,
	promptPrefix: string
) {
	const aiService = plugin.getAIService();
	if (!aiService) {
		showError(
			"APIキーが設定されていません。設定画面でAPIキーを設定してください。",
			plugin.settings.notificationSettings
		);
		return;
	}

	try {
		// 要約Viewを開く（結果表示用）
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

		// AIに問い合わせ
		const prompt = `${promptPrefix}\n\n${selectedText}`;
		const response = await aiService.chatCompletion({
			messages: [
				{
					role: "system",
					content: `あなたは優秀なアシスタントです。ユーザーの要求に応じて適切な回答を提供してください。`,
				},
				{
					role: "user",
					content: prompt,
				},
			],
			maxTokens: plugin.settings.maxTokens,
		});

		// 結果を要約Viewに表示
		const summaryView = summaryLeaf.view as SummaryView;
		if (summaryView) {
			summaryView.summaryText = response.content;
			summaryView.renderSummary();
		}
	} catch (error) {
		showError(error, plugin.settings.notificationSettings);
	}
}

