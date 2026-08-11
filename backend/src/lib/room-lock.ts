import { MongoServerError } from 'mongodb';

import { ErrorCode } from '@tourism/shared/constants';

import { BookingLock } from '@/models';

import { HttpError } from './errors';
import { logger } from './logger';

/**
 * Verrou exclusif sur une chambre, le temps de créer une réservation.
 *
 * Durée volontairement courte : la section protégée est un comptage suivi d'une
 * insertion, soit quelques millisecondes. Dix secondes couvrent largement une
 * base lente tout en bornant l'indisponibilité si un processus meurt.
 */
const LOCK_TTL_MS = 10_000;

/** Nombre de tentatives avant d'abandonner. */
const MAX_ATTEMPTS = 12;

/** Attente entre deux tentatives. 12 × 60 ms ≈ 0,7 s au pire. */
const RETRY_DELAY_MS = 60;

/**
 * Exécute une opération en détenant le verrou de la chambre.
 *
 * Le verrou est **toujours** relâché, y compris si l'opération échoue : sans
 * `finally`, une réservation refusée laisserait la chambre bloquée jusqu'à
 * l'expiration TTL.
 */
export async function withRoomLock<T>(roomId: string, operation: () => Promise<T>): Promise<T> {
  await acquire(roomId);

  try {
    return await operation();
  } finally {
    await release(roomId);
  }
}

async function acquire(roomId: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      await BookingLock.create({ roomId, expiresAt: new Date(Date.now() + LOCK_TTL_MS) });
      return;
    } catch (error) {
      // 11000 : violation d'index unique, donc verrou déjà détenu. C'est le
      // fonctionnement normal en cas de concurrence, pas une anomalie.
      const isDuplicate = error instanceof MongoServerError && error.code === 11000;
      if (!isDuplicate) throw error;

      /*
       * Le détenteur a pu mourir sans relâcher : on retire les verrous périmés
       * plutôt que d'attendre le ramasse-miettes TTL, qui ne passe qu'une fois
       * par minute — une attente inacceptable pour une réservation.
       */
      await BookingLock.deleteOne({ roomId, expiresAt: { $lt: new Date() } });

      await delay(RETRY_DELAY_MS);
    }
  }

  logger.warn('verrou de chambre non obtenu', { roomId, attempts: MAX_ATTEMPTS });

  // 409 plutôt que 500 : la demande est recevable, c'est l'instant qui ne l'est
  // pas. Le client peut réessayer immédiatement.
  throw new HttpError(
    ErrorCode.CONFLICT,
    'Une autre réservation est en cours sur cette chambre. Réessayez dans un instant.',
    409,
  );
}

async function release(roomId: string): Promise<void> {
  try {
    await BookingLock.deleteOne({ roomId });
  } catch (error) {
    // Un verrou non relâché expirera de lui-même : faire échouer une
    // réservation réussie pour cette raison serait bien pire.
    logger.error('relâchement du verrou impossible', {
      roomId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
