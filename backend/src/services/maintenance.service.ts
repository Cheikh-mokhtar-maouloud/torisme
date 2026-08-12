import { BookingStatus, ExcursionStatus } from '@tourism/shared/constants';

import { logger } from '@/lib/logger';
import { Booking, Excursion, ExcursionBooking } from '@/models';

/**
 * Entretien périodique de l'état métier.
 *
 * Ce que cette tâche **ne fait pas** : purger les sessions expirées ni les
 * verrous de réservation. Les deux collections portent un index TTL, et
 * MongoDB les nettoie lui-même. Rajouter une purge applicative dupliquerait un
 * mécanisme qui fonctionne, sans rien garantir de plus.
 *
 * Ce qu'elle fait, et que rien ne faisait jusqu'ici : faire avancer les statuts
 * que seul le temps peut faire changer. `COMPLETED` existait dans les
 * énumérations depuis la Phase 2 mais n'était jamais posé — un séjour terminé
 * restait « Confirmé » indéfiniment, et une excursion passée restait affichée
 * comme programmée. C'est le premier traitement de la plateforme qui n'a aucun
 * déclencheur utilisateur : il lui fallait un ordonnanceur.
 */

export interface MaintenanceReport {
  bookingsCompleted: number;
  excursionsCompleted: number;
  excursionBookingsCompleted: number;
}

export async function completePastStays(now = new Date()): Promise<MaintenanceReport> {
  const bookings = await Booking.updateMany(
    { status: BookingStatus.CONFIRMED, checkOut: { $lte: now } },
    { $set: { status: BookingStatus.COMPLETED } },
  );

  /*
   * Une excursion est terminée après son départ **plus sa durée**. Le filtre
   * combine deux conditions pour une raison de performance : `startsAt` est
   * indexé et réduit d'emblée l'ensemble examiné, tandis que `$expr` — qui ne
   * peut pas utiliser d'index — n'affine plus qu'un petit nombre de documents.
   * Employé seul, il imposerait un parcours complet de la collection à chaque
   * exécution.
   */
  const excursions = await Excursion.updateMany(
    {
      status: { $in: [ExcursionStatus.SCHEDULED, ExcursionStatus.FULL] },
      startsAt: { $lte: now },
      $expr: {
        $lte: [{ $add: ['$startsAt', { $multiply: ['$durationMinutes', 60_000] }] }, now],
      },
    },
    { $set: { status: ExcursionStatus.COMPLETED } },
  );

  /*
   * Les réservations suivent leur excursion. La recherche est bornée aux
   * trente derniers jours : au-delà, tout a déjà été traité par une exécution
   * précédente, et balayer l'historique complet à chaque heure coûterait de
   * plus en plus cher à mesure que la plateforme vieillit.
   */
  const recentlyEnded = await Excursion.find({
    status: ExcursionStatus.COMPLETED,
    startsAt: { $gte: new Date(now.getTime() - 30 * 24 * 3_600_000), $lte: now },
  })
    .select('_id')
    .lean();

  let excursionBookingsCompleted = 0;

  if (recentlyEnded.length > 0) {
    const result = await ExcursionBooking.updateMany(
      {
        status: BookingStatus.CONFIRMED,
        excursionId: { $in: recentlyEnded.map((excursion) => excursion._id) },
      },
      { $set: { status: BookingStatus.COMPLETED } },
    );
    excursionBookingsCompleted = result.modifiedCount;
  }

  const report: MaintenanceReport = {
    bookingsCompleted: bookings.modifiedCount,
    excursionsCompleted: excursions.modifiedCount,
    excursionBookingsCompleted,
  };

  // Journalisé seulement s'il s'est passé quelque chose : une tâche horaire qui
  // écrit une ligne à chaque passage noie les journaux sous du bruit et rend
  // invisibles les événements qui méritent d'être vus.
  if (
    report.bookingsCompleted > 0 ||
    report.excursionsCompleted > 0 ||
    report.excursionBookingsCompleted > 0
  ) {
    logger.info('entretien : statuts avancés', { ...report });
  }

  return report;
}
