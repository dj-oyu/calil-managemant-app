# Database Migration Guide

このドキュメントでは、データベースのマイグレーションシステムと、既存データの更新方法について説明します。

## 自動スキーマ管理

### 概要

このプロジェクトでは、スキーマ変更時にデータベースを自動的に管理する仕組みを実装しています：

- **自動リセット**: スキーマが古い場合、アプリケーション起動時に自動的にデータベースをリセット
- **透過的な処理**: ユーザーが意識することなく、常に最新のスキーマで動作
- **データ再取得**: リセット後、必要なデータはNDL APIから自動的に再取得される

### 動作

1. アプリケーション起動時、データベースのスキーマバージョンをチェック
2. 現在のバージョンが期待するバージョンより古い場合、データベースファイルを削除
3. 新しいデータベースを最新のスキーマで作成
4. 書誌データは使用時にNDL APIから取得され、自動的にキャッシュされる

**利点:**
- スキーマ変更時の手動操作が不要
- 常に正しいスキーマ構造を保証
- マイグレーションの失敗によるデータ破損のリスクがない

**注意点:**
- スキーマ更新時、キャッシュされた書誌データは失われる
- データは次回使用時に自動的に再取得される
- カバー画像キャッシュは影響を受けない（別ディレクトリに保存）

## マイグレーションシステム（上級者向け）

### 概要

データを保持したままスキーマを更新したい場合、マイグレーションシステムを使用できます。

- **手動実行**: 必要に応じてマイグレーションスクリプトを実行
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

## 既存データの更新（オプション）

### 注意

通常、スキーマ更新時はデータベースが自動的にリセットされるため、このセクションの操作は不要です。
既存のキャッシュデータを保持したままアップデートしたい場合のみ、以下の手順を実行してください。

### description フィールドの移行

既存のキャッシュデータにdescriptionフィールドが空の場合、これらを埋めるためのマイグレーションスクリプトを提供しています。

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
