/**
 * Journalisation structurée minimale (JSON une ligne par événement).
 *
 * Volontairement sans dépendance en Phase 1 ; remplaçable par pino en Phase 14
 * sans toucher aux appelants, puisque seule cette interface est exposée.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentThreshold(): number {
  const configured = (process.env.LOG_LEVEL ?? 'info') as Level;
  return LEVEL_WEIGHT[configured] ?? LEVEL_WEIGHT.info;
}

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVEL_WEIGHT[level] < currentThreshold()) return;

  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...context,
  };

  // eslint-disable-next-line no-console -- point de sortie unique des logs
  console[level === 'debug' ? 'log' : level](JSON.stringify(entry));
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};

/** Normalise une erreur inconnue en objet loggable, sans fuiter la stack en production. */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      ...(process.env.NODE_ENV === 'production' ? {} : { stack: error.stack }),
    };
  }
  return { errorMessage: String(error) };
}
