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
import { MCP_SEARCH_VIEW_TYPE } from "../views/mcp-search-view";
import { showError, showSuccess, showInfo } from "../utils/error-handler";
import { MCPService } from "../services/mcp-service";

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

	// MCPサーバーのヘルスチェック
	plugin.addCommand({
		id: "mcp-check-health",
		name: "MCPサーバーの状態を確認",
		callback: async () => {
			const baseUrl = plugin.settings.mcpServerUrl || 'http://127.0.0.1:8000';
			const mcpService = new MCPService(baseUrl);
			try {
				const health = await mcpService.checkHealth();
				if (health.healthy) {
					showSuccess(
						`MCPサーバーは正常に動作しています: ${health.status}`,
						plugin.settings.notificationSettings
					);
				} else {
					showError(
						`MCPサーバーに接続できません: ${health.status}`,
						plugin.settings.notificationSettings
					);
				}
			} catch (error) {
				showError(
					error instanceof Error ? error.message : "MCPサーバーに接続できません",
					plugin.settings.notificationSettings
				);
			}
		},
	});

	// MCPサーバーのHello Worldを呼び出す
	plugin.addCommand({
		id: "mcp-hello-world",
		name: "MCPサーバー Hello World",
		callback: async () => {
			const baseUrl = plugin.settings.mcpServerUrl || 'http://127.0.0.1:8000';
			const mcpService = new MCPService(baseUrl);
			try {
				const result = await mcpService.getHelloWorld();
				const message = `${result.message} (v${result.version}) - ${result.status}`;
				showSuccess(message, plugin.settings.notificationSettings);
				console.log("[MCP] Hello World response:", result);
			} catch (error) {
				showError(
					error instanceof Error ? error.message : "MCPサーバーへのリクエストが失敗しました",
					plugin.settings.notificationSettings
				);
			}
		},
	});

	// インデックス作成
	plugin.addCommand({
		id: "mcp-create-index",
		name: "MCP: インデックスを作成",
		callback: async () => {
			const baseUrl = plugin.settings.mcpServerUrl || 'http://127.0.0.1:8000';
			const mcpService = new MCPService(baseUrl);
			try {
				// バルトのパスを取得
				const vaultPath = plugin.app.vault.adapter.basePath;
				if (!vaultPath) {
					showError("バルトのパスを取得できませんでした", plugin.settings.notificationSettings);
					return;
				}

				showInfo("インデックス作成を開始しています...", plugin.settings.notificationSettings);
				const result = await mcpService.createIndex(vaultPath, false);
				showSuccess(
					`インデックス作成を開始しました（ジョブID: ${result.job_id}）`,
					plugin.settings.notificationSettings
				);
				console.log("[MCP] Index creation started:", result);

				// 進捗を監視（非同期、バックグラウンドで実行）
				monitorJobProgress(plugin, mcpService, result.job_id);
			} catch (error) {
				showError(
					error instanceof Error ? error.message : "インデックス作成に失敗しました",
					plugin.settings.notificationSettings
				);
			}
		},
	});

	// MCP検索Viewを開く
	plugin.addCommand({
		id: "open-mcp-search-view",
		name: "MCP検索を開く",
		callback: () => {
			const existing = plugin.app.workspace.getLeavesOfType(MCP_SEARCH_VIEW_TYPE);
			if (existing.length > 0) {
				plugin.app.workspace.revealLeaf(existing[0]);
			} else {
				const leaf = plugin.app.workspace.getRightLeaf(false);
				if (leaf) {
					leaf.setViewState({
						type: MCP_SEARCH_VIEW_TYPE,
						active: true,
					});
				}
			}
		},
	});

	// 全文検索（Viewを開いてから検索）
	plugin.addCommand({
		id: "mcp-search-documents",
		name: "MCP: ドキュメントを検索",
		callback: async () => {
			// まずViewを開く
			const existing = plugin.app.workspace.getLeavesOfType(MCP_SEARCH_VIEW_TYPE);
			let leaf;
			if (existing.length > 0) {
				leaf = existing[0];
				plugin.app.workspace.revealLeaf(leaf);
			} else {
				leaf = plugin.app.workspace.getRightLeaf(false);
				if (leaf) {
					await leaf.setViewState({
						type: MCP_SEARCH_VIEW_TYPE,
						active: true,
					});
					// Viewが開かれるまで少し待機
					await new Promise(resolve => setTimeout(resolve, 300));
				}
			}
		},
	});

	// 統計情報を取得
	plugin.addCommand({
		id: "mcp-get-stats",
		name: "MCP: 検索統計情報を表示",
		callback: async () => {
			const baseUrl = plugin.settings.mcpServerUrl || 'http://127.0.0.1:8000';
			const mcpService = new MCPService(baseUrl);
			try {
				const stats = await mcpService.getSearchStats();
				const message = `インデックス済みドキュメント: ${stats.total_documents}件`;
				showSuccess(message, plugin.settings.notificationSettings);
				console.log("[MCP] Search stats:", stats);
			} catch (error) {
				showError(
					error instanceof Error ? error.message : "統計情報の取得に失敗しました",
					plugin.settings.notificationSettings
				);
			}
		},
	});

	// ジョブ一覧を表示
	plugin.addCommand({
		id: "mcp-list-jobs",
		name: "MCP: ジョブ一覧を表示",
		callback: async () => {
			const baseUrl = plugin.settings.mcpServerUrl || 'http://127.0.0.1:8000';
			const mcpService = new MCPService(baseUrl);
			try {
				const jobs = await mcpService.getJobs(undefined, 20);
				console.log("[MCP] Jobs:", jobs);

				if (jobs.length === 0) {
					showInfo("実行中のジョブはありません", plugin.settings.notificationSettings);
					return;
				}

				// ジョブ情報をコンソールに出力（将来的にはモーダルで表示可能）
				const jobInfo = jobs
					.map(
						(job) =>
							`ジョブID: ${job.id}, タイプ: ${job.job_type}, ステータス: ${job.status}, 進捗: ${job.progress.current}/${job.progress.total}`
					)
					.join("\n");
				console.log("[MCP] Job list:\n" + jobInfo);

				showSuccess(
					`${jobs.length}件のジョブが見つかりました（詳細はコンソールを確認）`,
					plugin.settings.notificationSettings
				);
			} catch (error) {
				showError(
					error instanceof Error ? error.message : "ジョブ一覧の取得に失敗しました",
					plugin.settings.notificationSettings
				);
			}
		},
	});
}

/**
 * ジョブの進捗を監視（非同期、バックグラウンドで実行）
 */
async function monitorJobProgress(
	plugin: any,
	mcpService: MCPService,
	jobId: number
): Promise<void> {
	const checkInterval = setInterval(async () => {
		try {
			const job = await mcpService.getJobStatus(jobId);
			const progress = job.progress;

			if (job.status === "completed") {
				clearInterval(checkInterval);
				showSuccess(
					`インデックス作成が完了しました（${progress.total}ファイル）`,
					plugin.settings.notificationSettings
				);
			} else if (job.status === "failed") {
				clearInterval(checkInterval);
				showError(
					`インデックス作成が失敗しました: ${job.error_message || "不明なエラー"}`,
					plugin.settings.notificationSettings
				);
			} else if (job.status === "cancelled") {
				clearInterval(checkInterval);
				showInfo("インデックス作成がキャンセルされました", plugin.settings.notificationSettings);
			} else if (job.status === "processing") {
				console.log(
					`[MCP] Job ${jobId} progress: ${progress.current}/${progress.total} (${progress.percentage}%) - ${progress.message}`
				);
			}
		} catch (error) {
			console.error("[MCP] Job progress check error:", error);
			// エラーが発生しても監視を続行（サーバーが一時的に応答しない可能性があるため）
		}
	}, 2000); // 2秒ごとに確認

	// 10分後にタイムアウト（監視を停止）
	setTimeout(() => {
		clearInterval(checkInterval);
	}, 600000);
}

