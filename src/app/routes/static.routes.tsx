import { Hono } from "hono";
import { fileURLToPath } from "node:url";
import { logger } from "../../shared/logging/logger";
import { getCacheHeaders } from "../utils/cache-headers";
import { isDevelopment } from "../utils/environment";
import { getModuleDir, isCompiledBinary } from "../utils/path-resolution";
import { embeddedCss, getEmbeddedClientJs } from "../embedded-assets";

export const staticRoutes = new Hono();

const moduleDir = getModuleDir(import.meta.url);

// Faviconを配信
staticRoutes.get("/favicon.ico", async (c) => {
    // In compiled/test mode: moduleDir = src/app/ (from executable)
    // In development: moduleDir = src/app/routes/ (from this file)
    const faviconUrl = new URL(
        isCompiledBinary ? "./favicon.ico" : "../favicon.ico",
        moduleDir,
    );
    const file = Bun.file(faviconUrl);

    if (!(await file.exists())) {
        logger.debug("Favicon not found", { faviconUrl: faviconUrl.href });
        return c.notFound();
    }

    const arrayBuffer = await file.arrayBuffer();
    return new Response(arrayBuffer, {
        status: 200,
        headers: {
            "Content-Type": "image/x-icon",
            "Cache-Control": "public, max-age=86400", // 24 hours
        },
    });
});

// CSSファイルを配信
staticRoutes.get("/public/styles/:filename{.+\\.css$}", async (c) => {
    const filename = c.req.param("filename");

    // Skip embedded CSS in development mode
    if (!isDevelopment) {
        // Try embedded CSS first (for compiled binaries)
        const embeddedContent = embeddedCss[filename];
        if (embeddedContent) {
            logger.debug("Serving embedded CSS", { filename });
            const headers = getCacheHeaders(
                "text/css; charset=utf-8",
                86400,
                isDevelopment,
            ); // 24時間
            return c.text(embeddedContent, 200, headers);
        }
    }

    // Fall back to file system (for development or if file not embedded)
    // In compiled/test mode: moduleDir = src/app/ (from executable)
    // In development: moduleDir = src/app/routes/ (from this file)
    const cssUrl = new URL(
        isCompiledBinary
            ? `./styles/${filename}`
            : `../styles/${filename}`,
        moduleDir,
    );
    const file = Bun.file(cssUrl);
    if (!(await file.exists())) {
        logger.warn("CSS file not found", {
            cssUrl: cssUrl.href,
            filename,
        });
        return c.text("Not Found", 404);
    }

    const content = await file.text();
    const headers = getCacheHeaders("text/css; charset=utf-8", 86400, isDevelopment); // 24時間
    return c.text(content, 200, headers);
});

// TypeScriptファイルを動的にトランスパイルして配信
staticRoutes.get("/public/:path{.+\\.js$}", async (c) => {
    const path = c.req.param("path");

    // Skip embedded JavaScript in development mode
    if (!isDevelopment) {
        // Try embedded JavaScript first (for compiled binaries)
        const embeddedJs = getEmbeddedClientJs(path);
        if (embeddedJs) {
            logger.debug("Serving embedded JavaScript", { path });
            const headers = getCacheHeaders(
                "application/javascript; charset=utf-8",
                31536000,
                isDevelopment,
            );
            return c.text(embeddedJs, 200, headers);
        }
    }

    // Fall back to dynamic transpilation (for development)
    // .js を .ts に変換
    const tsPath = path.replace(/\.js$/, ".ts");

    // clientディレクトリ全体を検索（scripts/, islands/など）
    // In compiled/test mode: moduleDir = src/app/, so ../../client to reach project root
    // In development: moduleDir = src/app/routes/, so ../../../client to reach project root
    const tsUrl = new URL(
        isCompiledBinary ? `../../client/${tsPath}` : `../../../client/${tsPath}`,
        moduleDir,
    );

    const tsFilePath = fileURLToPath(tsUrl);
    logger.debug("Transpiling request", {
        path,
        tsUrl: tsUrl.href,
        tsFilePath,
        isCompiledBinary,
    });

    // ファイルの存在確認
    const file = Bun.file(tsUrl);
    if (!(await file.exists())) {
        logger.warn("TypeScript file not found", {
            tsUrl: tsUrl.href,
            isCompiledBinary,
            moduleDir: moduleDir.href,
        });
        return c.text("Not Found", 404);
    }

    try {
        // Use Bun.build for both dev and production (required for module resolution)
        // Development: No minification, no splitting
        // Production: Full optimizations
        const transpiled = await Bun.build({
            entrypoints: [tsFilePath],
            target: "browser",
            minify: isDevelopment
                ? false
                : {
                      whitespace: true,
                      identifiers: true,
                      syntax: true,
                  },
            splitting: !isDevelopment, // Only split in production
            sourcemap: isDevelopment ? "inline" : "none",
        });

        if (!transpiled.success || !transpiled.outputs[0]) {
            logger.error("Transpilation failed", {
                path,
                tsUrl: tsUrl.href,
                success: transpiled.success,
                logs: transpiled.logs,
            });
            return c.text("Transpilation Error", 500);
        }

        const jsCode = await transpiled.outputs[0].text();

        logger.info("Transpiled successfully", {
            path,
            size: jsCode.length,
            isDevelopment,
        });

        const headers = getCacheHeaders(
            "application/javascript; charset=utf-8",
            31536000,
            isDevelopment,
        );
        return c.text(jsCode, 200, headers);
    } catch (error) {
        logger.error("Error transpiling TypeScript", {
            path,
            tsUrl: tsUrl.href,
            tsFilePath,
            error: String(error),
        });
        return c.text("Internal Server Error", 500);
    }
});
