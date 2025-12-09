ご提示いただいたObsidianサンプルプラグインのREADMEの日本語訳です。開発者向けのドキュメントとして自然な表現になるよう翻訳しています。

-----

# Obsidian サンプルプラグイン

これは [Obsidian](https://obsidian.md) 用のサンプルプラグインです。

このプロジェクトでは、型チェックとドキュメント化のために TypeScript を使用しています。
このリポジトリは、最新のプラグインAPI（`obsidian.d.ts`）に依存しています。これは TypeScript 定義形式であり、機能内容を説明する TSDoc コメントが含まれています。

このサンプルプラグインは、プラグインAPIで何ができるかの基本的な機能を実演しています。

  - クリックすると通知（Notice）を表示するリボンアイコンを追加します。
  - モーダル（Modal）を開くコマンド「Open Sample Modal」を追加します。
  - 設定ページにプラグイン設定タブを追加します。
  - グローバルなクリックイベントを登録し、コンソールに 'click' を出力します。
  - グローバルなインターバル（定期実行）を登録し、コンソールに 'setInterval' をログ出力します。

## 初めてプラグインを開発しますか？

新規プラグイン開発者のためのクイックスタートガイド：

  - [あなたが欲しいプラグインを既に誰かが開発していないか確認してください](https://obsidian.md/plugins)！ 共同開発できるくらい似ている既存プラグインがあるかもしれません。
  - 「Use this template」ボタンを使って、このリポジトリをテンプレートとして自分のコピーを作成してください（ボタンが見当たらない場合はGitHubにログインしてください）。
  - そのリポジトリをローカルの開発フォルダにクローンします。利便性のため、`.obsidian/plugins/あなたのプラグイン名` フォルダに配置することをお勧めします。
  - NodeJS をインストールし、リポジトリフォルダ配下のコマンドラインで `npm i` を実行します。
  - `npm run dev` を実行して、プラグインを `main.ts` から `main.js` にコンパイルします。
  - `main.ts` に変更を加えます（または新しい `.ts` ファイルを作成します）。これらの変更は自動的に `main.js` にコンパイルされます。
  - Obsidian を再読み込みして、新バージョンのプラグインをロードします。
  - 設定ウィンドウでプラグインを有効にします。
  - Obsidian API を更新するには、リポジトリフォルダ配下のコマンドラインで `npm update` を実行します。

## 新しいバージョンのリリース

  - `manifest.json` を更新して、新しいバージョン番号（例: `1.0.1`）と、その最新リリースに必要な Obsidian の最小バージョンを記載します。
  - `versions.json` ファイルを `"新しいプラグインバージョン": "最小Obsidianバージョン"` という形式で更新します。これにより、古いバージョンの Obsidian でも互換性のある古いバージョンのプラグインをダウンロードできるようになります。
  - 新しいバージョン番号を「タグバージョン（Tag version）」として使用し、新しい GitHub リリースを作成します。正確なバージョン番号を使用し、接頭辞の `v` は含めないでください。例はこちらを参照: [https://github.com/obsidianmd/obsidian-sample-plugin/releases](https://github.com/obsidianmd/obsidian-sample-plugin/releases)
  - `manifest.json`、`main.js`、`styles.css` の各ファイルをバイナリアタッチメント（添付ファイル）としてアップロードします。注意: `manifest.json` ファイルは2箇所（リポジトリのルートパスと、リリース内の添付ファイル）に存在する必要があります。
  - リリースを公開（Publish）します。

> `manifest.json` 内の `minAppVersion` を手動で更新した後、`npm version patch`、`npm version minor`、または `npm version major` を実行することで、バージョンアップ作業を簡略化できます。
> このコマンドは、`manifest.json` と `package.json` のバージョンを上げ、さらに `versions.json` に新バージョンのエントリを追加します。

## コミュニティプラグインリストへの追加

  - [プラグインのガイドライン](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)を確認してください。
  - 初期バージョンを公開してください。
  - リポジトリのルートに `README.md` ファイルがあることを確認してください。
  - [https://github.com/obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases) でプルリクエストを作成し、あなたのプラグインを追加してください。

## 使い方

  - このリポジトリをクローンします。
  - NodeJS が v16 以上であることを確認してください（`node --version`）。
  - `npm i` または `yarn` を実行して依存関係をインストールします。
  - `npm run dev` を実行して、ウォッチモード（変更監視モード）でのコンパイルを開始します。

## プラグインの手動インストール

  - `main.js`、`styles.css`、`manifest.json` をあなたの保管庫（Vault）の `VaultFolder/.obsidian/plugins/あなたのプラグインID/` にコピーしてください。

## eslint によるコード品質の向上（任意）

  - [ESLint](https://eslint.org/) は、コードを分析して問題を素早く発見するためのツールです。プラグインに対して ESLint を実行することで、一般的なバグやコードの改善点を見つけることができます。
  - このプロジェクトで eslint を使用するには、ターミナルから eslint をインストールしてください:
      - `npm install -g eslint`
  - このプロジェクトを分析するために eslint を使用するには、以下のコマンドを使います:
      - `eslint main.ts`
      - eslint はファイル名と行番号ごとに、コード改善の提案を含むレポートを作成します。
  - ソースコードが `src` などのフォルダにある場合、以下のコマンドでそのフォルダ内の全ファイルを分析できます:
      - `eslint ./src/`

## 資金援助（Funding）のURL

プラグインを使用する人々が金銭的に支援できるように、資金援助のURLを含めることができます。

簡単な方法は、`manifest.json` ファイルの `fundingUrl` フィールドにリンクを設定することです：

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

複数のURLがある場合は、以下のようにも設定できます：

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```

## API ドキュメント

こちらをご覧ください: [https://github.com/obsidianmd/obsidian-api](https://github.com/obsidianmd/obsidian-api)