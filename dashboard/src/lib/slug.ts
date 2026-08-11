/**
 * Marques diacritiques combinantes (U+0300 à U+036F).
 *
 * Construite via `RegExp` plutôt qu'écrite en littéral : une classe contenant
 * les caractères eux-mêmes est invisible à la relecture et se corrompt au
 * moindre passage par un outil qui réencode le fichier.
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * Transforme un libellé en identifiant d'URL.
 *
 * « Cuisine traditionnelle » → « cuisine-traditionnelle »
 * « Désert »                 → « desert »
 *
 * La décomposition NFD sépare « é » en « e » + accent, que l'on supprime
 * ensuite. Sans cette étape, « Désert » donnerait « d-sert », le « é » n'étant
 * pas dans `[a-z0-9]`.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
