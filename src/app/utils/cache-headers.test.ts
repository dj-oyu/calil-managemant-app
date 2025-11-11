import { test, expect, describe } from "bun:test";
import { getCacheHeaders } from "./cache-headers";

describe("getCacheHeaders", () => {
    test("開発環境でのキャッシュヘッダー", () => {
        const contentType = "text/css; charset=utf-8";
        const headers = getCacheHeaders(contentType, 86400, true);

        expect(headers["Content-Type"]).toBe(contentType);
        expect(headers["Cache-Control"]).toBe(
            "no-cache, no-store, must-revalidate",
        );
        expect(headers["Pragma"]).toBe("no-cache");
        expect(headers["Expires"]).toBe("0");
    });

    test("本番環境でのキャッシュヘッダー", () => {
        const contentType = "text/css; charset=utf-8";
        const maxAge = 86400;
        const headers = getCacheHeaders(contentType, maxAge, false);

        expect(headers["Content-Type"]).toBe(contentType);
        expect(headers["Cache-Control"]).toBe(
            `public, max-age=${maxAge}, immutable`,
        );
        expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    });

    test("カスタムmax-age値", () => {
        const maxAge = 31536000; // 1年
        const headers = getCacheHeaders(
            "application/javascript",
            maxAge,
            false,
        );

        expect(headers["Cache-Control"]).toContain("max-age=31536000");
        expect(headers["Cache-Control"]).toContain("immutable");
    });

    test("デフォルトmax-age値", () => {
        const headers = getCacheHeaders("text/css", undefined, false);

        expect(headers["Cache-Control"]).toContain("max-age=31536000");
    });

    test("開発環境ではmax-ageは無視される", () => {
        const headers = getCacheHeaders("text/css", 999999, true);

        expect(headers["Cache-Control"]).not.toContain("max-age");
        expect(headers["Cache-Control"]).toBe(
            "no-cache, no-store, must-revalidate",
        );
    });
});
