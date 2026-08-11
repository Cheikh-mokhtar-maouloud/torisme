/**
 * Jeu de données de développement.
 *
 * Usage : `npm run seed --workspace backend`
 *
 * Le script est **idempotent** : il vide les collections concernées avant de
 * les réécrire. Il refuse de s'exécuter en production, où il détruirait des
 * données réelles.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.local') });

import {
  ContentStatus,
  Currency,
  ExcursionStatus,
  PlaceType,
  UserRole,
} from '@tourism/shared/constants';

import { connectToDatabase, disconnectFromDatabase } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth/password';
import { Attraction, Category, Excursion, Hotel, Restaurant, Room, User } from '../src/models';

/* eslint-disable no-console -- script de développement, sortie destinée au terminal */

/**
 * Images de démonstration.
 *
 * Le téléversement réel arrive en Phase 7 ; en attendant, ces URL pointent vers
 * un service de photos d'exemple. Elles rendent l'application évaluable
 * visuellement, et le repli « Photo à venir » reste testable sur les fiches
 * volontairement laissées sans image.
 */
const demoImages = (seed: string, count = 3) =>
  Array.from({ length: count }, (_, index) => ({
    url: `https://picsum.photos/seed/${seed}-${index}/1200/800`,
    alt: undefined,
    width: 1200,
    height: 800,
    order: index,
  }));

async function seed(): Promise<void> {
  if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production') {
    throw new Error('Le seed est interdit en production.');
  }

  await connectToDatabase();
  console.log('Connexion établie, nettoyage des collections…');

  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Hotel.deleteMany({}),
    Room.deleteMany({}),
    Restaurant.deleteMany({}),
    Attraction.deleteMany({}),
    Excursion.deleteMany({}),
  ]);

  /* --- Utilisateurs -------------------------------------------------------- */
  const [admin, tourist] = await User.create([
    {
      fullName: 'Administrateur',
      email: 'admin@tourism.mr',
      passwordHash: await hashPassword('Admin123!'),
      role: UserRole.ADMIN,
      isActive: true,
    },
    {
      fullName: 'Fatimetou Sidi',
      email: 'touriste@example.com',
      passwordHash: await hashPassword('Touriste123!'),
      role: UserRole.USER,
      isActive: true,
    },
  ]);

  /* --- Catégories ---------------------------------------------------------- */
  const categories = await Category.create([
    { name: 'Plage', slug: 'plage', appliesTo: PlaceType.ATTRACTION },
    { name: 'Patrimoine', slug: 'patrimoine', appliesTo: PlaceType.ATTRACTION },
    { name: 'Désert', slug: 'desert', appliesTo: PlaceType.ATTRACTION },
    { name: 'Cuisine traditionnelle', slug: 'traditionnel', appliesTo: PlaceType.RESTAURANT },
    { name: 'Fruits de mer', slug: 'fruits-de-mer', appliesTo: PlaceType.RESTAURANT },
  ]);

  const byCategorySlug = new Map(categories.map((category) => [category.slug, category._id]));

  /** Récupère l'identifiant d'une catégorie ; échoue si le slug est inconnu, afin
   *  qu'une faute de frappe dans ce script ne produise pas un `categoryIds: [undefined]`. */
  const categoryId = (slug: string) => {
    const id = byCategorySlug.get(slug);
    if (!id) throw new Error(`Catégorie « ${slug} » absente du seed`);
    return id;
  };

  /* --- Hôtels et chambres --------------------------------------------------- */
  // Coordonnées réelles, en GeoJSON : [longitude, latitude].
  const hotels = await Hotel.create([
    {
      name: 'Hôtel Atlantique Nouakchott',
      images: demoImages('hotel-atlantique', 4),
      description:
        "Hôtel en bord de mer offrant une vue sur l'océan Atlantique, à quinze minutes du centre-ville et de l'aéroport international.",
      address: {
        line1: 'Avenue du Général de Gaulle',
        city: 'Nouakchott',
        country: 'Mauritanie',
        countryCode: 'MR',
      },
      location: { type: 'Point', coordinates: [-15.9785, 18.0858] },
      stars: 4,
      amenities: ['wifi', 'piscine', 'restaurant', 'parking', 'climatisation'],
      rules: ['Non-fumeur', 'Animaux non admis'],
      checkInTime: '14:00',
      checkOutTime: '12:00',
      phone: '+22245250000',
      currency: Currency.MRU,
      status: ContentStatus.PUBLISHED,
      rating: 4.3,
      reviewCount: 128,
    },
    {
      name: 'Auberge du Banc d’Arguin',
      images: demoImages('hotel-arguin', 3),
      description:
        "Auberge familiale à proximité du parc national du Banc d'Arguin, point de départ idéal pour l'observation des oiseaux migrateurs.",
      address: { city: 'Nouadhibou', country: 'Mauritanie', countryCode: 'MR' },
      location: { type: 'Point', coordinates: [-17.0347, 20.9319] },
      stars: 3,
      amenities: ['wifi', 'restaurant', 'parking'],
      checkInTime: '15:00',
      checkOutTime: '11:00',
      currency: Currency.MRU,
      status: ContentStatus.PUBLISHED,
      rating: 4.1,
      reviewCount: 42,
    },
    {
      name: 'Résidence Chinguetti (brouillon)',
      description:
        "Fiche encore en préparation : elle ne doit pas apparaître dans les listes publiques tant qu'elle n'est pas publiée.",
      address: { city: 'Chinguetti', country: 'Mauritanie', countryCode: 'MR' },
      location: { type: 'Point', coordinates: [-12.3597, 20.4634] },
      currency: Currency.MRU,
      status: ContentStatus.DRAFT,
    },
  ]);

  const atlantique = hotels[0]!;
  const auberge = hotels[1]!;

  await Room.create([
    {
      hotelId: atlantique._id,
      name: 'Chambre Double Vue Mer',
      images: demoImages('room-vuemer', 3),
      description: "Chambre de 28 m² avec balcon donnant sur l'océan, lit double et bureau.",
      capacity: 2,
      bedCount: 1,
      amenities: ['wifi', 'climatisation', 'coffre-fort', 'télévision'],
      pricePerNight: 18_000,
      currency: Currency.MRU,
      totalUnits: 12,
      status: ContentStatus.PUBLISHED,
    },
    {
      hotelId: atlantique._id,
      name: 'Suite Familiale',
      images: demoImages('room-suite', 3),
      description: 'Suite de 45 m² avec deux chambres séparées et un salon, adaptée aux familles.',
      capacity: 4,
      bedCount: 3,
      amenities: ['wifi', 'climatisation', 'cuisine', 'télévision'],
      pricePerNight: 32_000,
      currency: Currency.MRU,
      totalUnits: 4,
      status: ContentStatus.PUBLISHED,
    },
    {
      hotelId: auberge._id,
      name: 'Chambre Standard',
      images: demoImages('room-standard', 2),
      description: 'Chambre simple et fonctionnelle avec salle d’eau privative.',
      capacity: 2,
      bedCount: 2,
      amenities: ['wifi', 'ventilateur'],
      pricePerNight: 9_500,
      currency: Currency.MRU,
      totalUnits: 8,
      status: ContentStatus.PUBLISHED,
    },
  ]);

  // Le prix minimum affiché sur la fiche hôtel est dérivé des chambres publiées.
  for (const hotel of [atlantique, auberge]) {
    const [cheapest] = await Room.find({ hotelId: hotel._id, status: ContentStatus.PUBLISHED })
      .sort({ pricePerNight: 1 })
      .limit(1)
      .lean();
    await Hotel.findByIdAndUpdate(hotel._id, {
      $set: { minPricePerNight: cheapest?.pricePerNight ?? null },
    });
  }

  /* --- Restaurants ---------------------------------------------------------- */
  await Restaurant.create([
    {
      name: 'Le Petit Poisson',
      images: demoImages('resto-poisson', 3),
      description:
        'Restaurant de fruits de mer installé face au port de pêche, spécialisé dans le poisson grillé du jour.',
      address: { city: 'Nouakchott', country: 'Mauritanie', countryCode: 'MR' },
      location: { type: 'Point', coordinates: [-16.0202, 18.0261] },
      cuisineTypes: ['fruits de mer', 'mauritanienne'],
      priceRange: 2,
      phone: '+22246000000',
      openingHours: {
        '1': [
          { open: '12:00', close: '15:00' },
          { open: '19:00', close: '23:00' },
        ],
      },
      categoryIds: [categoryId('fruits-de-mer')],
      status: ContentStatus.PUBLISHED,
      rating: 4.5,
      reviewCount: 67,
    },
    {
      name: 'Chez Mariem',
      images: demoImages('resto-mariem', 2),
      description:
        'Cuisine mauritanienne traditionnelle servie dans un cadre familial : méchoui, thieboudienne et thé à la menthe.',
      address: { city: 'Nouakchott', country: 'Mauritanie', countryCode: 'MR' },
      location: { type: 'Point', coordinates: [-15.9712, 18.0794] },
      cuisineTypes: ['mauritanienne', 'traditionnelle'],
      priceRange: 1,
      categoryIds: [categoryId('traditionnel')],
      status: ContentStatus.PUBLISHED,
      rating: 4.7,
      reviewCount: 203,
    },
  ]);

  /* --- Attractions ---------------------------------------------------------- */
  await Attraction.create([
    {
      name: "Parc national du Banc d'Arguin",
      images: demoImages('attr-arguin', 4),
      description:
        "Réserve inscrite au patrimoine mondial de l'UNESCO, l'une des plus importantes zones d'hivernage pour les oiseaux migrateurs d'Europe.",
      address: { city: 'Nouadhibou', country: 'Mauritanie', countryCode: 'MR' },
      location: { type: 'Point', coordinates: [-16.4167, 19.8833] },
      categoryIds: [categoryId('patrimoine')],
      entryFee: 2_000,
      currency: Currency.MRU,
      status: ContentStatus.PUBLISHED,
      rating: 4.8,
      reviewCount: 89,
    },
    {
      name: 'Vieille ville de Chinguetti',
      images: demoImages('attr-chinguetti', 4),
      description:
        "Septième ville sainte de l'islam, célèbre pour ses bibliothèques manuscrites et son architecture de pierre sèche.",
      address: { city: 'Chinguetti', country: 'Mauritanie', countryCode: 'MR' },
      location: { type: 'Point', coordinates: [-12.3597, 20.4634] },
      categoryIds: [categoryId('patrimoine'), categoryId('desert')],
      entryFee: 1_500,
      currency: Currency.MRU,
      status: ContentStatus.PUBLISHED,
      rating: 4.9,
      reviewCount: 156,
    },
    {
      name: 'Plage de Nouakchott',
      description:
        "Longue plage de sable au bord de l'Atlantique, animée en fin de journée par le retour des pirogues de pêche.",
      address: { city: 'Nouakchott', country: 'Mauritanie', countryCode: 'MR' },
      location: { type: 'Point', coordinates: [-16.0308, 18.0208] },
      categoryIds: [categoryId('plage')],
      status: ContentStatus.PUBLISHED,
      rating: 4.2,
      reviewCount: 74,
    },
  ]);

  /* --- Excursions ----------------------------------------------------------- */
  const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await Excursion.create([
    {
      title: 'Train du désert : Nouadhibou – Zouérat',
      images: demoImages('exc-train', 3),
      description:
        "Voyage à bord de l'un des plus longs trains du monde, à travers le désert mauritanien. Départ en fin de journée, nuit à la belle étoile.",
      destination: 'Zouérat',
      departureLocation: { type: 'Point', coordinates: [-17.0347, 20.9319] },
      departureAddress: { city: 'Nouadhibou', country: 'Mauritanie', countryCode: 'MR' },
      itinerary: [
        { time: '15:00', title: 'Rendez-vous à la gare', description: 'Briefing et équipement' },
        { time: '16:30', title: 'Départ du train' },
        { time: '08:00', title: 'Arrivée à Zouérat' },
      ],
      durationMinutes: 16 * 60,
      startsAt: inDays(14),
      price: 25_000,
      currency: Currency.MRU,
      totalSeats: 20,
      availableSeats: 20,
      guideName: 'Sidi Ould Ahmed',
      status: ExcursionStatus.SCHEDULED,
    },
    {
      title: 'Découverte de l’Adrar',
      images: demoImages('exc-adrar', 3),
      description:
        'Trois jours entre Atar, Chinguetti et Ouadane : dunes, oasis et bibliothèques anciennes.',
      destination: 'Atar',
      departureLocation: { type: 'Point', coordinates: [-13.0486, 20.5169] },
      departureAddress: { city: 'Atar', country: 'Mauritanie', countryCode: 'MR' },
      itinerary: [
        { time: '07:00', title: 'Départ d’Atar' },
        { title: 'Nuit en campement à Chinguetti' },
        { title: 'Ouadane et retour' },
      ],
      durationMinutes: 3 * 24 * 60,
      startsAt: inDays(30),
      price: 65_000,
      currency: Currency.MRU,
      totalSeats: 12,
      availableSeats: 5,
      guideName: 'Mariem Mint Baba',
      status: ExcursionStatus.SCHEDULED,
    },
    {
      title: 'Excursion passée (test)',
      description:
        'Excursion dont la date est révolue : elle ne doit pas apparaître dans la liste publique par défaut.',
      destination: 'Nouakchott',
      departureLocation: { type: 'Point', coordinates: [-15.9582, 18.0735] },
      departureAddress: { city: 'Nouakchott', country: 'Mauritanie', countryCode: 'MR' },
      durationMinutes: 240,
      startsAt: inDays(-10),
      price: 5_000,
      currency: Currency.MRU,
      totalSeats: 10,
      availableSeats: 10,
      status: ExcursionStatus.COMPLETED,
    },
  ]);

  console.log('\nSeed terminé.');
  console.log('  Admin    : admin@tourism.mr / Admin123!');
  console.log(`  Touriste : ${tourist!.email} / Touriste123!`);
  console.log(`  Admin id : ${admin!._id}`);
}

seed()
  .then(() => disconnectFromDatabase())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    console.error('Échec du seed :', error);
    await disconnectFromDatabase();
    process.exit(1);
  });
