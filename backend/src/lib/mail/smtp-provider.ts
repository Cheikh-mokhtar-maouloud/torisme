import { createTransport, type Transporter } from 'nodemailer';

import { logger } from '@/lib/logger';

import type { MailMessage, MailProvider } from './types';

/**
 * Envoi par SMTP.
 *
 * ─── Pourquoi ce fournisseur existe à côté de Resend ────────────────────────
 *
 * Resend, comme la plupart des services d'envoi, exige un **domaine vérifié**
 * pour écrire à des adresses quelconques. C'est un obstacle réel quand on
 * démarre : il faut posséder un domaine et modifier ses enregistrements DNS.
 *
 * Le SMTP fonctionne avec n'importe quel compte de messagerie existant —
 * Gmail, Outlook, celui d'un hébergeur. Rien à posséder, rien à vérifier.
 *
 * ─── Ce qu'il ne remplace pas ───────────────────────────────────────────────
 *
 * Une boîte personnelle n'est pas un outil d'envoi en masse. Gmail plafonne à
 * cinq cents messages par jour et finit par suspendre un compte qui en abuse ;
 * et les messages partant d'une adresse personnelle atterrissent plus souvent
 * dans les indésirables qu'un domaine correctement authentifié.
 *
 * Ce fournisseur convient donc au développement et aux premiers utilisateurs.
 * Au-delà, un service dédié avec un domaine vérifié s'impose.
 */
export class SmtpMailProvider implements MailProvider {
  readonly name = 'smtp';

  private readonly transporter: Transporter;

  constructor(
    private readonly from: string,
    options: { host: string; port: number; user: string; password: string },
  ) {
    this.transporter = createTransport({
      host: options.host,
      port: options.port,
      /*
       * Le port 465 impose TLS dès la connexion ; 587 commence en clair puis
       * bascule par STARTTLS. Se tromper produit une attente qui expire sans
       * message clair, l'un des deux côtés attendant une poignée de main que
       * l'autre n'entamera jamais.
       */
      secure: options.port === 465,
      auth: { user: options.user, pass: options.password },
    });
  }

  async send(message: MailMessage): Promise<void> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });

    /*
     * L'identifiant du message est journalisé, jamais son contenu.
     *
     * Il permet de retrouver l'envoi chez le fournisseur quand un utilisateur
     * dit n'avoir rien reçu — la question la plus fréquente sur ce genre de
     * parcours. Le contenu, lui, porte les codes : il n'a rien à faire dans un
     * journal.
     */
    logger.info('email envoyé', { to: message.to, messageId: info.messageId });
  }
}
