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
        const exePath = Bun.main;
        // Handle both Unix and Windows paths
        const separator = exePath.includes("\\") ? "\\" : "/";
        const lastSepIndex = exePath.lastIndexOf(separator);
        const exeDir = exePath.substring(0, lastSepIndex + 1);
        // Ensure proper file:// URL format
        const normalizedPath = exeDir.replace(/\\/g, "/");
        return new URL(
            normalizedPath.startsWith("file://")
                ? normalizedPath
                : `file://${normalizedPath}`,
        );
    } else {
        // In development, use the module directory
        return new URL(".", importMetaUrl);
    }
}
