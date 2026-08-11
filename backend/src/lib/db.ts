import mongoose from 'mongoose';

import { env } from '@/config/env';

import { logger, serializeError } from './logger';

/**
 * Connexion MongoDB mise en cache sur l'objet global.
 *
 * En développement, Next recharge les modules à chaque modification. Sans ce
 * cache, chaque rechargement ouvrirait une nouvelle connexion jusqu'à saturer
 * le pool du cluster. En production sans état, le cache est simplement réutilisé
 * pendant toute la durée de vie du processus.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as typeof globalThis & {
  __mongooseCache?: MongooseCache;
};

const cache: MongooseCache = (globalForMongoose.__mongooseCache ??= {
  conn: null,
  promise: null,
});

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const config = env();

    // `strictQuery` empêche Mongoose d'ignorer silencieusement un champ de
    // filtre absent du schéma — une faute de frappe doit lever une erreur,
    // pas retourner toute la collection.
    mongoose.set('strictQuery', true);

    cache.promise = mongoose
      .connect(config.MONGODB_URI, {
        dbName: config.MONGODB_DB_NAME,
        // Échouer vite plutôt que laisser une requête pendre 30 s par défaut.
        serverSelectionTimeoutMS: 10_000,
        /*
         * Taille du pool.
         *
         * En serverless (Vercel), chaque instance de fonction ouvre son propre
         * pool : dix connexions par instance multipliées par le nombre
         * d'instances actives saturent rapidement le quota d'un cluster Atlas
         * (500 connexions sur l'offre M0). Un petit pool par instance est donc
         * le bon réglage — c'est le nombre d'instances qui absorbe la charge,
         * pas la taille du pool.
         *
         * Sur un serveur long-vivant (Phase 15), l'inverse est vrai : un seul
         * processus sert tout le trafic et a besoin d'un pool plus large.
         */
        maxPoolSize: config.MONGODB_MAX_POOL_SIZE,
        minPoolSize: 0,
      })
      .then((connection) => {
        logger.info('Connexion MongoDB établie', { database: config.MONGODB_DB_NAME });
        return connection;
      })
      .catch((error: unknown) => {
        // Réinitialiser la promesse pour qu'un appel ultérieur puisse réessayer :
        // sans cela, une panne réseau transitoire condamnerait le processus.
        cache.promise = null;
        logger.error('Échec de connexion MongoDB', serializeError(error));
        throw error;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

export type DatabaseState = 'disconnected' | 'connected' | 'connecting' | 'disconnecting';

/**
 * État de la connexion, pour la sonde de santé.
 * Mongoose expose aussi l'état 99 (« uninitialized ») : il est traité comme
 * déconnecté plutôt qu'ignoré, sans quoi la sonde renverrait `undefined`.
 */
export function getDatabaseState(): DatabaseState {
  const states: Record<number, DatabaseState> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] ?? 'disconnected';
}

/** Utilisé par les scripts et les tests ; inutile dans le cycle de vie d'une requête. */
export async function disconnectFromDatabase(): Promise<void> {
  if (!cache.conn) return;
  await mongoose.disconnect();
  cache.conn = null;
  cache.promise = null;
}
