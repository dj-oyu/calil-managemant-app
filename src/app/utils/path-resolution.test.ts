import { test, expect, describe } from "bun:test";
import { getModuleDir, isCompiledBinary } from "./path-resolution";

describe("path-resolution", () => {
    test("getModuleDir returns a valid URL", () => {
        const moduleDir = getModuleDir(import.meta.url);

        expect(moduleDir).toBeInstanceOf(URL);
        expect(moduleDir.protocol).toBe("file:");
    });

    test("isCompiledBinary is boolean", () => {
        expect(typeof isCompiledBinary).toBe("boolean");
    });

    test("in development mode, isCompiledBinary should be false", () => {
        // This test assumes we're running in development
        const NODE_ENV = process.env.NODE_ENV || "development";
        if (NODE_ENV === "development") {
            expect(isCompiledBinary).toBe(false);
        }
    });

    test("moduleDir path ends with separator", () => {
        const moduleDir = getModuleDir(import.meta.url);
        const path = moduleDir.pathname;

        expect(path.endsWith("/")).toBe(true);
    });
});
