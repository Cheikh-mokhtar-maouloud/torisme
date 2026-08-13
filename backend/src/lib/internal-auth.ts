import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { env } from '@/config/env';

import { HttpError } from './errors';
import { SecurityEvent, callerIp, securityEvent } from './security-log';

/**
 * Authentification des appels internes (worker → backend).
 *
 * Ces routes déclenchent des envois d'emails et de l'entretien de base : elles
 * ne sont pas destinées au public et n'ont pas d'utilisateur. Un secret partagé
 * suffit, mais il doit être **distinct de `JWT_SECRET` et de
 * `REALTIME_PUBLISH_SECRET`** : trois relations de confiance différentes, et
 * les confondre transforme la compromission de l'une en compromission des
 * autres.
 */
export function requireInternalCaller(request: NextRequest): void {
  const expected = env().INTERNAL_API_SECRET;

  // Secret non configuré : les routes internes sont fermées, pas ouvertes.
  // Le défaut d'une variable absente doit toujours être le refus.
  if (!expected) {
    throw HttpError.forbidden('Routes internes désactivées');
  }

  const provided = request.headers.get('x-internal-secret');
  if (!provided) {
    securityEvent(SecurityEvent.INTERNAL_CALL_REJECTED, {
      ip: callerIp(request),
      path: new URL(request.url).pathname,
      detail: 'secret absent',
    });
    throw HttpError.unauthorized('Secret interne requis');
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  /*
   * La comparaison est en temps constant, et la différence de longueur est
   * testée séparément parce que `timingSafeEqual` lève sur des tailles
   * distinctes. Une égalité de chaînes ordinaire s'arrête au premier caractère
   * divergent et révèle, par sa durée, combien de caractères sont déjà justes.
   */
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    securityEvent(SecurityEvent.INTERNAL_CALL_REJECTED, {
      ip: callerIp(request),
      path: new URL(request.url).pathname,
      detail: 'secret invalide',
    });
    throw HttpError.unauthorized('Secret interne invalide');
  }
}
