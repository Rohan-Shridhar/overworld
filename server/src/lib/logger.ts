import { isTest } from '../config/constants.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
};

function formatContext(context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) return '';

  const pairs = Object.entries(context).map(([key, value]) => {
    if (value instanceof Error) return `${key}=${value.message}`;
    if (typeof value === 'object' && value !== null) return `${key}=${JSON.stringify(value)}`;
    return `${key}=${String(value)}`;
  });

  return ` ${pairs.join(' ')}`;
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  // Tests assert on responses, not stdout noise; errors stay visible.
  if (isTest() && level !== 'error') return;

  const line = `${new Date().toISOString()} ${LEVEL_LABELS[level]} ${message}${formatContext(context)}`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
};
