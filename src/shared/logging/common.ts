export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVEL_WEIGHTS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

export const LEVEL_ICONS: Record<LogLevel, string> = {
    debug: '🔍',
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
};

export const LEVEL_TO_CONSOLE_METHOD: Record<LogLevel, 'log' | 'info' | 'warn' | 'error'> = {
    debug: 'log',
    info: 'info',
    warn: 'warn',
    error: 'error',
};

export interface BaseLoggerConfig {
    minLevel: LogLevel;
}

export const formatTimestamp = (date: Date = new Date()): string => {
    return date.toISOString().split('T')[1]!.split('.')[0]!;
};

export const shouldLog = (level: LogLevel, minLevel: LogLevel): boolean => {
    return LOG_LEVEL_WEIGHTS[level] >= LOG_LEVEL_WEIGHTS[minLevel];
};
