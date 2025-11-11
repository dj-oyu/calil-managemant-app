# 書誌情報検索API

書誌情報データベースの検索機能について説明します。

## 概要

SQLite + FTS5（Full-Text Search）を使用した高速な全文検索機能を提供します。
タイトル、著者、出版社、分類（NDC10、NDLC）、刊行年などで柔軟に検索できます。

## データベーススキーマ

### bibliographic_info テーブル

| カラム名 | 型 | 説明 |
|---------|---|------|
| isbn | TEXT | ISBNコード（主キー） |
| title | TEXT | タイトル |
| title_kana | TEXT | タイトルヨミ |
| authors | TEXT | 著者（JSON配列） |
| authors_kana | TEXT | 著者ヨミ（JSON配列） |
| publisher | TEXT | 出版社 |
| pub_year | TEXT | 刊行年 |
| ndc10 | TEXT | 日本十進分類法（NDC10） |
| ndlc | TEXT | 国立国会図書館分類（NDLC） |
| created_at | TEXT | 作成日時 |
| updated_at | TEXT | 更新日時 |

### インデックス

以下のカラムにインデックスが作成されています:
- `title` - タイトル検索の高速化
- `publisher` - 出版社検索の高速化
- `pub_year` - 刊行年検索の高速化
- `ndc10` - NDC10分類検索の高速化
- `ndlc` - NDLC分類検索の高速化
- `updated_at` - 更新日時ソートの高速化

### FTS5仮想テーブル

`bibliographic_fts` テーブルで全文検索をサポート:
- タイトル、タイトルヨミ、著者、著者ヨミ、出版社を対象
- unicode61トークナイザーを使用（日本語対応）
- トリガーで自動的に同期

## 検索API

### 1. 書誌情報検索

**エンドポイント:** `GET /api/search/bibliographic`

複合検索をサポートします。全文検索と個別フィールド検索を組み合わせられます。

#### クエリパラメータ

| パラメータ | 型 | 説明 | 例 |
|-----------|---|------|---|
| q | string | 全文検索クエリ（タイトル、著者、出版社を横断検索） | `?q=夏目漱石` |
| title | string | タイトルで部分一致検索 | `?title=吾輩は猫` |
| author | string | 著者名で部分一致検索 | `?author=夏目` |
| publisher | string | 出版社名で部分一致検索 | `?publisher=岩波書店` |
| isbn | string | ISBNで部分一致検索 | `?isbn=9784003` |
| ndc10 | string | NDC10分類で部分一致検索 | `?ndc10=913.6` |
| ndlc | string | NDLC分類で部分一致検索 | `?ndlc=KH` |
| yearFrom | string | 刊行年（開始） | `?yearFrom=2020` |
| yearTo | string | 刊行年（終了） | `?yearTo=2024` |
| limit | number | 取得件数（デフォルト: 50） | `?limit=20` |
| offset | number | オフセット（デフォルト: 0） | `?offset=10` |

#### レスポンス例

```json
{
  "results": [
    {
      "isbn": "9784003101018",
      "title": "吾輩は猫である",
      "title_kana": "ワガハイハネコデアル",
      "authors": ["夏目漱石"],
      "authors_kana": ["ナツメソウセキ"],
      "publisher": "岩波書店",
      "pub_year": "2022",
      "ndc10": "913.6",
      "ndlc": "KH334"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "totalCount": 125,
    "hasMore": true
  }
}
```

#### 検索例

```bash
# 全文検索: 「夏目漱石」を含む書籍
curl "http://localhost:8787/api/search/bibliographic?q=夏目漱石"

# タイトル検索: 「猫」を含むタイトル
curl "http://localhost:8787/api/search/bibliographic?title=猫"

# 著者検索: 「夏目」を含む著者
curl "http://localhost:8787/api/search/bibliographic?author=夏目"

# 複合検索: NDC10が「913」で、2020年以降の書籍
curl "http://localhost:8787/api/search/bibliographic?ndc10=913&yearFrom=2020"

# 全文検索 + フィルタ: 「文学」を含み、岩波書店の書籍
curl "http://localhost:8787/api/search/bibliographic?q=文学&publisher=岩波書店"

# ページネーション: 20件ずつ、2ページ目
curl "http://localhost:8787/api/search/bibliographic?q=小説&limit=20&offset=20"
```

### 2. フィルタ用データ取得

**エンドポイント:** `GET /api/search/filters`

検索フィルタ用のマスターデータを取得します。

#### レスポンス例

```json
{
  "ndc10": ["913.6", "913.7", "914.6", "..."],
  "ndlc": ["KH334", "KH371", "KH461", "..."],
  "publishers": ["岩波書店", "新潮社", "講談社", "..."]
}
```

## FTS5全文検索の構文

`q`パラメータでは、FTS5の高度な検索構文を使用できます:

### 基本検索

```
夏目漱石          # 「夏目」と「漱石」の両方を含む
"夏目漱石"        # フレーズ検索（順序を保持）
夏目 OR 芥川      # 「夏目」または「芥川」を含む
夏目 NOT 芥川     # 「夏目」を含み、「芥川」を含まない
```

### 近接検索

```
NEAR(夏目 漱石, 3)  # 「夏目」と「漱石」が3語以内
```

### カラム指定

```
title:吾輩         # タイトルに「吾輩」を含む
authors:夏目       # 著者に「夏目」を含む
publisher:岩波     # 出版社に「岩波」を含む
```

### 前方一致

```
夏目*              # 「夏目」で始まる語
```

## データベース関数

### searchBibliographic

```typescript
searchBibliographic(db: Database, options: SearchOptions): BibliographicInfo[]
```

複合検索を実行します。

### countSearchResults

```typescript
countSearchResults(db: Database, options: SearchOptions): number
```

検索結果の件数を取得します（ページネーション用）。

### getAllNDC10Classifications

```typescript
getAllNDC10Classifications(db: Database): string[]
```

登録されているすべてのNDC10分類を取得します。

### getAllNDLCClassifications

```typescript
getAllNDLCClassifications(db: Database): string[]
```

登録されているすべてのNDLC分類を取得します。

### getAllPublishers

```typescript
getAllPublishers(db: Database): string[]
```

登録されているすべての出版社を取得します。

## パフォーマンス

- **FTS5全文検索**: 10万件のデータから数ミリ秒で検索
- **インデックス検索**: B-treeインデックスによる高速フィルタリング
- **キャッシュ**: 長期キャッシュ（30日）により、APIレスポンスを高速化

## 今後の拡張案

1. **ファセット検索**: 検索結果から分類・出版社別の件数を表示
2. **サジェスト機能**: タイトル・著者名の入力補完
3. **関連書籍**: 同じ著者や分類の書籍を推薦
4. **ランキング**: BM25スコアリングによる検索結果の関連度順ソート
5. **同義語辞書**: 「SF」→「サイエンスフィクション」などの同義語展開
