import type { Category as CategoryDto } from '@tourism/shared/types';
import type {
  CategoryListQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@tourism/shared/validation';

import { CacheNamespace, cached, invalidate } from '@/lib/cache';
import { HttpError } from '@/lib/errors';
import { paginateQuery, type PaginatedResult } from '@/lib/query';
import { serializeDocument } from '@/lib/serialize';
import { Attraction, Category, Restaurant } from '@/models';

/**
 * Liste les catégories.
 *
 * Mise en cache : elles changent quelques fois par an et sont lues à chaque
 * ouverture d'un écran de filtres, côté mobile comme dashboard.
 *
 * La clé inclut **`isAdmin`**. Ce point est le plus important de toute la
 * couche de cache : l'administrateur voit aussi les catégories désactivées.
 * Une clé qui l'ignorerait servirait au public la réponse mise en cache par un
 * administrateur, exposant du contenu volontairement masqué — la fuite
 * classique des caches mal découpés.
 */
export async function listCategories(
  query: CategoryListQuery,
  isAdmin: boolean,
): Promise<PaginatedResult<CategoryDto>> {
  const key = [
    isAdmin ? 'admin' : 'public',
    query.appliesTo ?? 'all',
    String(query.isActive),
    query.page,
    query.limit,
  ].join(':');

  return cached(CacheNamespace.CATEGORY, key, () => listCategoriesFromDb(query, isAdmin), 300);
}

async function listCategoriesFromDb(
  query: CategoryListQuery,
  isAdmin: boolean,
): Promise<PaginatedResult<CategoryDto>> {
  const filter: Record<string, unknown> = {};

  if (query.appliesTo) filter.appliesTo = query.appliesTo;

  // Le public ne voit que les catégories actives ; l'administrateur peut filtrer.
  if (isAdmin) {
    if (query.isActive !== undefined) filter.isActive = query.isActive;
  } else {
    filter.isActive = true;
  }

  return paginateQuery(
    Category,
    filter,
    { page: query.page, limit: query.limit, sort: { appliesTo: 1, name: 1 } },
    (doc) => serializeDocument<CategoryDto>(doc),
  );
}

export async function createCategory(input: CreateCategoryInput): Promise<CategoryDto> {
  // L'index unique (appliesTo, slug) fait foi ; ce contrôle sert seulement à
  // renvoyer un message explicite plutôt qu'une erreur de clé dupliquée.
  const existing = await Category.exists({ appliesTo: input.appliesTo, slug: input.slug });
  if (existing) {
    throw HttpError.conflict(`Une catégorie « ${input.slug} » existe déjà pour ce type de lieu`);
  }

  const created = await Category.create(input);
  await invalidate(CacheNamespace.CATEGORY);
  return serializeDocument<CategoryDto>(created.toObject());
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<CategoryDto> {
  const updated = await Category.findByIdAndUpdate(
    id,
    { $set: input },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) throw HttpError.notFound('Catégorie introuvable');

  /*
   * Invalidation **attendue**, contrairement à l'écriture dans le cache. Rendre
   * la main avant la purge laisserait une fenêtre où l'administrateur, revenant
   * à la liste, verrait encore l'ancienne valeur — et conclurait que sa
   * modification n'a pas été enregistrée.
   */
  await invalidate(CacheNamespace.CATEGORY);

  return serializeDocument<CategoryDto>(updated);
}

/**
 * Une catégorie encore rattachée à des fiches n'est pas supprimée : cela
 * laisserait des références mortes dans `categoryIds`. L'administrateur la
 * désactive, ce qui la retire des filtres sans casser les fiches existantes.
 */
export async function deleteCategory(id: string): Promise<void> {
  const [restaurantCount, attractionCount] = await Promise.all([
    Restaurant.countDocuments({ categoryIds: id }),
    Attraction.countDocuments({ categoryIds: id }),
  ]);

  const usageCount = restaurantCount + attractionCount;
  if (usageCount > 0) {
    throw HttpError.conflict(
      `Cette catégorie est utilisée par ${usageCount} fiche(s). Désactivez-la plutôt que de la supprimer.`,
    );
  }

  const deleted = await Category.findByIdAndDelete(id).lean();
  if (!deleted) throw HttpError.notFound('Catégorie introuvable');

  await invalidate(CacheNamespace.CATEGORY);
}
