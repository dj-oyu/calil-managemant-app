/**
 * Generate cache headers based on environment
 *
 * @param contentType - Content-Type header value
 * @param maxAge - Cache max-age in seconds (production only)
 * @param isDevelopment - Whether running in development mode
 * @returns Cache headers object
 *
 * @remarks
 * - Development: キャッシュ無効化（即座に変更が反映される）
 * - Production: 長期キャッシュ（パフォーマンス最適化）
 */
export function getCacheHeaders(
    contentType: string,
    maxAge: number = 31536000,
    isDevelopment: boolean = false,
): Record<string, string> {
    if (isDevelopment) {
        // 開発環境: キャッシュ無効化
        return {
            "Content-Type": contentType,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
        };
    } else {
        // 本番環境: 長期キャッシュ
        return {
            "Content-Type": contentType,
            "Cache-Control": `public, max-age=${maxAge}, immutable`,
            "X-Content-Type-Options": "nosniff",
        };
    }
}
