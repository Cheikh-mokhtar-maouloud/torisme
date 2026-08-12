import { logger } from '../logger';
import type { MailMessage, MailProvider } from './types';

/**
 * Envoi via Resend.
 *
 * L'API HTTP est appelée directement, sans SDK : un seul appel est nécessaire,
 * là où la dépendance ajouterait son propre client HTTP pour rien.
 */
export class ResendMailProvider implements MailProvider {
  readonly name = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      // Le destinataire n'est pas journalisé avec l'erreur : les journaux ne
      // doivent pas devenir une liste d'adresses exploitable.
      logger.error('échec d’envoi Resend', {
        status: response.status,
        detail: detail.slice(0, 200),
      });
      throw new Error(`Envoi d’email refusé par le fournisseur (HTTP ${response.status})`);
    }
  }
}
