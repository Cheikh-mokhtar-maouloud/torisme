/**
 * Marque comme vérifiées les adresses des comptes antérieurs à la vérification.
 *
 * Usage :
 *   node backend/scripts/backfill-email-verified.mjs [--dry-run]
 *
 * ─── Pourquoi ce script est indispensable ───────────────────────────────────
 *
 * La connexion refuse désormais les comptes dont l'adresse n'est pas vérifiée.
 * Or les comptes créés avant cette fonctionnalité n'ont aucune date de
 * vérification : sans reprise, ils seraient **tous** bloqués au premier
 * déploiement, sans qu'aucun test ne le signale — le code est correct, ce sont
 * les données qui manquent.
 *
 * ─── Ce que cela suppose, et ce que cela ne vaut pas ────────────────────────
 *
 * On tient ces adresses pour acquises parce qu'elles ont été acceptées avant
 * que la règle n'existe. C'est un choix de continuité, pas une vérification :
 * ces adresses n'ont jamais reçu de code.
 *
 * Il est défendable ici — un tel compte ne pouvait rien faire de plus qu'un
 * compte vérifié — mais il ne le serait pas sur un service où la boîte de
 * réception donne accès à de l'argent. Dans ce cas il faudrait forcer une
 * vérification à la prochaine connexion plutôt que de l'accorder.
 *
 * `--dry-run` compte sans écrire.
 */

import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';

const DRY_RUN = process.argv.includes('--dry-run');

function readEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const fileEnv = readEnvFile(new URL('../.env.local', import.meta.url));
const uri = process.env.MONGODB_URI ?? fileEnv.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME ?? fileEnv.MONGODB_DB_NAME ?? 'tourism';

if (!uri) {
  console.error('\nÉchec : MONGODB_URI introuvable.\n');
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const users = client.db(dbName).collection('users');

  const filter = { emailVerifiedAt: { $in: [null, undefined] } };
  const total = await users.countDocuments({});
  const pending = await users.countDocuments(filter);

  console.log(`\nBase : ${dbName}`);
  console.log(`Comptes                : ${total}`);
  console.log(`Sans date de vérification : ${pending}`);

  if (pending === 0) {
    console.log('\nRien à faire.\n');
  } else if (DRY_RUN) {
    console.log(`\nEssai à blanc : ${pending} compte(s) seraient marqués vérifiés.\n`);
  } else {
    /*
     * La date posée est celle de la création du compte, non celle du script.
     * Prétendre que treize adresses ont été vérifiées à la même seconde
     * fausserait toute lecture ultérieure de ces données.
     */
    const result = await users.updateMany(filter, [
      { $set: { emailVerifiedAt: '$createdAt' } },
    ]);
    console.log(`\n${result.modifiedCount} compte(s) marqués vérifiés.`);
    console.log(
      '\nCes adresses n’ont jamais reçu de code : elles sont tenues pour\n' +
        'acquises parce qu’elles ont été acceptées avant que la règle existe.\n',
    );
  }
} finally {
  await client.close();
}
