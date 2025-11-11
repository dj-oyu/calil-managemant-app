import {
    formatTimestamp,
    LEVEL_ICONS,
    LEVEL_TO_CONSOLE_METHOD,
    type LogLevel,
} from './common';

export type { LogLevel };

export interface LogEntry {
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

        // Also output to console using appropriate method
        const method = LEVEL_TO_CONSOLE_METHOD[level];
        const prefix = `[${level.toUpperCase()}]`;
        if (data !== undefined) {
            (console[method] as typeof console.log)(prefix, message, data);
        } else {
            (console[method] as typeof console.log)(prefix, message);
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
                const time = formatTimestamp(entry.timestamp);
                const levelIcon = LEVEL_ICONS[entry.level];

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
