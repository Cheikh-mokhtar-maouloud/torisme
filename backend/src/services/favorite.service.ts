import { MongoServerError } from 'mongodb';
import type { Model } from 'mongoose';

import { ContentStatus, PlaceType } from '@tourism/shared/constants';
import type { Favorite as FavoriteDto } from '@tourism/shared/types';
import type { CreateFavoriteInput, FavoriteListQuery } from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { buildPaginationMeta } from '@/lib/api-response';
import { serializeDocument } from '@/lib/serialize';
import { Attraction, Excursion, Favorite, Hotel, Restaurant } from '@/models';

/**
 * Favori enrichi de sa cible.
 *
 * La liste des favoris doit être affichable telle quelle : renvoyer de simples
 * identifiants obligerait l'application à lancer une requête par entrée, soit
 * une dizaine d'allers-retours pour un écran, sur un réseau mobile.
 */
export interface FavoriteWithTarget extends FavoriteDto {
  target: {
    id: string;
    name: string;
    city: string;
    imageUrl?: string;
    rating: number;
    reviewCount: number;
    price?: number;
    currency?: string;
    /** Vrai si la fiche n'est plus publiée : le favori devient inactif. */
    unavailable: boolean;
  } | null;
}

/**
 * Vue minimale d'une cible de favori : seuls ces champs sont lus, et ils sont
 * communs aux quatre collections malgré des schémas par ailleurs distincts.
 */
interface FavoriteTarget {
  rating: number;
  reviewCount: number;
}

interface TargetSpec {
  model: Model<FavoriteTarget>;
  nameField: string;
  cityField: string;
  priceField?: string;
  /** Les excursions n'utilisent pas `ContentStatus`. */
  publishedFilter: Record<string, unknown>;
}

const TARGETS: Record<PlaceType, TargetSpec> = {
  [PlaceType.HOTEL]: {
    model: Hotel as unknown as Model<FavoriteTarget>,
    nameField: 'name',
    cityField: 'address.city',
    priceField: 'minPricePerNight',
    publishedFilter: { status: ContentStatus.PUBLISHED },
  },
  [PlaceType.RESTAURANT]: {
    model: Restaurant as unknown as Model<FavoriteTarget>,
    nameField: 'name',
    cityField: 'address.city',
    publishedFilter: { status: ContentStatus.PUBLISHED },
  },
  [PlaceType.ATTRACTION]: {
    model: Attraction as unknown as Model<FavoriteTarget>,
    nameField: 'name',
    cityField: 'address.city',
    priceField: 'entryFee',
    publishedFilter: { status: ContentStatus.PUBLISHED },
  },
  [PlaceType.EXCURSION]: {
    model: Excursion as unknown as Model<FavoriteTarget>,
    nameField: 'title',
    cityField: 'destination',
    priceField: 'price',
    publishedFilter: { status: { $ne: 'CANCELLED' } },
  },
};

export async function addFavorite(
  userId: string,
  input: CreateFavoriteInput,
): Promise<FavoriteDto> {
  const spec = TARGETS[input.targetType];

  const exists = await spec.model.exists({ _id: input.targetId });
  if (!exists) throw HttpError.notFound('Ce lieu est introuvable');

  try {
    const created = await Favorite.create({
      userId,
      targetType: input.targetType,
      targetId: input.targetId,
    });
    return serializeDocument<FavoriteDto>(created.toObject());
  } catch (error) {
    /*
     * 11000 : le favori existe déjà. Ce n'est pas une erreur du point de vue de
     * l'utilisateur — il voulait que le lieu soit en favori, il l'est. On
     * renvoie l'existant, ce qui rend l'opération idempotente et évite qu'un
     * double appui affiche un message d'échec.
     */
    if (error instanceof MongoServerError && error.code === 11000) {
      const existing = await Favorite.findOne({
        userId,
        targetType: input.targetType,
        targetId: input.targetId,
      }).lean();

      if (existing) return serializeDocument<FavoriteDto>(existing);
    }
    throw error;
  }
}

export async function removeFavorite(
  userId: string,
  targetType: PlaceType,
  targetId: string,
): Promise<void> {
  // Le filtre porte sur `userId` : impossible de retirer le favori d'un autre.
  await Favorite.deleteOne({ userId, targetType, targetId });
}

export async function listFavorites(
  userId: string,
  query: FavoriteListQuery,
): Promise<{ items: FavoriteWithTarget[]; meta: ReturnType<typeof buildPaginationMeta> }> {
  const filter: Record<string, unknown> = { userId };
  if (query.targetType) filter.targetType = query.targetType;

  const skip = (query.page - 1) * query.limit;

  const [total, favorites] = await Promise.all([
    Favorite.countDocuments(filter),
    Favorite.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
  ]);

  /*
   * Les cibles sont chargées **par type**, en une requête chacune plutôt qu'une
   * par favori : quatre requêtes au maximum, quel que soit le nombre d'entrées.
   * C'est ce qui évite le N+1 classique sur ce genre d'écran.
   */
  const idsByType = new Map<PlaceType, string[]>();
  for (const favorite of favorites) {
    const type = favorite.targetType as PlaceType;
    idsByType.set(type, [...(idsByType.get(type) ?? []), String(favorite.targetId)]);
  }

  const targetsByKey = new Map<string, FavoriteWithTarget['target']>();

  await Promise.all(
    [...idsByType.entries()].map(async ([type, ids]) => {
      const spec = TARGETS[type];

      // Projection resserrée : une carte de favori n'affiche qu'un nom, une
      // ville, une vignette et un prix.
      const projection: Record<string, 1> = {
        [spec.nameField]: 1,
        [spec.cityField]: 1,
        images: 1,
        rating: 1,
        reviewCount: 1,
        currency: 1,
        status: 1,
        ...(spec.priceField ? { [spec.priceField]: 1 } : {}),
      };

      const documents = await spec.model.find({ _id: { $in: ids } }, projection).lean();

      for (const document of documents as unknown as Record<string, unknown>[]) {
        const isPublished = matchesFilter(document, spec.publishedFilter);
        const images = (document.images ?? []) as { url: string; order: number }[];
        const cover = [...images].sort((a, b) => a.order - b.order)[0];
        const price = spec.priceField
          ? (readPath(document, spec.priceField) as number | undefined)
          : undefined;

        targetsByKey.set(`${type}:${String(document._id)}`, {
          id: String(document._id),
          name: String(readPath(document, spec.nameField) ?? ''),
          city: String(readPath(document, spec.cityField) ?? ''),
          ...(cover ? { imageUrl: cover.url } : {}),
          rating: Number(document.rating ?? 0),
          reviewCount: Number(document.reviewCount ?? 0),
          ...(price ? { price } : {}),
          ...(document.currency ? { currency: String(document.currency) } : {}),
          unavailable: !isPublished,
        });
      }
    }),
  );

  const items: FavoriteWithTarget[] = favorites.map((favorite) => ({
    ...serializeDocument<FavoriteDto>(favorite),
    // `null` si la fiche a été supprimée : l'application affiche alors une
    // entrée neutralisée plutôt que de planter sur une donnée absente.
    target: targetsByKey.get(`${favorite.targetType}:${String(favorite.targetId)}`) ?? null,
  }));

  return { items, meta: buildPaginationMeta(query.page, query.limit, total) };
}

/** Lit un chemin pointé (`address.city`) dans un document brut. */
function readPath(document: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) => (value as Record<string, unknown> | undefined)?.[key],
      document,
    );
}

/** Évalue le filtre de publication sans repasser par MongoDB. */
function matchesFilter(
  document: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = readPath(document, key);
    if (expected && typeof expected === 'object' && '$ne' in expected) {
      return actual !== (expected as { $ne: unknown }).$ne;
    }
    return actual === expected;
  });
}
