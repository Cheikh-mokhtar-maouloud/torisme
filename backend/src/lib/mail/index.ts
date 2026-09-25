import { env } from '@/config/env';

import { ConsoleMailProvider } from './console-provider';
import { ResendMailProvider } from './resend-provider';
import { SmtpMailProvider } from './smtp-provider';
import type { MailProvider } from './types';

export type { MailMessage, MailProvider } from './types';

let cached: MailProvider | undefined;

/**
 * Fabrique du fournisseur d'emails.
 *
 * Le fournisseur `console` est refusé en production : les emails y sont des
 * messages attendus par de vrais clients — réinitialisation de mot de passe,
 * confirmation de réservation. Les voir disparaître dans les journaux serait une
 * panne silencieuse, et le support en découvrirait l'existence par les
 * réclamations.
 */
export function mailer(): MailProvider {
  if (cached) return cached;

  const config = env();

  if (config.MAIL_PROVIDER === 'resend') {
    if (!config.MAIL_API_KEY || !config.MAIL_FROM) {
      throw new Error('MAIL_PROVIDER=resend exige MAIL_API_KEY et MAIL_FROM.');
    }
    cached = new ResendMailProvider(config.MAIL_API_KEY, config.MAIL_FROM);
    return cached;
  }

  if (config.MAIL_PROVIDER === 'smtp') {
    const missing = (
      [
        ['SMTP_HOST', config.SMTP_HOST],
        ['SMTP_USER', config.SMTP_USER],
        ['SMTP_PASSWORD', config.SMTP_PASSWORD],
        ['MAIL_FROM', config.MAIL_FROM],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([name]) => name);

    /*
     * Les variables manquantes sont **nommées**. Un message générique du genre
     * « configuration SMTP incomplète » oblige à relire le code pour savoir
     * laquelle manque, au moment précis où le serveur refuse de démarrer.
     */
    if (missing.length > 0) {
      throw new Error(`MAIL_PROVIDER=smtp exige : ${missing.join(', ')}.`);
    }

    cached = new SmtpMailProvider(config.MAIL_FROM!, {
      host: config.SMTP_HOST!,
      port: config.SMTP_PORT,
      user: config.SMTP_USER!,
      password: config.SMTP_PASSWORD!,
    });
    return cached;
  }

  if (config.APP_ENV === 'production') {
    throw new Error(
      'Le fournisseur d’email « console » est interdit en production : ' +
        'les messages ne partiraient jamais. Définissez MAIL_PROVIDER=smtp ou resend.',
    );
  }

  cached = new ConsoleMailProvider();
  return cached;
}
