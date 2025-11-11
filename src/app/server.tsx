import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { authRoutes } from "./routes/auth.routes";
import { logger } from "../shared/logging/logger";
import { initCoverCache } from "../features/covers/server/cache";
import {
    loadEmbeddedClientJs,
} from "./embedded-assets";
import {
    getDatabase,
    type BibliographicInfo,
} from "../features/bibliographic/db/schema";
import { NODE_ENV, isDevelopment } from "./utils/environment";
import { getModuleDir, isCompiledBinary } from "./utils/path-resolution";
import { logRoutes } from "./routes/log.routes";
import { coverRoutes } from "./routes/cover.routes";
import { booksRoutes } from "./routes/books.routes";
import { indexRoutes } from "./routes/index.routes";
import { bibliographicRoutes } from "./routes/bibliographic.routes";
import { staticRoutes } from "./routes/static.routes";

export const app = new Hono();

const moduleDir = getModuleDir(import.meta.url);

logger.info("Application starting", {
    environment: NODE_ENV,
    isDevelopment,
    cacheEnabled: !isDevelopment,
});

// Initialize cover cache on startup
await initCoverCache();

// Load embedded client JavaScript for compiled binaries
await loadEmbeddedClientJs();

// Initialize bibliographic database
getDatabase();
logger.info("Bibliographic database initialized");

logger.info("Path resolution initialized", {
    isCompiledBinary,
    moduleDir: moduleDir.href,
    bunMain: Bun.main,
    importMetaPath: import.meta.path,
});

// Mount routes
app.route("/", staticRoutes);
app.route("/auth", authRoutes);
app.route("/log", logRoutes);
app.route("/api/cover", coverRoutes);
app.route("/api", booksRoutes);
app.route("/api", bibliographicRoutes);
app.route("/", indexRoutes);

// Only start the server if this file is run directly (not imported for testing)
// Note: When imported from index.tsx, Bun.main will be the path to index.tsx
// When imported from test files, Bun.main will be the path to the test file
const isTestEnvironment =
    Bun.main.includes(".test.") || Bun.main.includes("/test/");

if (!isTestEnvironment) {
    serve({ fetch: app.fetch, port: 8787 });
    console.log("listening http://localhost:8787");
    console.log("logs available at http://localhost:8787/log");
}
