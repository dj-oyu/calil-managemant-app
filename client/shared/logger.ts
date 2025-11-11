import {
    type BaseLoggerConfig,
    formatTimestamp,
    LEVEL_ICONS,
    LEVEL_TO_CONSOLE_METHOD,
    type LogLevel,
    shouldLog,
} from '../../src/shared/logging/common';

interface LoggerConfig extends BaseLoggerConfig {
    environment: 'development' | 'production';
}

class Logger {
    private config: LoggerConfig;

    constructor() {
            // Get environment from meta tag
            const envMeta = document.querySelector('meta[name="app-environment"]');
            const environment = (envMeta?.getAttribute('content') || 'development') as 'development' | 'production';

            this.config = {
                environment,
                minLevel: environment === 'production' ? 'warn' : 'debug',
            };

            // Log initialization in development only
            if (shouldLog('info', this.config.minLevel)) {
                console.info(`🔧 Logger initialized: ${environment} mode (min level: ${this.config.minLevel})`);
            }
        }

    /**
     * Format log message with timestamp
     */
    private formatMessage(level: LogLevel, message: string): string {
        const timestamp = formatTimestamp();
        return `[${timestamp}] ${message}`;
    }

    private emit(level: LogLevel, message: string, args: unknown[]): void {
        const method = LEVEL_TO_CONSOLE_METHOD[level];
        (console[method] as typeof console.log)(this.formatMessage(level, message), ...args);
    }

    /**
     * Debug logs - Development only
     * Use for detailed information useful during development
     */
    debug(message: string, ...args: any[]): void {
        if (shouldLog('debug', this.config.minLevel)) {
            this.emit('debug', message, args);
        }
    }

    /**
     * Info logs - Development only
     * Use for general informational messages
     */
    info(message: string, ...args: any[]): void {
        if (shouldLog('info', this.config.minLevel)) {
            this.emit('info', message, args);
        }
    }

    /**
     * Warning logs - All environments
     * Use for potentially harmful situations
     */
    warn(message: string, ...args: any[]): void {
        if (shouldLog('warn', this.config.minLevel)) {
            this.emit('warn', `${LEVEL_ICONS.warn} ${message}`, args);
        }
    }

    /**
     * Error logs - All environments
     * Use for error events that might still allow the app to continue
     */
    error(message: string, error?: Error | unknown, ...args: any[]): void {
        if (!shouldLog('error', this.config.minLevel)) {
            return;
        }

        const formattedMsg = `${LEVEL_ICONS.error} ${message}`;
        if (error instanceof Error) {
            this.emit('error', formattedMsg, [
                {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                    ...args,
                },
            ]);
        } else if (error !== undefined) {
            this.emit('error', formattedMsg, [error, ...args]);
        } else {
            this.emit('error', formattedMsg, args);
        }
    }

    /**
     * Get current configuration
     */
    getConfig(): LoggerConfig {
        return { ...this.config };
    }

    /**
     * Check if in development mode
     */
    isDevelopment(): boolean {
        return this.config.environment === 'development';
    }

    /**
     * Check if in production mode
     */
    isProduction(): boolean {
        return this.config.environment === 'production';
    }
}

// Export singleton instance
export const logger = new Logger();

// Expose to window for debugging (development only)
if (logger.isDevelopment()) {
    (window as any).logger = logger;
}
