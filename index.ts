import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { authRoutes } from './routes/auth';
import { fetchBookList } from './calil-fetch';

const app = new Hono();

app.route('/auth', authRoutes);

// 例: リスト取得（Cookieは内部で自動維持）
app.get('/', async (c) => {
    const res = await fetchBookList();

    // TODO: DOMパースして items にする
    return c.json({ books: res });
});

serve({ fetch: app.fetch, port: 8787 });
console.log('listening http://localhost:8787');
