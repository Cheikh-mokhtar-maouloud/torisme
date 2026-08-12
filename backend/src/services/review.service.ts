import { MongoServerError } from 'mongodb';
import { Types, type Model } from 'mongoose';

import {
  BookingStatus,
  NotificationType,
  PlaceType,
  ReviewStatus,
  UserRole,
} from '@tourism/shared/constants';
import type { Review as ReviewDto } from '@tourism/shared/types';
import {
  requiresBooking,
  type CreateReviewInput,
  type ModerateReviewInput,
  type ReviewListQuery,
} from '@tourism/shared/validation';

import { HttpError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { paginateQuery, type PaginatedResult } from '@/lib/query';
import { serializeDocument } from '@/lib/serialize';
import {
  Attraction,
  Booking,
  Excursion,
  ExcursionBooking,
  Hotel,
  Restaurant,
  Review,
} from '@/models';

import { notify } from './notification.service';

/**
 * Vue minimale d'un lieu noté.
 *
 * Les quatre collections concernées ont des schémas très différents, mais ce
 * service n'écrit que ces deux champs. Les typer explicitement — plutôt que de
 * neutraliser le typage — garde la vérification sur ce qui est réellement écrit.
 */
interface RatedTarget {
  rating: number;
  reviewCount: number;
}

const TARGET_MODELS: Record<PlaceType, Model<RatedTarget>> = {
  [PlaceType.HOTEL]: Hotel as unknown as Model<RatedTarget>,
  [PlaceType.RESTAURANT]: Restaurant as unknown as Model<RatedTarget>,
  [PlaceType.ATTRACTION]: Attraction as unknown as Model<RatedTarget>,
  [PlaceType.EXCURSION]: Excursion as unknown as Model<RatedTarget>,
};

/**
 * Vérifie que l'auteur a bien séjourné ou participé.
 *
 * Seules les réservations **confirmées ou terminées** ouvrent le droit à un
 * avis : une demande en attente n'atteste de rien, et une réservation annulée
 * encore moins. Renvoie l'identifiant de la réservation, qui est conservé sur
 * l'avis comme pièce justificative.
 */
async function findEligibleBooking(
  userId: string,
  targetType: PlaceType,
  targetId: string,
): Promise<string> {
  const validStatuses = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED];

  if (targetType === PlaceType.HOTEL) {
    const booking = await Booking.findOne({
      userId,
      hotelId: targetId,
      status: { $in: validStatuses },
    })
      .select('_id')
      .lean();

    if (!booking) {
      throw HttpError.forbidden(
        'Vous devez avoir séjourné dans cet établissement pour laisser un avis',
      );
    }
    return String(booking._id);
  }

  const booking = await ExcursionBooking.findOne({
    userId,
    excursionId: targetId,
    status: { $in: validStatuses },
  })
    .select('_id')
    .lean();

  if (!booking) {
    throw HttpError.forbidden('Vous devez avoir participé à cette excursion pour laisser un avis');
  }
  return String(booking._id);
}

/** Vérifie que la cible existe réellement, quel que soit son type. */
async function assertTargetExists(targetType: PlaceType, targetId: string): Promise<void> {
  const exists = await TARGET_MODELS[targetType].exists({ _id: targetId });
  if (!exists) throw HttpError.notFound('Ce lieu est introuvable');
}

export async function createReview(userId: string, input: CreateReviewInput): Promise<ReviewDto> {
  await assertTargetExists(input.targetType, input.targetId);

  const bookingId = requiresBooking(input.targetType)
    ? await findEligibleBooking(userId, input.targetType, input.targetId)
    : undefined;

  try {
    const created = await Review.create({
      userId,
      targetType: input.targetType,
      targetId: input.targetId,
      ...(bookingId ? { bookingId } : {}),
      rating: input.rating,
      ...(input.comment ? { comment: input.comment } : {}),
      images: input.images,
      // Modération **a priori** : un avis n'apparaît qu'après validation. Plus
      // exigeant en travail d'administration, mais aucun contenu injurieux ou
      // diffamatoire ne s'affiche entre sa publication et son signalement.
      status: ReviewStatus.PENDING,
    });

    return serializeDocument<ReviewDto>(created.toObject());
  } catch (error) {
    // 11000 : l'index unique (userId, targetType, targetId) a joué.
    if (error instanceof MongoServerError && error.code === 11000) {
      throw HttpError.conflict('Vous avez déjà laissé un avis sur ce lieu');
    }
    throw error;
  }
}

export async function listReviews(
  query: ReviewListQuery,
  actor: { userId: string; role: UserRole } | null,
): Promise<PaginatedResult<ReviewDto>> {
  const filter: Record<string, unknown> = {};

  if (query.targetType) filter.targetType = query.targetType;
  if (query.targetId) filter.targetId = query.targetId;

  const isAdmin = actor?.role === UserRole.ADMIN;

  if (query.scope === 'me') {
    if (!actor) throw HttpError.unauthorized();
    // Ses propres avis, quel que soit leur statut : l'auteur doit pouvoir
    // constater qu'un avis est encore en attente de modération.
    filter.userId = actor.userId;
    if (query.status) filter.status = query.status;
  } else if (isAdmin) {
    if (query.status) filter.status = query.status;
    if (query.reportedOnly) filter.reportCount = { $gt: 0 };
  } else {
    // Le public ne voit que ce qui a été approuvé.
    filter.status = ReviewStatus.APPROVED;
  }

  return paginateQuery(
    Review,
    filter,
    {
      page: query.page,
      limit: query.limit,
      // Les avis les plus signalés d'abord dans la file de modération ; par
      // date ailleurs.
      sort: query.reportedOnly && isAdmin ? { reportCount: -1, createdAt: -1 } : { createdAt: -1 },
    },
    (doc) => serializeDocument<ReviewDto>(doc),
  );
}

export async function moderateReview(id: string, input: ModerateReviewInput): Promise<ReviewDto> {
  const updated = await Review.findByIdAndUpdate(
    id,
    {
      $set: {
        status: input.status,
        moderatedAt: new Date(),
        ...(input.reason ? { moderationReason: input.reason } : {}),
        // La décision de modération purge les signalements : ils ont été traités.
        reportCount: 0,
      },
    },
    { new: true },
  ).lean();

  if (!updated) throw HttpError.notFound('Avis introuvable');

  // Approuver ou rejeter change l'ensemble des avis visibles : la note du lieu
  // doit suivre immédiatement.
  await recalculateRating(updated.targetType as PlaceType, String(updated.targetId));

  /*
   * L'auteur est prévenu du sort de son avis. Le motif de rejet reste interne :
   * il sert à l'équipe de modération, et l'exposer nourrirait des débats sur
   * chaque décision.
   */
  void notify({
    userId: String(updated.userId),
    type: NotificationType.REVIEW_MODERATED,
    title:
      input.status === ReviewStatus.APPROVED ? 'Votre avis est publié' : 'Votre avis a été refusé',
    body:
      input.status === ReviewStatus.APPROVED
        ? 'Merci pour votre retour, il est désormais visible par les autres voyageurs.'
        : 'Votre avis ne respecte pas nos règles de publication et n’a pas été retenu.',
    data: { reviewId: String(updated._id) },
  });

  return serializeDocument<ReviewDto>(updated);
}

export async function deleteReview(
  id: string,
  actor: { userId: string; role: UserRole },
): Promise<void> {
  const review = await Review.findById(id).lean();
  if (!review) throw HttpError.notFound('Avis introuvable');

  // Un auteur peut retirer son propre avis ; un administrateur, n'importe lequel.
  if (actor.role !== UserRole.ADMIN && String(review.userId) !== actor.userId) {
    throw HttpError.notFound('Avis introuvable');
  }

  await Review.deleteOne({ _id: id });
  await recalculateRating(review.targetType as PlaceType, String(review.targetId));
}

/**
 * Signale un avis.
 *
 * Le compteur sert uniquement à trier la file de modération : aucun seuil ne
 * masque automatiquement un avis. Un retrait déclenché par le nombre de
 * signalements se retournerait vite en outil de censure entre concurrents.
 */
export async function reportReview(id: string): Promise<void> {
  const updated = await Review.findOneAndUpdate(
    { _id: id, status: ReviewStatus.APPROVED },
    { $inc: { reportCount: 1 } },
    { new: true },
  ).lean();

  if (!updated) throw HttpError.notFound('Avis introuvable');

  logger.info('avis signalé', { reviewId: id, reportCount: updated.reportCount });
}

/**
 * Recalcule la note et le nombre d'avis d'un lieu.
 *
 * Le calcul repart de zéro par agrégation, plutôt que d'ajuster les valeurs
 * existantes. C'est un peu plus coûteux, mais **auto-réparateur** : une
 * incohérence introduite par un incident passé disparaît au prochain
 * recalcul, là où un ajustement incrémental la perpétuerait indéfiniment.
 */
export async function recalculateRating(targetType: PlaceType, targetId: string): Promise<void> {
  const [aggregate] = await Review.aggregate<{ average: number; count: number }>([
    { $match: { targetType, targetId: toObjectId(targetId), status: ReviewStatus.APPROVED } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const average = aggregate?.average ?? 0;
  const count = aggregate?.count ?? 0;

  await TARGET_MODELS[targetType].updateOne(
    { _id: targetId },
    {
      $set: {
        // Une décimale : afficher 4,33 sur cinq avis suggère une précision que
        // l'échantillon n'a pas.
        rating: Math.round(average * 10) / 10,
        reviewCount: count,
      },
    },
  );
}

/**
 * `$match` dans une agrégation compare des ObjectId bruts : contrairement à
 * `find`, il n'applique pas la conversion du schéma, et une chaîne ne
 * correspondrait à rien — le recalcul renverrait alors zéro avis en silence.
 */
function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}
