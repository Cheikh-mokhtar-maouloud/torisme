/**
 * Création du premier administrateur.
 *
 * Sans ce script, une base fraîchement déployée est inutilisable : le seed est
 * interdit hors développement et l'inscription publique ne produit que des
 * comptes `USER`. Personne ne pourrait donc entrer dans le dashboard.
 *
 * Usage (local ou via `vercel env pull` puis exécution depuis le poste) :
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_NAME=… npm run create-admin --workspace backend
 *
 * Il est **idempotent** : relancé sur un email existant, il promeut le compte
 * au rôle administrateur et le réactive, sans toucher au mot de passe. C'est
 * aussi la procédure de secours si le dernier administrateur se retrouve
 * verrouillé dehors.
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

// `.env.local` en développement ; en production les variables viennent de
// l'environnement du fournisseur et ce chargement est sans effet.
loadEnv({ path: resolve(process.cwd(), '.env.local') });

import { UserRole } from '@tourism/shared/constants';
import { passwordSchema, emailSchema } from '@tourism/shared/validation';

import { hashPassword } from '../src/lib/auth/password';
import { connectToDatabase, disconnectFromDatabase } from '../src/lib/db';
import { User } from '../src/models';

/* eslint-disable no-console -- script d'administration, sortie destinée au terminal */

async function createAdmin(): Promise<void> {
  const rawEmail = process.env.ADMIN_EMAIL;
  const rawPassword = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME ?? 'Administrateur';

  if (!rawEmail || !rawPassword) {
    throw new Error(
      'ADMIN_EMAIL et ADMIN_PASSWORD sont requis.\n' +
        'Exemple : ADMIN_EMAIL=admin@exemple.mr ADMIN_PASSWORD="…" npm run create-admin --workspace backend',
    );
  }

  // Les mêmes schémas que l'API : un mot de passe trop court doit être refusé
  // ici aussi, sinon ce script devient une porte dérobée aux règles de sécurité.
  const email = emailSchema.parse(rawEmail);
  passwordSchema.parse(rawPassword);

  await connectToDatabase();

  const existing = await User.findOne({ email }).select('_id role isActive').lean();

  if (existing) {
    await User.updateOne({ _id: existing._id }, { $set: { role: UserRole.ADMIN, isActive: true } });
    console.log(`Compte existant promu administrateur : ${email}`);
    console.log('Le mot de passe n’a pas été modifié.');
    return;
  }

  await User.create({
    fullName,
    email,
    passwordHash: await hashPassword(rawPassword),
    role: UserRole.ADMIN,
    isActive: true,
  });

  console.log(`Administrateur créé : ${email}`);
  console.log('Connectez-vous au dashboard, puis changez ce mot de passe.');
}

createAdmin()
  .then(() => disconnectFromDatabase())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    console.error('Échec :', error instanceof Error ? error.message : error);
    await disconnectFromDatabase();
    process.exit(1);
  });
