import { Suspense, use, useState } from 'hono/jsx';
import { render } from 'hono/jsx/dom';
import type { NdlItem } from '../../src/features/ndl/utility';
// クライアント側のアコーディオン動作
// 初回開封時のみAPIから詳細情報を取得

const ItemCache: { [isbn: string]: NdlItem } = {};
const processing: { [isbn: string]: Promise<NdlItem> | undefined } = {};

function useBookDetail({ isbn }: { isbn: string }) {
    if (ItemCache[isbn] === undefined) {
        processing[isbn] ??= fetch(`/api/books/${isbn}`)
            .then(response => response.json())
            .then(dt => (ItemCache[isbn] = dt as NdlItem))
            .catch(error => {
                console.error('Error fetching book data:', error);
                throw new Error("情報を取得できませんでした。");
            });
        throw processing[isbn];
    }
    processing[isbn] &&= undefined;
    return renderBookDetail(ItemCache[isbn]);
}

function IslandAccordion({ isbn }: { isbn: string }) {
    const [open, setOpen] = useState(false);

    const toggleOpen = (e: UIEvent) => {
        e.preventDefault();
        setOpen(prev => !prev);
    };

    if (!open) {
        return (
            <details class="ndl" open={open} onToggle={toggleOpen}>
                <summary class="ndl-summary">書籍情報を表示</summary>
            </details>
        );
    }
    return (
        <details class="ndl" open={open} onToggle={toggleOpen}>
            <summary class="ndl-summary">閉じる</summary>
            <Suspense
                fallback={<div>読み込み中...</div>}
            >
                {useBookDetail({ isbn })}
            </Suspense>
        </details>
    );
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Accordions hydrating...');

    const islands = document.querySelectorAll<HTMLDetailsElement>('.ndl-island');

    islands.forEach((land) => {
        land.querySelectorAll<HTMLElement>('details.ndl').forEach((el) => {
            const isbn = el.dataset.isbn;
            if (isbn) {
                const islandElement = <IslandAccordion isbn={isbn} />;
                render(islandElement, el.parentElement!);
                el.remove();
            }
        });
    });
});

const renderBookDetail = (item: NdlItem) => {
    return (
        <div class="book-detail">
            {/* 主要情報 */}
            <section class="detail-section detail-primary">
                {item.title && (
                    <div class="detail-row">
                        <span class="detail-label">タイトル</span>
                        <span class="detail-value">{item.title}</span>
                    </div>
                )}
                {item.titleKana && (
                    <div class="detail-row detail-secondary">
                        <span class="detail-label">ヨミ</span>
                        <span class="detail-value detail-kana">{item.titleKana}</span>
                    </div>
                )}
                {item.creators.length > 0 && (
                    <div class="detail-row">
                        <span class="detail-label">著者</span>
                        <span class="detail-value">{item.creators.join(', ')}</span>
                    </div>
                )}
                {item.creatorsKana.length > 0 && (
                    <div class="detail-row detail-secondary">
                        <span class="detail-label">著者ヨミ</span>
                        <span class="detail-value detail-kana">{item.creatorsKana.join(', ')}</span>
                    </div>
                )}
            </section>

            {/* 出版情報 */}
            <section class="detail-section">
                <h4 class="section-title">出版情報</h4>
                {item.publisher && (
                    <div class="detail-row">
                        <span class="detail-label">出版社</span>
                        <span class="detail-value">{item.publisher}</span>
                    </div>
                )}
                {item.pubYear && (
                    <div class="detail-row">
                        <span class="detail-label">刊行年</span>
                        <span class="detail-value">{item.pubYear}</span>
                    </div>
                )}
                {item.issued && (
                    <div class="detail-row">
                        <span class="detail-label">発行日</span>
                        <span class="detail-value">{item.issued}</span>
                    </div>
                )}
                {item.extent && (
                    <div class="detail-row">
                        <span class="detail-label">ページ数</span>
                        <span class="detail-value">{item.extent}</span>
                    </div>
                )}
                {item.price && (
                    <div class="detail-row">
                        <span class="detail-label">価格</span>
                        <span class="detail-value detail-price">{item.price}</span>
                    </div>
                )}
            </section>

            {/* 分類・識別情報 */}
            <section class="detail-section">
                <h4 class="section-title">分類・識別情報</h4>
                {item.isbn13 && (
                    <div class="detail-row">
                        <span class="detail-label">ISBN</span>
                        <span class="detail-value detail-code">{item.isbn13}</span>
                    </div>
                )}
                {item.ndc10 && (
                    <div class="detail-row">
                        <span class="detail-label">NDC10</span>
                        <span class="detail-value">{item.ndc10}</span>
                    </div>
                )}
                {item.ndlc && (
                    <div class="detail-row">
                        <span class="detail-label">NDLC</span>
                        <span class="detail-value">{item.ndlc}</span>
                    </div>
                )}
                {item.subjects.length > 0 && (
                    <div class="detail-row">
                        <span class="detail-label">件名</span>
                        <span class="detail-value">{item.subjects.join(' / ')}</span>
                    </div>
                )}
                {item.ndlBibId && (
                    <div class="detail-row detail-secondary">
                        <span class="detail-label">NDL書誌ID</span>
                        <span class="detail-value detail-code">{item.ndlBibId}</span>
                    </div>
                )}
                {item.jpno && (
                    <div class="detail-row detail-secondary">
                        <span class="detail-label">全国書誌番号</span>
                        <span class="detail-value detail-code">{item.jpno}</span>
                    </div>
                )}
            </section>

            {/* リンク */}
            {item.link && (
                <section class="detail-section">
                    <a href={item.link} target="_blank" rel="noopener noreferrer" class="ndl-link">
                        📚 国立国会図書館で見る
                    </a>
                </section>
            )}
        </div>
    );
};
