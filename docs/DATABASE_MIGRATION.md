# Database Migration Guide

このドキュメントでは、データベースのマイグレーションシステムと、既存データの更新方法について説明します。

## マイグレーションシステム

### 概要

このプロジェクトでは、データベーススキーマの変更を管理するためのマイグレーションシステムを使用しています。

- **自動マイグレーション**: アプリケーション起動時に自動的に実行
- **バージョン管理**: `schema_migrations` テーブルで適用済みマイグレーションを追跡
- **トランザクション**: 各マイグレーションはトランザクション内で実行され、失敗時は自動ロールバック

### マイグレーション定義

マイグレーションは `src/features/bibliographic/db/migrations.ts` で定義されています。

```typescript
export const migrations: Migration[] = [
    {
        version: 1,
        name: "add_description_column",
        up: (db: Database) => {
            // マイグレーション処理
        },
    },
];
```

### 新しいマイグレーションの追加

新しいスキーマ変更が必要な場合：

1. `src/features/bibliographic/db/migrations.ts` に新しいマイグレーションを追加
2. バージョン番号を適切にインクリメント
3. `up` 関数内で必要なSQL文を実行

例：

```typescript
{
    version: 2,
    name: "add_subjects_column",
    up: (db: Database) => {
        db.run(`ALTER TABLE bibliographic_info ADD COLUMN subjects TEXT`);
    },
}
```

## 既存データの更新

### description フィールドの移行

バージョン1.xから2.xへのアップグレード時、既存のキャッシュデータにはdescriptionフィールドが空の状態です。これらを埋めるためのマイグレーションスクリプトを提供しています。

#### ドライラン（変更を確認）

```bash
bun run migrate:descriptions:dry-run
```

または

```bash
bun scripts/migrate-descriptions.ts --dry-run
```

#### 実際の移行実行

```bash
bun run migrate:descriptions
```

または

```bash
bun scripts/migrate-descriptions.ts
```

#### オプション

- `--dry-run`: 変更内容を表示するが、実際には更新しない
- `--limit N`: 処理するレコード数を制限（テスト用）

例：

```bash
# 最初の10件だけ処理（テスト用）
bun scripts/migrate-descriptions.ts --dry-run --limit 10

# 実際に移行
bun scripts/migrate-descriptions.ts
```

### マイグレーションの動作

1. `description` が NULL または空のレコードを検索
2. 各レコードについてNDL APIからdescriptionを取得
3. データベースを更新

**注意事項:**

- NDL APIへの負荷を考慮し、リクエスト間に100msの待機時間を設定
- 大量のレコードがある場合、処理に時間がかかる可能性があります
- ネットワークエラーが発生した場合、該当レコードはスキップされます

### 進捗表示

```
📚 Bibliographic Description Migration Tool

Found 15 record(s) with missing descriptions

[1/15] 9784861827921: 麻薬と人間100年の物語
  ✓ Updated (1234 chars)
[2/15] 9784621051306: ゲームとしての交渉
  ℹ No description available on NDL
...

📊 Summary:
  Total records: 15
  Updated: 12
  No description available: 3
  Failed: 0

✓ Migration completed!
```

## トラブルシューティング

### マイグレーションが失敗する

マイグレーションが失敗した場合：

1. エラーメッセージを確認
2. データベースファイルのバックアップを取る
3. 必要に応じて手動で修正

### データベースをリセットする

全てのキャッシュデータを削除して最初からやり直す場合：

**Windows:**
```bash
del "%LOCALAPPDATA%\Calil-management-app\bibliographic.db"
```

**macOS:**
```bash
rm ~/Library/Application\ Support/Calil-management-app/bibliographic.db
```

**Linux:**
```bash
rm ~/.local/share/Calil-management-app/bibliographic.db
```

アプリケーションを再起動すると、新しいデータベースが作成されます。

### マイグレーションステータスの確認

マイグレーションの状態を確認するには、データベースを直接クエリ：

```sql
SELECT * FROM schema_migrations ORDER BY version;
```

## 参考情報

- マイグレーションシステム: `src/features/bibliographic/db/migrations.ts`
- スキーマ定義: `src/features/bibliographic/db/schema.ts`
- マイグレーションスクリプト: `scripts/migrate-descriptions.ts`
