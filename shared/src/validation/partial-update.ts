import { z } from 'zod';

/**
 * Construit un schéma de mise à jour partielle à partir d'un schéma de création.
 *
 * `.partial()` seul ne suffit pas : en Zod, un champ portant un `.default()`
 * reste optionnel **mais produit sa valeur par défaut** quand la clé est
 * absente. Un `PUT { images: [...] }` sur un hôtel renvoyait donc aussi
 * `status: 'DRAFT'`, `amenities: []` et `rules: []`, que le service écrivait
 * ensuite en base par `$set`.
 *
 * Concrètement : mettre à jour la galerie d'un hôtel le **dépubliait** et
 * effaçait ses équipements, sans la moindre erreur. Le cas a été rencontré en
 * Phase 7, lors du branchement du gestionnaire d'images.
 *
 * Cette fonction retire la valeur par défaut avant de rendre le champ
 * optionnel : une clé absente reste absente, et n'est donc jamais écrite.
 */
export function partialUpdateSchema<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
): ReturnType<z.ZodObject<Shape>['partial']> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, field] of Object.entries(schema.shape)) {
    shape[key] = stripDefault(field as z.ZodTypeAny).optional();
  }

  /*
   * Le type annoncé est celui de `.partial()` : côté TypeScript, les deux
   * produisent exactement la même forme — tous les champs optionnels. Seul le
   * comportement à l'exécution diffère, et c'est précisément ce qu'on corrige.
   * La conversion est donc sûre, et évite de réimplémenter la cartographie de
   * types de Zod.
   */
  return z.object(shape) as unknown as ReturnType<z.ZodObject<Shape>['partial']>;
}

/** Déballe les `.default()`, y compris imbriqués. */
function stripDefault(field: z.ZodTypeAny): z.ZodTypeAny {
  let current = field;

  while (current instanceof z.ZodDefault) {
    current = current.unwrap() as z.ZodTypeAny;
  }

  return current;
}
