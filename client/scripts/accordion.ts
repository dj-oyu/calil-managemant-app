// クライアント側のアコーディオン動作
// 初回開封時のみAPIから詳細情報を取得

document.addEventListener('DOMContentLoaded', () => {
    const accordions = document.querySelectorAll<HTMLDetailsElement>('details.ndl');

    accordions.forEach((details) => {
        const isbn = details.dataset.isbn;
        const summary = details.querySelector('summary');
        let loaded = false;

        // 初期テキストを保存
        const originalText = summary?.textContent || '詳細情報を表示';

        details.addEventListener('toggle', async () => {
            // summaryテキストを更新
            if (summary) {
                summary.textContent = details.open ? '閉じる' : originalText;
            }

            // データ取得
            if (details.open && !loaded && isbn) {
                loaded = true;
                const contentDiv = details.querySelector('.ndl-content');

                if (contentDiv) {
                    contentDiv.innerHTML = '<div>読み込み中...</div>';

                    try {
                        const response = await fetch(`/api/books/${isbn}`);
                        const html = await response.text();
                        contentDiv.innerHTML = html;
                    } catch (error) {
                        contentDiv.innerHTML = '<div>詳細情報の取得に失敗しました。</div>';
                        console.error('Failed to fetch book details:', error);
                    }
                }
            }
        });
    });
});
