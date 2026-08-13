/**
 * Test de charge — Phase 16.
 *
 * Usage :
 *   node scripts/load-test.mjs [url] [concurrence] [duree-secondes]
 *
 * Mesure des **latences réelles** plutôt que d'affirmer que « ça tient la
 * charge ». Les chiffres produits ici ne valent que pour cette machine ; leur
 * intérêt est comparatif — avant et après une modification, ou entre une et
 * plusieurs instances.
 *
 * La p95 est rapportée en plus de la moyenne, et c'est le chiffre qui compte :
 * une moyenne de 40 ms peut masquer 5 % de requêtes à 3 secondes, c'est-à-dire
 * un utilisateur sur vingt qui trouve l'application inutilisable.
 */
const [, , urlArg, concurrencyArg, durationArg, rpsArg] = process.argv;

const BASE = (urlArg ?? 'https://localhost').replace(/\/$/, '');
const CONCURRENCY = Number(concurrencyArg ?? 8);
const DURATION_MS = Number(durationArg ?? 15) * 1000;

/**
 * Débit visé, en requêtes par seconde.
 *
 * Il existe parce que la limitation de débit fausse toute mesure non cadencée :
 * à pleine vitesse, l'immense majorité des réponses sont des 429 — vides et
 * immédiats — et les latences affichées décrivent le refus, pas le service.
 *
 * La valeur par défaut reste sous le quota de lecture (300/min, soit 5/s). Pour
 * chercher le plafond de débit réel, il faut relever ce quota le temps de la
 * mesure ; l'automatiser reviendrait à inscrire un contournement de la
 * protection dans le code de production.
 */
const TARGET_RPS = Number(rpsArg ?? 4);

/*
 * Certificat auto-signé sur le poste de développement. Jamais en production :
 * la variable désactive toute vérification, donc la protection contre
 * l'interception.
 */
if (BASE.includes('localhost')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * Les parcours mesurés.
 *
 * Volontairement des lectures publiques : ce sont elles qui portent le trafic
 * d'une plateforme touristique. Marteler l'écriture mesurerait la contention
 * des verrous plutôt que la tenue en charge, et créerait des milliers de
 * réservations fantômes.
 */
const ROUTES = [
  { label: 'Liste des hôtels', path: '/api/hotels?limit=20' },
  { label: 'Catégories (mises en cache)', path: '/api/categories' },
  { label: 'Carte, cadre visible', path: '/api/map?swLat=17.9&swLng=-16.2&neLat=18.2&neLng=-15.7' },
  { label: 'Recherche textuelle', path: '/api/hotels?search=plage' },
];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function measure(route) {
  const latencies = [];
  let errors = 0;
  let limited = 0;
  let requests = 0;

  const deadline = Date.now() + DURATION_MS;

  // Intervalle entre deux départs, réparti sur les ouvriers.
  const intervalMs = (1000 / TARGET_RPS) * CONCURRENCY;

  async function worker() {
    while (Date.now() < deadline) {
      const cycleStartedAt = Date.now();
      const startedAt = performance.now();
      try {
        const response = await fetch(`${BASE}${route.path}`);

        /*
         * Les 429 sont comptés **à part**, et c'est indispensable.
         *
         * Ce ne sont pas des erreurs — la limitation fait son travail — mais ce
         * sont des réponses vides et immédiates. Les mêler aux autres fait
         * chuter la latence mesurée à mesure que le serveur refuse davantage :
         * le test afficherait des chiffres d'autant plus flatteurs qu'il
         * mesurerait moins de travail réel.
         */
        if (response.status === 429) {
          limited += 1;
          await response.arrayBuffer();
          continue;
        }

        if (!response.ok) errors += 1;
        await response.arrayBuffer();
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - startedAt);
      requests += 1;

      // Cadencement : on complète le cycle plutôt que d'enchaîner. Sans cela le
      // débit dépendrait de la latence, et une réponse rapide accélérerait la
      // cadence jusqu'à déclencher la limitation qu'on cherche à éviter.
      const remaining = intervalMs - (Date.now() - cycleStartedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  const startedAt = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const elapsedSeconds = (Date.now() - startedAt) / 1000;

  latencies.sort((a, b) => a - b);

  return {
    label: route.label,
    requests,
    errors,
    limited,
    rps: requests / elapsedSeconds,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: latencies.at(-1) ?? 0,
  };
}

console.log(`\nCible       : ${BASE}`);
console.log(`Concurrence : ${CONCURRENCY}`);
console.log(`Durée       : ${DURATION_MS / 1000} s par parcours\n`);

console.log(
  `${'Parcours'.padEnd(30)} ${'servies/s'.padStart(10)} ${'p50'.padStart(8)} ` +
    `${'p95'.padStart(8)} ${'p99'.padStart(8)} ${'refusées'.padStart(9)} ${'err'.padStart(5)}`,
);
console.log('-'.repeat(84));

let totalErrors = 0;
let unreliable = 0;

for (const route of ROUTES) {
  const result = await measure(route);
  totalErrors += result.errors;

  /*
   * Au-delà de la moitié de réponses refusées, les latences ne décrivent plus
   * le service : elles décrivent le refus. On le signale au lieu d'afficher un
   * chiffre trompeusement bon.
   */
  const total = result.requests + result.limited;
  const limitedRatio = total > 0 ? result.limited / total : 0;
  if (limitedRatio > 0.5) unreliable += 1;

  console.log(
    `${result.label.padEnd(30)} ${result.rps.toFixed(0).padStart(10)} ` +
      `${result.p50.toFixed(0).padStart(7)}ms ${result.p95.toFixed(0).padStart(7)}ms ` +
      `${result.p99.toFixed(0).padStart(7)}ms ${String(result.limited).padStart(9)} ` +
      `${String(result.errors).padStart(5)}` +
      (limitedRatio > 0.5 ? '   ← mesure non représentative' : ''),
  );

  // Fenêtre de repos : sans elle, le quota consommé par un parcours ferait
  // refuser le suivant, et l'on mesurerait la limitation plutôt que la latence.
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

console.log();

if (totalErrors > 0) {
  console.log(
    `${totalErrors} erreur(s) hors limitation de débit — à examiner avant d'interpréter.\n`,
  );
  process.exitCode = 1;
} else {
  console.log('Aucune erreur serveur.\n');
}
