/**
 * Contrat d'envoi d'emails.
 *
 * Toute la plateforme passe par cette interface, jamais par le SDK d'un
 * fournisseur. Changer de Resend vers SendGrid, Postmark ou un SMTP se limite à
 * écrire une implémentation et à changer une variable d'environnement.
 */
export interface MailMessage {
  to: string;
  subject: string;
  /**
   * Version texte, **obligatoire**. Certains clients ne rendent pas le HTML, et
   * un message sans partie texte est davantage classé en indésirable.
   */
  text: string;
  html?: string;
}

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}
