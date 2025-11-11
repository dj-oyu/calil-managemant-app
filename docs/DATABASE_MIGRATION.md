# Database Schema Management

このドキュメントでは、データベースのスキーマ管理について説明します。

## 自動スキーマ管理

### 概要

このプロジェクトでは、スキーマ変更時にデータベースを自動的に管理する仕組みを実装しています：

- **自動リセット**: スキーマが古い場合、アプリケーション起動時に自動的にデータベースをリセット
- **透過的な処理**: ユーザーが意識することなく、常に最新のスキーマで動作
- **データ再取得**: リセット後、必要なデータはNDL APIから自動的に再取得される
- **バックアップ保持**: 古いデータベースは `.old` 拡張子付きで自動バックアップ

### 動作フロー

1. アプリケーション起動時、データベースのスキーマバージョンをチェック
2. 現在のバージョンが期待するバージョンより古い場合、古いファイルをバックアップにリネーム
3. 新しいデータベースを最新のスキーマで作成
4. マイグレーションを自動適用
5. 書誌データは使用時にNDL APIから取得され、自動的にキャッシュされる

### ログ出力例

スキーマ更新時：
```
[INFO] Database schema is outdated, will reset {
  currentVersion: 0,
  expectedVersion: 1
}
[INFO] Resetting database due to schema changes
[INFO] Database file renamed for reset {
  oldPath: "..\\bibliographic.db",
  newPath: "..\\bibliographic.db.2025-11-11T09-31-05-412Z.old"
}
[INFO] Running 1 pending migration(s)
[INFO] Applying migration 1: add_description_column
[INFO] ✓ Migration 1 applied successfully
```

最新スキーマの場合：
```
[INFO] Bibliographic database initialized
```

### メリット

✅ **手動操作不要**: スキーマ更新時にユーザーが何もする必要がない
✅ **常に正しいスキーマ**: データベース構造の不整合を防止
✅ **データ破損のリスクなし**: マイグレーション失敗によるデータ破損を回避
✅ **自動バックアップ**: 古いデータベースは保持される（最新3つ）
✅ **Windows対応**: ファイルロック問題を回避する設計

### 注意点

⚠️ **データの再取得**: スキーマ更新時、キャッシュされた書誌データは失われます
ℹ️ **自動再取得**: データは次回使用時にNDL APIから自動的に再取得されます
✅ **カバー画像は保護**: カバー画像キャッシュは別ディレクトリなので影響を受けません

## バックアップファイル

### 場所

古いデータベースファイルは、アプリケーションデータディレクトリに保存されます：

**Windows:**
```
C:\Users\[ユーザー名]\AppData\Local\Calil-management-app\
  ├── bibliographic.db                              (現在のDB)
  ├── bibliographic.db.2025-11-11T09-31-05-412Z.old (バックアップ1)
  ├── bibliographic.db.2025-11-10T10-20-30-456Z.old (バックアップ2)
  └── bibliographic.db.2025-11-09T08-15-45-123Z.old (バックアップ3)
```

**macOS:**
```
~/Library/Application Support/Calil-management-app/
```

**Linux:**
```
~/.local/share/Calil-management-app/
```

### 自動クリーンアップ

- 最新3つのバックアップファイルが自動的に保持されます
- それ以前のバックアップは自動的に削除されます

### 手動削除

バックアップファイルが不要な場合、手動で削除できます：

**Windows:**
```powershell
del "%LOCALAPPDATA%\Calil-management-app\*.old"
```

**macOS/Linux:**
```bash
rm ~/Library/Application\ Support/Calil-management-app/*.old
```

## 開発者向け情報

### スキーマバージョン管理

- スキーマバージョンは `src/features/bibliographic/db/migrations.ts` で定義
- 新しいマイグレーションを追加すると、バージョンが自動的にインクリメント
- アプリケーション起動時に自動チェック・適用

### ファイル構成

- **マイグレーション定義**: `src/features/bibliographic/db/migrations.ts`
- **スキーマ定義**: `src/features/bibliographic/db/schema.ts`
- **自動リセットロジック**: `getDatabase()` 関数内
