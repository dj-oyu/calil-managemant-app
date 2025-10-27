// クライアント側のアコーディオン動作
// 初回開封時のみAPIから詳細情報を取得

document.addEventListener('DOMContentLoaded', () => {
    const accordions = document.querySelectorAll<HTMLDetailsElement>('details.ndl');

    accordions.forEach((details) => {
        const isbn = details.dataset.isbn;
        let loaded = false;

        details.addEventListener('toggle', async () => {
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
