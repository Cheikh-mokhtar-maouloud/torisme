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

    /*
     * Le succès est journalisé, pas seulement l'échec.
     *
     * Sans cette ligne, un envoi réussi et un envoi qui n'a jamais eu lieu
     * produisent le même silence. Diagnostiquer « je n'ai rien reçu » revient
     * alors à deviner — c'est exactement ce qui s'est produit lors de la
     * première configuration.
     *
     * L'identifiant permet de retrouver l'envoi dans le tableau de bord du
     * fournisseur. Le contenu, lui, n'est pas journalisé : il porte les codes.
     */
    const body = (await response.json().catch(() => ({}))) as { id?: string };
    logger.info('email envoyé', { provider: 'resend', to: message.to, messageId: body.id });
  }
}
