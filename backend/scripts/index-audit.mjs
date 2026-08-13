/**
 * Audit des index — Phase 16.
 *
 * Usage :
 *   node backend/scripts/index-audit.mjs
 *
 * Chaque requête chaude est passée à `explain`. Une requête qui parcourt la
 * collection entière (`COLLSCAN`) répond correctement sur trois hôtels et
 * s'effondre sur trois mille : le défaut ne se voit jamais en développement,
 * et se manifeste en production comme une lenteur diffuse qu'on attribue au
 * réseau.
 *
 * Ce contrôle est **structurel**, pas chronométré. Le temps d'exécution dépend
 * de la machine et du cache ; le plan d'exécution, non — il dit si la requête
 * passera à l'échelle, quel que soit le matériel.
 */
import { MongoClient } from 'mongodb';

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME ?? 'tourism';

if (!URI) {
  console.error('MONGODB_URI est requis.');
  process.exit(2);
}

let passed = 0;
let failed = 0;
const warnings = [];

function report(label, stage, detail) {
  /*
   * `IXSCAN` : parcours d'index. `FETCH`/`PROJECTION` enveloppent souvent un
   * IXSCAN, on remonte donc l'arbre plutôt que de regarder la racine.
   * `EXPRESS_*` sont les plans optimisés de MongoDB 8 pour une recherche par
   * _id ou par index simple — ils sont au moins aussi bons qu'un IXSCAN.
   */
  const indexed = /IXSCAN|IDHACK|EXPRESS|GEO_NEAR_2DSPHERE|TEXT/.test(stage);

  if (indexed) {
    passed += 1;
    console.log(`  OK    ${label}`);
    console.log(`        ${stage}`);
  } else {
    failed += 1;
    console.log(`  ÉCHEC ${label}`);
    console.log(`        plan : ${stage}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Aplatit l'arbre du plan en une chaîne lisible : « FETCH → IXSCAN(city_1) ». */
function describe(plan) {
  const parts = [];
  let node = plan;

  while (node) {
    const name = node.stage;
    parts.push(node.indexName ? `${name}(${node.indexName})` : name);
    node = node.inputStage ?? node.inputStages?.[0] ?? node.queryPlan ?? null;
  }

  return parts.join(' → ');
}

async function explain(collection, label, run) {
  try {
    const result = await run(collection);
    const plan =
      result.queryPlanner?.winningPlan ?? result.stages?.[0]?.$cursor?.queryPlanner?.winningPlan;

    if (!plan) {
      warnings.push(`${label} : plan illisible`);
      return;
    }

    report(label, describe(plan));
  } catch (error) {
    failed += 1;
    console.log(`  ÉCHEC ${label}`);
    console.log(`        ${error.message}`);
  }
}

const client = new MongoClient(URI);

try {
  await client.connect();
  const db = client.db(DB_NAME);

  console.log(`\nBase : ${DB_NAME}\n`);

  /*
   * Volume des collections. Un plan mesuré sur quelques documents n'est pas
   * représentatif : MongoDB retient le plan le moins coûteux *à cette taille*,
   * qui peut parfaitement être un balayage. L'avertissement évite de lire ce
   * rapport comme une garantie de tenue en charge.
   */
  for (const name of ['hotels', 'rooms', 'bookings', 'notifications']) {
    const count = await db.collection(name).estimatedDocumentCount();
    if (count < 100) {
      warnings.push(
        `${name} ne contient que ${count} document(s) : les plans retenus ne préjugent ` +
          'pas du comportement en volume.',
      );
    }
  }

  /* --- Contenu public ------------------------------------------------------ */
  console.log('Listes publiques');

  await explain(db.collection('hotels'), 'Hôtels publiés, triés par note', (c) =>
    c.find({ status: 'PUBLISHED' }).sort({ rating: -1 }).limit(20).explain(),
  );

  await explain(db.collection('hotels'), 'Hôtels filtrés par ville', (c) =>
    c.find({ status: 'PUBLISHED', 'address.city': 'Nouakchott' }).limit(20).explain(),
  );

  const hotel = await db.collection('hotels').findOne({}, { projection: { _id: 1 } });

  if (hotel) {
    await explain(db.collection('rooms'), 'Chambres d’un hôtel', (c) =>
      c.find({ hotelId: hotel._id, status: 'PUBLISHED' }).limit(20).explain(),
    );
  }

  await explain(db.collection('excursions'), 'Excursions à venir', (c) =>
    c
      .find({ status: 'SCHEDULED', startsAt: { $gt: new Date() } })
      .sort({ startsAt: 1 })
      .limit(20)
      .explain(),
  );

  /* --- Recherche géographique ---------------------------------------------- */
  console.log('\nRecherche géographique');

  /*
   * Le prédicat géographique est testé **seul**, sans filtre de statut.
   *
   * Sur un jeu de démonstration de trois documents, le planificateur retient
   * `status_1` et applique la contrainte géographique en post-filtrage : c'est
   * effectivement le moins coûteux quand tout tient en une page. Mais le plan
   * obtenu ne dit alors rien de ce qui se passera sur trois mille fiches. En
   * isolant le prédicat, on vérifie ce qu'on veut réellement savoir — l'index
   * 2dsphere est-il capable de servir cette requête.
   */
  await explain(db.collection('hotels'), 'Rayon, prédicat géographique isolé', (c) =>
    c
      .find({
        location: {
          $geoWithin: { $centerSphere: [[-15.9785, 18.0735], 10_000 / 6_378_100] },
        },
      })
      .limit(20)
      .explain(),
  );

  /*
   * Le cadre de la carte est un **polygone GeoJSON**, pas un `$box`.
   *
   * `$box` est un opérateur de coordonnées héritées : il ne sait utiliser qu'un
   * index `2d`, jamais un `2dsphere`. La requête reste correcte et parcourt
   * toute la collection — un balayage complet à chaque déplacement de carte.
   */
  await explain(db.collection('attractions'), 'Emprise, prédicat géographique isolé', (c) =>
    c
      .find({
        location: {
          $geoWithin: {
            $geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-16.2, 17.9],
                  [-15.7, 17.9],
                  [-15.7, 18.2],
                  [-16.2, 18.2],
                  [-16.2, 17.9],
                ],
              ],
            },
          },
        },
      })
      .limit(20)
      .explain(),
  );

  /* --- Recherche textuelle -------------------------------------------------- */
  console.log('\nRecherche textuelle');

  await explain(db.collection('hotels'), 'Recherche plein texte', (c) =>
    c
      .find({ $text: { $search: 'plage' } })
      .limit(20)
      .explain(),
  );

  /* --- Espace utilisateur --------------------------------------------------- */
  console.log('\nEspace utilisateur');

  const user = await db.collection('users').findOne({}, { projection: { _id: 1 } });

  if (user) {
    await explain(db.collection('bookings'), 'Réservations d’un client', (c) =>
      c.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).explain(),
    );

    await explain(db.collection('notifications'), 'Notifications non lues', (c) =>
      c.find({ userId: user._id, readAt: null }).sort({ createdAt: -1 }).limit(20).explain(),
    );

    await explain(db.collection('favorites'), 'Favoris d’un client', (c) =>
      c.find({ userId: user._id }).limit(50).explain(),
    );
  } else {
    warnings.push('Aucun utilisateur : les requêtes de l’espace client sont ignorées');
  }

  await explain(db.collection('users'), 'Recherche d’un compte par email', (c) =>
    c.find({ email: 'admin@tourism.mr' }).explain(),
  );

  await explain(db.collection('sessions'), 'Session par empreinte de jeton', (c) =>
    c.find({ tokenHash: 'inexistant' }).explain(),
  );

  /* --- Index de durée de vie ------------------------------------------------ */
  console.log('\nIndex de purge automatique');

  for (const [name, field] of [
    ['sessions', 'expiresAt'],
    ['bookinglocks', 'expiresAt'],
  ]) {
    const indexes = await db.collection(name).indexes();
    const ttl = indexes.find((index) => index.expireAfterSeconds !== undefined);

    if (ttl && Object.keys(ttl.key)[0] === field) {
      passed += 1;
      console.log(`  OK    ${name}.${field} porte un index TTL`);
    } else {
      failed += 1;
      console.log(`  ÉCHEC ${name}.${field} n’a pas d’index TTL`);
      console.log('        Sans lui, la collection croît indéfiniment.');
    }
  }

  /* --- Résultat -------------------------------------------------------------- */
  for (const warning of warnings) console.log(`\n  ATTN  ${warning}`);

  console.log(`\n${passed} réussis, ${failed} échoués\n`);

  if (failed > 0) {
    console.log(
      'Un COLLSCAN sur une requête chaude répond correctement sur un jeu de test\n' +
        'et s’effondre en production. Ajoutez l’index correspondant au modèle.\n',
    );
  }

  process.exitCode = failed > 0 ? 1 : 0;
} finally {
  await client.close();
}
