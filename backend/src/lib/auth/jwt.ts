import { SignJWT, jwtVerify } from 'jose';

import type { UserRole } from '@tourism/shared/constants';

import { env } from '@/config/env';

/**
 * Jetons signés avec `jose` plutôt que `jsonwebtoken` : l'implémentation repose
 * sur la Web Crypto API, disponible aussi bien dans le runtime Node que dans le
 * runtime Edge de Next, ce qui laisse ouverte l'exécution des gardes en middleware.
 */

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  email: string;
}

const ISSUER = 'tourism-platform';
const AUDIENCE = 'tourism-clients';

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env().JWT_SECRET);
}

/**
 * Clés acceptées à la **vérification**, dans l'ordre d'essai.
 *
 * La signature n'utilise jamais que la clé courante ; seule la vérification
 * accepte l'ancienne. C'est ce qui rend une rotation possible sans déconnecter
 * tout le monde : pendant la transition, les jetons émis avant le changement
 * restent valides, les nouveaux sont signés avec la clé neuve.
 *
 * Sans ce mécanisme, changer `JWT_SECRET` invalide instantanément toutes les
 * sessions actives. La conséquence pratique est qu'on hésite à le faire — et un
 * secret qu'on n'ose pas remplacer reste en place après la fuite qui aurait dû
 * le faire changer.
 *
 * La fenêtre à couvrir est courte : les jetons de rafraîchissement sont des
 * chaînes aléatoires opaques stockées en base, ils ne dépendent pas de cette
 * clé. Seuls les jetons d'accès, valides quinze minutes, sont concernés —
 * `JWT_SECRET_PREVIOUS` peut donc être retiré dès l'heure suivante.
 */
function verificationKeys(): Uint8Array[] {
  const config = env();
  const keys = [new TextEncoder().encode(config.JWT_SECRET)];

  if (config.JWT_SECRET_PREVIOUS) {
    keys.push(new TextEncoder().encode(config.JWT_SECRET_PREVIOUS));
  }

  return keys;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ role: payload.role, email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env().JWT_ACCESS_TTL)
    .sign(secretKey());
}

/**
 * Vérifie signature, émetteur, audience et expiration.
 * Retourne `null` sur jeton invalide : c'est un cas de fonctionnement normal
 * (jeton expiré), pas une condition exceptionnelle.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  for (const key of verificationKeys()) {
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });

      if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') return null;

      return {
        sub: payload.sub,
        role: payload.role as UserRole,
        email: typeof payload.email === 'string' ? payload.email : '',
      };
    } catch {
      // Clé suivante. Un jeton expiré ou malformé échouera sur toutes, et la
      // boucle se termine alors par `null` — le cas normal, pas une exception.
    }
  }

  return null;
}
