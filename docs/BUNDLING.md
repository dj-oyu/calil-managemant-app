# アセットバンドリングの仕組み

このドキュメントでは、バイナリビルド時のアセットバンドリングの仕組みを説明します。

## 概要

ビルドプロセスでは、すべてのクライアントサイドのJavaScriptとCSSをバイナリに埋め込むため、事前にバンドルを行います。

## バンドルされるファイル

### JavaScript/TypeScript

**エントリーポイント**: `client/islands/loader.ts`

このファイルを起点として、Bunのバンドラーがすべての依存関係を自動的に解決し、単一のJSファイルにバンドルします。

#### 静的に含まれる依存関係

`loader.ts`は以下のファイルを**静的インポート**しています：

```typescript
import { Island } from './base';
import { BookDetailIsland } from './book-detail';
import { CoverImageIsland } from './cover-image';
import { TabNavigationIsland } from './tab-navigation';
import { logger } from '../shared/logger';
```

これらはすべて自動的にバンドルに含まれます：

- ✅ `client/islands/base.ts` - Base Island class
- ✅ `client/islands/tab-navigation.ts` - Tab navigation island
- ✅ `client/islands/book-detail.ts` - Book detail island
- ✅ `client/islands/cover-image.ts` - Cover image island
- ✅ `client/shared/logger.ts` - Client-side logger

### CSS

以下のCSSファイルが読み込まれ、文字列としてTypeScriptモジュールに埋め込まれます：

- `src/app/styles/main.css`
- `src/app/styles/logs.css`
- `src/app/styles/variables.css`

## バンドルプロセス

### 1. 事前バンドル (`bun run prebuild`)

`scripts/bundle-assets.ts` が以下を実行：

1. **クライアントJSのバンドル**
   ```bash
   Bun.build({
     entrypoints: ['client/islands/loader.ts'],
     target: 'browser',
     minify: true,
   })
   ```

2. **CSSの読み込み**
   - 各CSSファイルを文字列として読み込み

3. **TypeScriptモジュールの生成**
   - バンドルされたJSとCSSを含む`embedded-assets.generated.ts`を生成

### 2. バイナリコンパイル

生成された`embedded-assets.generated.ts`がバイナリに組み込まれます。

## 依存関係の確認

ビルド時に以下のログが表示され、すべての依存関係が含まれているか確認できます：

```
📦 Bundling assets for binary embedding...
  Bundling client/islands/loader.ts...
    This will include all statically imported dependencies:
    - base.ts
    - tab-navigation.ts
    - book-detail.ts
    - cover-image.ts
    - shared/logger.ts
  Bundle output:
    - .build/loader.js (XX.XX KB)
  Dependency check:
    - TabNavigationIsland: ✅
    - BookDetailIsland: ✅
    - CoverImageIsland: ✅
```

## トラブルシューティング

### Q: `tab-navigation.ts`がバンドルに含まれていないのでは？

**A**: いいえ、含まれています。`loader.ts`が**静的インポート**を使用しているため、Bunのバンドラーが自動的にすべての依存関係を解決してバンドルに含めます。

### Q: 動的インポートは含まれる？

**A**: 動的インポート（`import()`）は含まれません。現在のコードベースでは動的インポートを使用していないため、問題ありません。

### Q: 新しいIslandを追加したら？

**A**: 新しいIslandファイルを作成したら、以下の手順を実行してください：

1. `client/islands/your-island.ts`を作成
2. `client/islands/loader.ts`に静的インポートを追加
   ```typescript
   import { YourIsland } from './your-island';
   ```
3. `ISLAND_REGISTRY`に登録
   ```typescript
   const ISLAND_REGISTRY = {
     'your-island': YourIsland,
     // ...
   };
   ```
4. 再ビルド: `bun run build`

静的インポートを追加すれば、自動的にバンドルに含まれます。

## バンドルの検証

実際にバンドルに含まれているか確認したい場合：

```bash
# ビルドを実行
bun run prebuild

# 生成されたバンドルを確認
cat .build/loader.js | wc -c  # ファイルサイズを確認

# 特定の文字列が含まれているか確認（minify後なので正確ではない）
grep -o "TabNavigation" .build/loader.js || echo "Minified"
```

## まとめ

- ✅ `tab-navigation.ts`を含むすべてのIslandファイルは自動的にバンドルに含まれる
- ✅ 静的インポートを使用している限り、手動で個別にバンドルする必要はない
- ✅ Bunのバンドラーが依存関係グラフを解析して自動的にバンドルする
- ✅ ビルドログで依存関係が含まれているか確認できる
