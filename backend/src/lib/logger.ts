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

/**
 * Champs dont la valeur ne doit jamais atteindre les journaux.
 *
 * La comparaison est faite sur le nom **en minuscules et sans séparateurs**,
 * pour que `passwordHash`, `password_hash` et `PASSWORD` tombent sous la même
 * règle. Une liste sensible à la casse laisse toujours passer la variante à
 * laquelle personne n'a pensé.
 */
const REDACTED_KEYS = [
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'passwordresettokenhash',
];

function isSensitive(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[-_\s]/g, '');
  return REDACTED_KEYS.some((sensitive) => normalised.includes(sensitive));
}

/**
 * Remplace les valeurs sensibles par un marqueur.
 *
 * Appliqué au **point de sortie unique**, et non à la charge de chaque
 * appelant. Rien ne fuite aujourd'hui, mais une protection qui repose sur la
 * vigilance de celui qui écrit `logger.error(...)` finit toujours par céder :
 * il suffit d'un contexte d'erreur enrichi un peu trop généreusement.
 *
 * Le nom du champ est conservé — remplacer la valeur suffit, et voir
 * « password: [rédigé] » dans un journal aide à comprendre ce qui s'est passé,
 * alors qu'un champ effacé laisse croire qu'il n'a jamais été transmis.
 */
function redact(value: unknown, depth = 0): unknown {
  // Les journaux ne sont pas un débogueur : une structure profonde est presque
  // toujours un objet entier passé par erreur, et la tronquer évite d'écrire un
  // document complet à chaque ligne.
  if (depth > 4) return '[profondeur maximale]';

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSensitive(key) ? '[rédigé]' : redact(nested, depth + 1);
    }
    return output;
  }

  return value;
}

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVEL_WEIGHT[level] < currentThreshold()) return;

  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
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
