# Calil 蔵書管理アプリ

[Calil API](https://calil.jp/) を使用した図書館蔵書管理Webアプリケーションです。Hono と Bun で構築されており、読みたい本と読んだ本を追跡するモダンなインターフェースを提供します。

## 機能

- 📚 **蔵書リスト管理**: Calil から「読みたい本」「読んだ本」リストを管理
- 🔍 **NDL検索統合**: 国立国会図書館（NDL）OpenSearch API から詳細な書籍情報を取得
- 🖼️ **カバー画像キャッシング**: 書籍カバー画像の自動キャッシュによるパフォーマンス向上
- 🔐 **認証**: Puppeteer を使用した Calil API への安全な認証
- 📊 **アプリケーションログ**: Web ベースのログビューアーを備えた組み込みログシステム
- ⚡ **高速パフォーマンス**: Bun ランタイムによる最適な速度

## 技術スタック

- **ランタイム**: [Bun](https://bun.sh) - 高速オールインワン JavaScript ランタイム
- **フレームワーク**: [Hono](https://hono.dev) - 超高速 Web フレームワーク
- **自動化**: [Puppeteer](https://pptr.dev) - 認証用ヘッドレスブラウザ
- **XML パース**: NDL API レスポンス用の fast-xml-parser

## インストール

### Bunのインストール

まず、Bunをグローバルにインストールします：

```bash
npm install -g bun
```

### 依存関係のインストール

プロジェクトの依存関係をインストール：

```bash
bun install
```

## 使い方

### 開発モード

ホットリロード付きでアプリケーションを実行:

```bash
bun run dev
```

### 本番モード

アプリケーションを実行:

```bash
bun run start
```

サーバーは `http://localhost:8787` で起動します

## 環境設定

アプリケーションは環境変数を使用して動作をカスタマイズできます。

### 環境変数の設定

`.env.example` をコピーして `.env` を作成:

```bash
cp .env.example .env
```

### 利用可能な環境変数

#### `NODE_ENV`

アプリケーションの実行環境を指定します。この設定によりキャッシュ動作が変わります。

- **`development`** (デフォルト)
  - JavaScriptとCSSのキャッシュ無効化
  - コード変更が即座に反映される
  - 詳細なデバッグログ
  - ブラウザのリフレッシュで最新コードを取得

- **`production`**
  - 長期キャッシュ有効（JS: 1年、CSS: 24時間）
  - パフォーマンス最適化
  - ファイルが immutable として提供される
  - CDNと相性が良い

### スクリプトと環境

```bash
# 開発モード（ホットリロード + キャッシュ無効）
bun run dev

# 開発モード（キャッシュ無効のみ）
bun run start:dev

# 本番モード（長期キャッシュ有効）
bun run start

# または
bun run start:prod

# ビルド（本番環境設定）
bun run build:binary
```

### キャッシュヘッダー詳細

| 環境 | Cache-Control | 目的 |
|------|---------------|------|
| Development | `no-cache, no-store, must-revalidate` | 変更を即座に反映 |
| Production | `public, max-age={秒}, immutable` | パフォーマンス最適化 |

**注意**: 本番環境では、ファイル名にハッシュを含めることでキャッシュバスティングを実現することを推奨します。

### 利用可能なエンドポイント

- `/` - 読みたい本と読んだ本のタブを持つメイン書籍リストインターフェース
- `/api/books/:isbn` - NDL から詳細な書籍情報を取得
- `/api/cover/:isbn` - キャッシュされた書籍カバー画像を取得
- `/log` - アプリケーションログを表示
- `/auth/*` - 認証エンドポイント

### バイナリのビルド

各プラットフォーム用のスタンドアロン実行ファイルをビルド:

```bash
# すべてのプラットフォーム用にビルド
bun run build

# または
bun run build:binary

# 特定のプラットフォーム用にビルド
bun run build:binary:linux
bun run build:binary:windows
bun run build:binary:mac
```

バイナリは `dist/` ディレクトリに作成されます。

#### ビルドプロセス

ビルド時には以下の処理が自動的に実行されます：

1. **アセットバンドル** (`prebuild`): CSS と クライアントJavaScript をバイナリに埋め込むために事前バンドル
2. **バイナリコンパイル**: Bun を使用して各プラットフォーム用の実行ファイルを生成
3. **アセット埋め込み**: バンドルされたアセットがバイナリに含まれるため、**外部ファイル不要**

### バイナリの配布

✨ **新機能**: アセットがバイナリに埋め込まれるようになりました！

バイナリをビルドすると、`dist/` ディレクトリに以下のファイルが出力されます：

```
dist/
├── Calil-management-app-linux-x64       # Linux実行ファイル
├── Calil-management-app-win-x64.exe     # Windows実行ファイル
├── Calil-management-app-macos-x64       # macOS (Intel) 実行ファイル
└── Calil-management-app-macos-arm64     # macOS (Apple Silicon) 実行ファイル
```

**重要**: バイナリにはすべてのアセット（CSS、JavaScript）が埋め込まれているため、**実行ファイル単体で動作します**。追加のファイルやディレクトリは不要です。

#### 配布例

```bash
# 単一のバイナリファイルを配布するだけでOK
# 例: Windowsの場合
cp dist/Calil-management-app-win-x64.exe /path/to/distribution/

# または zip で圧縮
cd dist
zip calil-app-linux.zip Calil-management-app-linux-x64
zip calil-app-windows.zip Calil-management-app-win-x64.exe
zip calil-app-macos-x64.zip Calil-management-app-macos-x64
zip calil-app-macos-arm64.zip Calil-management-app-macos-arm64
```

#### 実行方法

バイナリを任意の場所に配置して実行：

```bash
# Linux/macOS
./Calil-management-app-linux-x64

# Windows
Calil-management-app-win-x64.exe
```

追加のファイルやディレクトリは不要です。

## テスト

このプロジェクトでは Bun の組み込みテストランナーを使用しています。

### テストの実行

```bash
# すべてのテストを実行
bun test

# ウォッチモードで実行（ファイル変更時に自動実行）
bun test --watch
```

### テストカバレッジ

現在、以下のモジュールに対する包括的な単体テストがあります：

- ✅ **ユーティリティ関数** (`src/features/ndl/utility.ts`)
  - ISBN変換、NDL OpenSearch XMLパース
- ✅ **ロギングシステム** (`src/shared/logging/logger.ts`)
  - ログレベル、データ付きログ、フォーマット機能
- ✅ **アプリケーションパス** (`src/shared/config/app-paths.ts`)
  - クロスプラットフォームパス生成
- ✅ **セッション管理** (`src/features/auth/session/vault.store.ts`)
  - Cookie操作とヘッダー生成
- ✅ **APIユーティリティ** (`src/features/calil/api/fetch-list.ts`)
  - リクエストヘッダー、ページング計算
- ✅ **ブラウザパス** (`src/features/auth/puppeteer/browser-path.ts`)
  - Chrome検出、プラットフォームマッピング

**テスト統計**: 80+ テスト、191+ アサーション

### CI/CD

GitHub Actionsによる自動テスト：
- プルリクエスト作成時に自動実行
- mainブランチへのプッシュ時に自動実行

## プロジェクト構造

```
├── src/
│   ├── app/           # アプリケーションサーバーとルート
│   ├── features/      # 機能モジュール
│   │   ├── calil/     # Calil API 統合
│   │   ├── ndl/       # NDL 検索ユーティリティ
│   │   ├── covers/    # カバー画像キャッシング
│   │   └── auth/      # 認証
│   └── shared/        # 共有ユーティリティ
├── client/            # クライアントサイドスクリプト
└── index.tsx          # アプリケーションエントリーポイント
```

## ライセンス

このプロジェクトはプライベートです。
