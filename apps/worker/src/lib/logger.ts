import type { Env } from '../env.js';

const levels = { debug: 10, info: 20, warn: 30, error: 40 };

export type Logger = ReturnType<typeof createLogger>;

export function createLogger(env: Env) {
  const min = levels[env.LOG_LEVEL] ?? levels.info;
  const log = (level: keyof typeof levels, ...args: unknown[]) => {
    if (levels[level] < min) return;
    const fn = level === 'error' ? console.error : console.log;
    fn(`[worker][${level}]`, ...args);
  };
  return {
    debug: (...a: unknown[]) => log('debug', ...a),
    info: (...a: unknown[]) => log('info', ...a),
    warn: (...a: unknown[]) => log('warn', ...a),
    error: (...a: unknown[]) => log('error', ...a),
  };
}
