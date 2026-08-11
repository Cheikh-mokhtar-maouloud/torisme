/**
 * Concatène des classes conditionnelles.
 *
 * Volontairement minimal : pas de `clsx` ni de `tailwind-merge` en dépendance
 * pour une fonction de cinq lignes. Si des conflits de classes Tailwind
 * apparaissent (deux `px-*` sur le même élément), c'est le composant qu'il faut
 * revoir, pas l'outil de fusion.
 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
