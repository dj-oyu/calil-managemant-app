/**
 * Embedded assets for compiled binaries
 *
 * This module provides access to CSS and bundled client JavaScript
 * that are embedded in the binary at build time.
 *
 * Works in both development and production:
 * - Development: Returns null, falls back to dynamic loading
 * - Production: Uses generated embedded assets
 */

// Try to import generated assets (only exists after running prebuild)
let generatedAssets: {
    embeddedCss: Record<string, string>;
    getEmbeddedClientJs: (path: string) => string | null;
    loadEmbeddedClientJs: () => Promise<void>;
} | null = null;

try {
    // Dynamic import to handle missing file gracefully
    generatedAssets = await import('./embedded-assets.generated.ts');
} catch (error) {
    // File doesn't exist (development mode) - that's ok
    generatedAssets = null;
}

// Export embedded CSS (empty in development)
export const embeddedCss: Record<string, string> = generatedAssets?.embeddedCss || {};

// Export function to get embedded client JS
export function getEmbeddedClientJs(path: string): string | null {
    return generatedAssets?.getEmbeddedClientJs(path) || null;
}

// Export function to load embedded JS (no-op in development)
export async function loadEmbeddedClientJs(): Promise<void> {
    if (generatedAssets?.loadEmbeddedClientJs) {
        await generatedAssets.loadEmbeddedClientJs();
    }
}
