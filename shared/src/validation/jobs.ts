import { z } from 'zod';

import { objectIdSchema } from './primitives';

/**
 * Charges utiles des tâches de file.
 *
 * Validées **à la réception** par le worker, pas seulement au dépôt. Une tâche
 * traverse une frontière de processus et peut avoir été écrite par une version
 * antérieure du backend, restée en file pendant un déploiement. Sans
 * validation, ce décalage se manifeste par un `undefined` au milieu d'un
 * traitement, bien loin de sa cause.
 */

export const sendMailJobSchema = z.object({
  to: z.email(),
  subject: z.string().min(1).max(300),
  text: z.string().min(1),
  html: z.string().optional(),
});
export type SendMailJob = z.infer<typeof sendMailJobSchema>;

export const excursionReminderJobSchema = z.object({
  excursionBookingId: objectIdSchema,
});
export type ExcursionReminderJob = z.infer<typeof excursionReminderJobSchema>;

/** L'entretien ne prend aucun paramètre : il balaie l'état courant. */
export const maintenanceJobSchema = z.object({});
export type MaintenanceJob = z.infer<typeof maintenanceJobSchema>;
