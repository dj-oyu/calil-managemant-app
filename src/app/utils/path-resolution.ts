import { getExecutableDirectory, toDirectoryFileUrl } from "../../shared/config/path-utils";
import { isDevelopment } from "./environment";

/**
 * Detect if running as a compiled binary
 * In development mode, always treat as non-compiled even if Bun.main differs (due to index.tsx wrapper)
 */
export const isCompiledBinary = !isDevelopment && Bun.main !== import.meta.path;

/**
 * Get module directory URL for path resolution
 *
 * @param importMetaUrl - The import.meta.url from the calling module
 * @returns Module directory URL
 *
 * @remarks
 * - Compiled: Uses the executable directory
 * - Development: Uses the module directory
 */
export function getModuleDir(importMetaUrl: string): URL {
    if (isCompiledBinary) {
        // When compiled, use the executable directory
        const exeDir = getExecutableDirectory(Bun.main);
        return toDirectoryFileUrl(exeDir);
    } else {
        // In development, use the module directory
        return new URL(".", importMetaUrl);
    }
}
