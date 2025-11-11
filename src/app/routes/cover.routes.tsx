import { Hono } from "hono";
import { getCoverImage } from "../../features/covers/server/cache";

export const coverRoutes = new Hono();

// カバー画像取得エンドポイント（キャッシュ付き）
coverRoutes.get("/:isbn", async (c) => {
    const isbn = c.req.param("isbn");

    const result = await getCoverImage(isbn);

    if (!result) {
        return c.notFound();
    }

    // Bunのファイルを直接返す
    const file = Bun.file(result.path);
    const arrayBuffer = await file.arrayBuffer();

    return new Response(arrayBuffer, {
        status: 200,
        headers: {
            "Content-Type": result.contentType,
            "Cache-Control": "public, max-age=2592000", // 30 days
            "Content-Length": String(arrayBuffer.byteLength),
        },
    });
});
