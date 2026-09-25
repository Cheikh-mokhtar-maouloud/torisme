/**
 * Vérification de la logique de connexion Google, sans compte Google.
 *
 * Usage :
 *   npx tsx --tsconfig backend/tsconfig.json backend/scripts/verify-google-login.mts
 *
 * ─── Ce qui est vérifié, et ce qui ne l'est pas ─────────────────────────────
 *
 * La signature du jeton est **neutralisée** : c'est la seule chose qui exige un
 * vrai compte Google, et elle a été vérifiée séparément — un jeton mal formé et
 * un jeton bien formé mais signé par personne sont tous deux rejetés par la
 * bibliothèque.
 *
 * Tout le reste est exercé pour de bon, contre la vraie base : création d'un
 * compte, rattachement d'une identité Google à un compte existant, refus du
 * rattachement quand Google ne garantit pas l'adresse, émission d'une session.
 *
 * C'est justement cette moitié-là qui n'avait jamais tourné, et qui casserait
 * en silence le jour où l'identifiant serait posé.
 *
 * ─── Comment la signature est neutralisée ───────────────────────────────────
 *
 * En remplaçant `verifyIdToken` sur le prototype **avant** que le service ne
 * charge le module. Le service faisant un import dynamique, il reçoit
 * l'instance déjà en cache, donc déjà modifiée. Aucune ligne du code de
 * production n'est touchée pour ce test.
 */

import assert from 'node:assert/strict';

// Les variables du serveur sont lues depuis son fichier local : ce script parle
// à la même base que l'application.
const { config } = await import('dotenv');
config({ path: new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '') });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.GOOGLE_CLIENT_ID ??= 'essai-verification.apps.googleusercontent.com';

/** Charge utile que Google renverrait, décidée par chaque scénario. */
let nextPayload: Record<string, unknown> = {};

const googleAuth = await import('google-auth-library');

(googleAuth.OAuth2Client.prototype as unknown as Record<string, unknown>).verifyIdToken =
  async () => ({ getPayload: () => nextPayload });

const { connectToDatabase } = await import('@/lib/db');
const { User } = await import('@/models');
const { loginWithGoogle } = await import('@/services/auth.service');
const { hashPassword } = await import('@/lib/auth/password');

await connectToDatabase();

const results: string[] = [];
const failures: string[] = [];

async function scenario(name: string, run: () => Promise<void>) {
  try {
    await run();
    results.push(`  OK    ${name}`);
  } catch (error) {
    failures.push(`  ÉCHEC ${name} : ${error instanceof Error ? error.message : String(error)}`);
  }
}

const NEW_EMAIL = 'verif.nouveau@example.test';
const EXISTING_EMAIL = 'verif.existant@example.test';
const UNVERIFIED_EMAIL = 'verif.nonverifie@example.test';

await User.deleteMany({ email: { $in: [NEW_EMAIL, EXISTING_EMAIL, UNVERIFIED_EMAIL] } });

await scenario('compte inexistant -> création et session', async () => {
  nextPayload = { sub: 'sub-nouveau', email: NEW_EMAIL, email_verified: true, name: 'Nouveau Venu' };

  const result = await loginWithGoogle('jeton-neutralise');

  assert.equal(result.user.email, NEW_EMAIL, 'adresse du compte créé');
  assert.equal(result.user.fullName, 'Nouveau Venu', 'nom repris de Google');
  assert.ok(result.token.length > 20, 'jeton de session émis');
  assert.ok(result.refreshToken.length > 20, 'jeton de rafraîchissement émis');

  const stored = await User.findOne({ email: NEW_EMAIL }).select('+googleId +passwordHash').lean();
  assert.equal(stored?.googleId, 'sub-nouveau', 'identité Google enregistrée');
  assert.equal(stored?.passwordHash, undefined, 'aucun mot de passe inventé');
});

await scenario('même compte, seconde connexion -> pas de doublon', async () => {
  nextPayload = { sub: 'sub-nouveau', email: NEW_EMAIL, email_verified: true, name: 'Nouveau Venu' };
  await loginWithGoogle('jeton-neutralise');

  const count = await User.countDocuments({ email: NEW_EMAIL });
  assert.equal(count, 1, 'un seul compte pour deux connexions');
});

await scenario('compte par mot de passe + adresse vérifiée -> rattachement', async () => {
  await User.create({
    fullName: 'Compte Existant',
    email: EXISTING_EMAIL,
    passwordHash: await hashPassword('MotDePasse123!'),
  });

  nextPayload = { sub: 'sub-existant', email: EXISTING_EMAIL, email_verified: true };
  const result = await loginWithGoogle('jeton-neutralise');

  assert.equal(result.user.email, EXISTING_EMAIL, 'même compte réutilisé');

  const stored = await User.findOne({ email: EXISTING_EMAIL })
    .select('+googleId +passwordHash')
    .lean();
  assert.equal(stored?.googleId, 'sub-existant', 'identité Google rattachée');
  assert.ok(stored?.passwordHash, 'mot de passe conservé');
});

await scenario('compte par mot de passe + adresse NON vérifiée -> refus', async () => {
  await User.create({
    fullName: 'Compte Sensible',
    email: UNVERIFIED_EMAIL,
    passwordHash: await hashPassword('MotDePasse123!'),
  });

  nextPayload = { sub: 'sub-usurpateur', email: UNVERIFIED_EMAIL, email_verified: false };

  await assert.rejects(
    () => loginWithGoogle('jeton-neutralise'),
    /déjà utilisée/,
    'le rattachement doit être refusé',
  );

  const stored = await User.findOne({ email: UNVERIFIED_EMAIL }).select('+googleId').lean();
  assert.equal(stored?.googleId, undefined, 'aucune identité rattachée');
});

await scenario('jeton sans adresse -> refus', async () => {
  nextPayload = { sub: 'sub-sans-email' };
  await assert.rejects(() => loginWithGoogle('jeton-neutralise'), /refusée/);
});

await User.deleteMany({ email: { $in: [NEW_EMAIL, EXISTING_EMAIL, UNVERIFIED_EMAIL] } });

console.log('\nLogique de connexion Google\n');
results.forEach((line) => console.log(line));
failures.forEach((line) => console.log(line));
console.log(`\n${results.length} réussi(s), ${failures.length} échec(s)`);
console.log(
  '\nLa signature du jeton est neutralisée ici : elle exige un vrai compte\n' +
    'Google. Elle a été vérifiée séparément — un jeton forgé est rejeté.\n',
);

process.exit(failures.length === 0 ? 0 : 1);
