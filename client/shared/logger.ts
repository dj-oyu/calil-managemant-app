/**
 * Client-side logger with environment-aware log levels
 *
 * Features:
 * - Development: All logs (debug, info, warn, error)
 * - Production: Errors and warnings only
 * - Consistent formatting with emoji prefixes
 * - Type-safe logging methods
 *
 * @example
 * ```typescript
 * import { logger } from './shared/logger';
 *
 * logger.debug('Detailed debug info', { data });
 * logger.info('User action', { action });
 * logger.warn('Potential issue', { issue });
 * logger.error('Error occurred', { error });
 * ```
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
    /** Current environment */
    environment: 'development' | 'production';
    /** Minimum log level to display */
    minLevel: LogLevel;
}

class Logger {
    private config: LoggerConfig;
    private readonly levels: Record<LogLevel, number> = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
    };

    constructor() {
        // Get environment from meta tag
        const envMeta = document.querySelector('meta[name="app-environment"]');
        const environment = (envMeta?.getAttribute('content') || 'development') as 'development' | 'production';

        this.config = {
            environment,
            minLevel: environment === 'production' ? 'warn' : 'debug',
        };

        // Log initialization in development only
        if (this.shouldLog('info')) {
            console.info(`🔧 Logger initialized: ${environment} mode (min level: ${this.config.minLevel})`);
        }
    }

    /**
     * Check if log level should be displayed
     */
    private shouldLog(level: LogLevel): boolean {
        return this.levels[level] >= this.levels[this.config.minLevel];
    }

    /**
     * Format log message with timestamp
     */
    private formatMessage(level: LogLevel, message: string): string {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        return `[${timestamp}] ${message}`;
    }

    /**
     * Debug logs - Development only
     * Use for detailed information useful during development
     */
    debug(message: string, ...args: any[]): void {
        if (this.shouldLog('debug')) {
            console.log(this.formatMessage('debug', message), ...args);
        }
    }

    /**
     * Info logs - Development only
     * Use for general informational messages
     */
    info(message: string, ...args: any[]): void {
        if (this.shouldLog('info')) {
            console.info(this.formatMessage('info', message), ...args);
        }
    }

    /**
     * Warning logs - All environments
     * Use for potentially harmful situations
     */
    warn(message: string, ...args: any[]): void {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', `⚠️ ${message}`), ...args);
        }
    }

    /**
     * Error logs - All environments
     * Use for error events that might still allow the app to continue
     */
    error(message: string, error?: Error | unknown, ...args: any[]): void {
        if (this.shouldLog('error')) {
            const formattedMsg = this.formatMessage('error', `❌ ${message}`);

            if (error instanceof Error) {
                console.error(formattedMsg, {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                    ...args,
                });
            } else if (error !== undefined) {
                console.error(formattedMsg, error, ...args);
            } else {
                console.error(formattedMsg, ...args);
            }
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
