import { logger } from '../logger';
import type { MailMessage, MailProvider } from './types';

/**
 * Fournisseur de développement : journalise au lieu d'envoyer.
 *
 * Il permet de dérouler et de tester tous les parcours à base d'email — dont la
 * réinitialisation de mot de passe — sans compte chez un prestataire, et sans
 * risquer d'écrire à de vraies adresses depuis un poste de développement.
 *
 * La fabrique le refuse en production.
 */
export class ConsoleMailProvider implements MailProvider {
  readonly name = 'console';

  async send(message: MailMessage): Promise<void> {
    logger.info('email (développement — non envoyé)', {
      to: message.to,
      subject: message.subject,
      // Le corps texte est tronqué : un lien de réinitialisation reste lisible,
      // sans noyer les journaux.
      preview: message.text.slice(0, 400),
    });
  }
}
