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
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
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
    return null;
  }
}
