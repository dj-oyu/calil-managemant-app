import type { FC } from "hono/jsx";
import type { LogEntry } from "../../../shared/logging/logger";

export const LogViewerPage: FC<{ logs: LogEntry[] }> = ({ logs }) => (
    <html lang="ja">
        <head>
            <meta charSet="utf-8" />
            <title>Application Logs</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="stylesheet" href="/public/styles/logs.css" />
        </head>
        <body>
            <header>
                <h1>📋 Application Logs</h1>
                <div class="controls">
                    <a href="/log">🔄 Refresh</a>
                    <a href="/log?limit=50">Last 50</a>
                    <a href="/log?limit=100">Last 100</a>
                    <button onclick="fetch('/log/clear', {method: 'POST'}).then(() => location.reload())">
                        🗑️ Clear Logs
                    </button>
                    <a href="/">← Back to List</a>
                </div>
            </header>
            <main>
                {logs.length === 0 ? (
                    <div class="empty">No logs yet</div>
                ) : (
                    logs.map((entry) => {
                        const levelIcon = {
                            info: "ℹ️",
                            warn: "⚠️",
                            error: "❌",
                            debug: "🔍",
                        }[entry.level];

                        return (
                            <div class="log-entry">
                                <div class="log-header">
                                    <span class="log-time">
                                        {entry.timestamp.toISOString()}
                                    </span>
                                    <span class={`log-level ${entry.level}`}>
                                        {levelIcon} {entry.level.toUpperCase()}
                                    </span>
                                </div>
                                <div class="log-message">{entry.message}</div>
                                {entry.data !== undefined && (
                                    <div class="log-data">
                                        <pre>
                                            {typeof entry.data === "object"
                                                ? JSON.stringify(
                                                      entry.data,
                                                      null,
                                                      2,
                                                  )
                                                : String(entry.data)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </main>
        </body>
    </html>
);
