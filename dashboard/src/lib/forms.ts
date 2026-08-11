/**
 * État partagé par toutes les server actions de formulaire.
 *
 * Les erreurs par champ viennent de l'API (`error.fields`) : le dashboard ne
 * duplique pas les règles de validation, il affiche celles du serveur — seule
 * source qui fasse autorité.
 */
export interface FormState {
  status: 'idle' | 'error';
  message?: string;
  fields?: Record<string, string[]>;
}

export const IDLE_FORM_STATE: FormState = { status: 'idle' };

/** Lit une valeur texte, en renvoyant `undefined` pour une saisie vide. */
export function text(data: FormData, name: string): string | undefined {
  const value = data.get(name);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Lit un nombre. Une saisie non numérique renvoie `undefined` et sera rejetée par l'API. */
export function number(data: FormData, name: string): number | undefined {
  const value = text(data, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function boolean(data: FormData, name: string): boolean {
  return data.get(name) === 'on' || data.get(name) === 'true';
}

/**
 * Lit une liste saisie sous forme de valeurs séparées par des virgules
 * (équipements, types de cuisine…). Les entrées vides sont écartées.
 */
export function list(data: FormData, name: string): string[] {
  const value = text(data, name);
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
