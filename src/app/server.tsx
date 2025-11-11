import { Hono } from "hono";
import { type FC } from "hono/jsx";
import { renderToReadableStream, Suspense } from "hono/jsx/streaming";
import { raw } from "hono/html";
import { serve } from "@hono/node-server";
import { authRoutes } from "./routes/auth.routes";
import {
    fetchBookList,
    fetchBookListMetadata,
    fetchBookListPage,
} from "../features/calil/api/fetch-list";
import {
    convertISBN10to13,
    NDLsearch,
    type NdlItem,
} from "../features/ndl/utility";
import { logger } from "../shared/logging/logger";
import { initCoverCache, getCoverImage } from "../features/covers/server/cache";
import {
    embeddedCss,
    loadEmbeddedClientJs,
    getEmbeddedClientJs,
} from "./embedded-assets";
import {
    getDatabase,
    upsertBibliographicInfo,
    getBibliographicInfo,
    getBibliographicInfoBatch,
    searchBibliographic,
    countSearchResults,
    getAllNDC10Classifications,
    getAllNDLCClassifications,
    getAllPublishers,
    type BibliographicInfo,
    type SearchOptions,
} from "../features/bibliographic/db/schema";
import { NODE_ENV, isDevelopment } from "./utils/environment";
import { getCacheHeaders } from "./utils/cache-headers";
import { moduleDir, isCompiledBinary } from "./utils/path-resolution";
import { BookCard, BookDetail } from "./components/books";
import { StreamingBookListPage } from "./components/pages/StreamingBookListPage";
import type { Book } from "../features/calil/types/book";
import { logRoutes } from "./routes/log.routes";
import { coverRoutes } from "./routes/cover.routes";
import { booksRoutes } from "./routes/books.routes";
import { indexRoutes } from "./routes/index.routes";
import { bibliographicRoutes } from "./routes/bibliographic.routes";
import { staticRoutes } from "./routes/static.routes";

export const app = new Hono();

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
const db = getDatabase();
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
