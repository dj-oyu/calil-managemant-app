// Centralized logging system with in-memory storage

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    message: string;
    data?: any;
}

class Logger {
    private logs: LogEntry[] = [];
    private maxLogs = 500; // Keep last 500 logs

    log(level: LogLevel, message: string, data?: any) {
        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            message,
            data,
        };

        this.logs.push(entry);

        // Keep only the last maxLogs entries
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Also output to console
        const prefix = `[${level.toUpperCase()}]`;
        if (data !== undefined) {
            console.log(prefix, message, data);
        } else {
            console.log(prefix, message);
        }
    }

    info(message: string, data?: any) {
        this.log('info', message, data);
    }

    warn(message: string, data?: any) {
        this.log('warn', message, data);
    }

    error(message: string, data?: any) {
        this.log('error', message, data);
    }

    debug(message: string, data?: any) {
        this.log('debug', message, data);
    }

    getLogs(limit?: number): LogEntry[] {
        if (limit) {
            return this.logs.slice(-limit);
        }
        return [...this.logs];
    }

    clear() {
        this.logs = [];
        console.log('[LOGGER] Logs cleared');
    }

    formatForDisplay(): string {
        return this.logs
            .map((entry) => {
                const time = entry.timestamp.toISOString().substring(11, 23);
                const levelIcon = {
                    info: 'ℹ️',
                    warn: '⚠️',
                    error: '❌',
                    debug: '🔍',
                }[entry.level];

                let output = `${time} ${levelIcon} ${entry.message}`;
                if (entry.data !== undefined) {
                    const dataStr = typeof entry.data === 'object'
                        ? JSON.stringify(entry.data, null, 2)
                        : String(entry.data);
                    output += `\n${dataStr}`;
                }
                return output;
            })
            .join('\n\n');
    }
}

// Singleton instance
export const logger = new Logger();
