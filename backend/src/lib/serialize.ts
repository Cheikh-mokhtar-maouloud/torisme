import { Types } from 'mongoose';

/**
 * Convertit un document brut (issu de `.lean()`) en objet transportable par JSON.
 *
 * `.lean()` court-circuite la transformation `toJSON` du schéma : les `_id` et
 * les `Date` en ressortent tels quels. Cette fonction rétablit le contrat
 * attendu par les clients : `_id` devient `id`, les ObjectId deviennent des
 * chaînes, et les dates des chaînes ISO 8601.
 */
export function serializeDocument<T = Record<string, unknown>>(input: unknown): T {
  return normalize(input) as T;
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (value instanceof Types.ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) return value.map(normalize);

  // Les Buffer (Binary) ne doivent pas être parcourus champ par champ.
  if (typeof value === 'object') {
    if (Buffer.isBuffer(value)) return value.toString('base64');

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(source)) {
      if (key === '_id') {
        result.id = normalize(entry);
        continue;
      }
      if (key === '__v' || key === 'passwordHash') continue;
      result[key] = normalize(entry);
    }

    return result;
  }

  return value;
}
