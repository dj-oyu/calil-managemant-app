import { Hono } from "hono";
import { logger } from "../../shared/logging/logger";
import { LogViewerPage } from "../components/pages/LogViewerPage";

export const logRoutes = new Hono();

// ログビューアーエンドポイント
logRoutes.get("/", (c) => {
    const limit = c.req.query("limit")
        ? parseInt(c.req.query("limit")!)
        : undefined;
    const logs = logger.getLogs(limit);

    return c.html(<LogViewerPage logs={logs} />);
});

// ログクリアエンドポイント
logRoutes.post("/clear", (c) => {
    logger.clear();
    return c.json({ success: true });
});
