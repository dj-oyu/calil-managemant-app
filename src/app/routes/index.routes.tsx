import { Hono } from "hono";
import { renderToReadableStream } from "hono/jsx/streaming";
import { logger } from "../../shared/logging/logger";
import { StreamingBookListPage } from "../components/pages/StreamingBookListPage";

export const indexRoutes = new Hono();

// リスト取得（Suspense + Streaming対応）
indexRoutes.get("/", async (c) => {
    const tab = (c.req.query("tab") as "wish" | "read") || "wish";

    logger.info("Streaming page request", { tab });

    // renderToReadableStreamを使用してストリーミングレスポンスを生成
    const stream = renderToReadableStream(
        <StreamingBookListPage activeTab={tab} />,
    );

    return c.body(stream, {
        headers: {
            "Content-Type": "text/html; charset=UTF-8",
            "Transfer-Encoding": "chunked",
        },
    });
});
