import type { MailMessage } from './types';

/**
 * Modèles d'emails.
 *
 * Chaque message existe en texte **et** en HTML : certains clients ne rendent
 * pas le HTML, et un email sans partie texte est davantage classé indésirable.
 *
 * Le HTML reste volontairement rudimentaire — tableaux et styles en ligne. Les
 * clients de messagerie ne prennent en charge ni la mise en page moderne ni les
 * feuilles de style externes ; un rendu élaboré s'y désagrège.
 */

const BRAND = 'Tourism Platform';

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
      <tr><td>
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#0f766e">${BRAND}</p>
        <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${title}</h1>
        ${bodyHtml}
      </td></tr>
    </table>
    <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#94a3b8;text-align:center">
      Message automatique — merci de ne pas y répondre.
    </p>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${label}</a></p>
  <p style="margin:0;font-size:12px;color:#64748b">Si le bouton ne fonctionne pas, copiez ce lien :<br>${href}</p>`;
}

export function welcomeEmail(to: string, fullName: string): MailMessage {
  return {
    to,
    subject: `Bienvenue sur ${BRAND}`,
    text: `Bonjour ${fullName},\n\nVotre compte est créé. Vous pouvez dès à présent réserver des hôtels et des excursions en Mauritanie.\n\nÀ bientôt,\nL'équipe ${BRAND}`,
    html: layout(
      `Bienvenue, ${fullName}`,
      `<p style="margin:0;line-height:22px;color:#475569">Votre compte est créé. Vous pouvez dès à présent réserver des hôtels et des excursions en Mauritanie.</p>`,
    ),
  };
}

/**
 * Email de réinitialisation.
 *
 * Le lien porte le jeton en clair : c'est sa raison d'être. Il expire en une
 * heure et ne sert qu'une fois, de sorte qu'un email lu longtemps après ne
 * donne plus rien.
 */
export function passwordResetEmail(to: string, resetUrl: string): MailMessage {
  return {
    to,
    subject: 'Réinitialiser votre mot de passe',
    text: `Vous avez demandé à réinitialiser votre mot de passe.\n\nOuvrez ce lien, valable une heure :\n${resetUrl}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
    html: layout(
      'Réinitialiser votre mot de passe',
      `<p style="margin:0;line-height:22px;color:#475569">Vous avez demandé à réinitialiser votre mot de passe. Ce lien est valable <strong>une heure</strong>.</p>
       ${button(resetUrl, 'Choisir un nouveau mot de passe')}
       <p style="margin:24px 0 0;font-size:13px;color:#64748b">Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.</p>`,
    ),
  };
}

export function bookingConfirmedEmail(
  to: string,
  details: { reference: string; placeName: string; when: string; total: string },
): MailMessage {
  return {
    to,
    subject: `Réservation confirmée — ${details.reference}`,
    text: `Bonne nouvelle, votre réservation ${details.reference} est confirmée.\n\n${details.placeName}\n${details.when}\nTotal : ${details.total}\n\nPrésentez cette référence à votre arrivée.`,
    html: layout(
      'Réservation confirmée',
      `<p style="margin:0 0 16px;line-height:22px;color:#475569">Votre réservation <strong>${details.reference}</strong> est confirmée.</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#0f172a">
         <tr><td style="padding:6px 0;color:#64748b">Lieu</td><td style="padding:6px 0;text-align:right">${details.placeName}</td></tr>
         <tr><td style="padding:6px 0;color:#64748b">Dates</td><td style="padding:6px 0;text-align:right">${details.when}</td></tr>
         <tr><td style="padding:6px 0;color:#64748b">Total</td><td style="padding:6px 0;text-align:right;font-weight:bold">${details.total}</td></tr>
       </table>
       <p style="margin:20px 0 0;font-size:13px;color:#64748b">Présentez cette référence à votre arrivée.</p>`,
    ),
  };
}

export function bookingCancelledEmail(
  to: string,
  details: { reference: string; placeName: string; reason?: string },
): MailMessage {
  const reasonLine = details.reason ? `\n\nMotif : ${details.reason}` : '';

  return {
    to,
    subject: `Réservation annulée — ${details.reference}`,
    text: `Votre réservation ${details.reference} (${details.placeName}) a été annulée.${reasonLine}\n\nAucun montant n'a été prélevé.`,
    html: layout(
      'Réservation annulée',
      `<p style="margin:0;line-height:22px;color:#475569">Votre réservation <strong>${details.reference}</strong> (${details.placeName}) a été annulée.</p>
       ${details.reason ? `<p style="margin:16px 0 0;padding:12px;background:#f8fafc;border-radius:8px;font-size:14px;color:#475569"><strong>Motif :</strong> ${details.reason}</p>` : ''}
       <p style="margin:20px 0 0;font-size:13px;color:#64748b">Aucun montant n'a été prélevé.</p>`,
    ),
  };
}

/** Rappel envoyé à l'approche d'une excursion (planification en Phase 13). */
export function excursionReminderEmail(
  to: string,
  details: { title: string; when: string; departure: string; seats: number },
): MailMessage {
  return {
    to,
    subject: `Rappel — ${details.title}`,
    text: `Votre excursion approche.\n\n${details.title}\nDépart : ${details.when}\nLieu de rendez-vous : ${details.departure}\nPlaces réservées : ${details.seats}\n\nBonne excursion !`,
    html: layout(
      'Votre excursion approche',
      `<p style="margin:0 0 16px;line-height:22px;color:#475569"><strong>${details.title}</strong></p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#0f172a">
         <tr><td style="padding:6px 0;color:#64748b">Départ</td><td style="padding:6px 0;text-align:right">${details.when}</td></tr>
         <tr><td style="padding:6px 0;color:#64748b">Rendez-vous</td><td style="padding:6px 0;text-align:right">${details.departure}</td></tr>
         <tr><td style="padding:6px 0;color:#64748b">Places</td><td style="padding:6px 0;text-align:right">${details.seats}</td></tr>
       </table>`,
    ),
  };
}
