import { ContentStatus, ExcursionStatus, UserRole } from '@tourism/shared/constants';

import { CacheNamespace, cached } from '@/lib/cache';
import { Attraction, Excursion, Hotel, Restaurant, Room, User } from '@/models';

export interface PlatformStats {
  users: { total: number; admins: number; inactive: number };
  hotels: { total: number; published: number; drafts: number };
  rooms: { total: number; published: number };
  restaurants: { total: number; published: number };
  attractions: { total: number; published: number };
  excursions: { total: number; upcoming: number; seatsRemaining: number };
}

/**
 * Compteurs de l'écran d'accueil.
 *
 * Toutes les requêtes partent en parallèle : elles sont indépendantes, et les
 * enchaîner multiplierait la latence de la page par le nombre de compteurs.
 *
 * Le résultat est mis en cache une minute. Quatorze `countDocuments` sont
 * exécutés à chaque affichage de l'accueil du dashboard, page qu'un
 * administrateur recharge sans arrêt ; ce sont des compteurs indicatifs, dont
 * l'obsolescence d'une minute n'a aucune conséquence — le critère qui décide
 * de ce qui a le droit d'entrer dans le cache.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  return cached(CacheNamespace.STATS, 'platform', computePlatformStats, 60);
}

async function computePlatformStats(): Promise<PlatformStats> {
  const [
    totalUsers,
    adminUsers,
    inactiveUsers,
    totalHotels,
    publishedHotels,
    totalRooms,
    publishedRooms,
    totalRestaurants,
    publishedRestaurants,
    totalAttractions,
    publishedAttractions,
    totalExcursions,
    upcomingExcursions,
    seatsAggregate,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: UserRole.ADMIN }),
    User.countDocuments({ isActive: false }),
    Hotel.countDocuments({}),
    Hotel.countDocuments({ status: ContentStatus.PUBLISHED }),
    Room.countDocuments({}),
    Room.countDocuments({ status: ContentStatus.PUBLISHED }),
    Restaurant.countDocuments({}),
    Restaurant.countDocuments({ status: ContentStatus.PUBLISHED }),
    Attraction.countDocuments({}),
    Attraction.countDocuments({ status: ContentStatus.PUBLISHED }),
    Excursion.countDocuments({}),
    Excursion.countDocuments({
      status: ExcursionStatus.SCHEDULED,
      startsAt: { $gte: new Date() },
    }),
    Excursion.aggregate<{ total: number }>([
      { $match: { status: ExcursionStatus.SCHEDULED, startsAt: { $gte: new Date() } } },
      { $group: { _id: null, total: { $sum: '$availableSeats' } } },
    ]),
  ]);

  return {
    users: { total: totalUsers, admins: adminUsers, inactive: inactiveUsers },
    hotels: {
      total: totalHotels,
      published: publishedHotels,
      drafts: totalHotels - publishedHotels,
    },
    rooms: { total: totalRooms, published: publishedRooms },
    restaurants: { total: totalRestaurants, published: publishedRestaurants },
    attractions: { total: totalAttractions, published: publishedAttractions },
    excursions: {
      total: totalExcursions,
      upcoming: upcomingExcursions,
      seatsRemaining: seatsAggregate[0]?.total ?? 0,
    },
  };
}
