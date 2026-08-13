/**
 * Audit des dépendances.
 *
 * `npm audit` seul ne suffit pas : il signale la même chose depuis des mois, on
 * s'habitue à sa sortie, et le jour où une vraie faille apparaît elle se perd
 * au milieu. Ce script transforme le rapport en **décision** — échec ou succès.
 *
 * Deux traitements sont nécessaires pour que cette décision ait un sens.
 *
 * 1. **Remonter à la cause racine.** `npm audit` marque comme vulnérable toute
 *    la chaîne de dépendance : une faille dans `image-size` fait apparaître
 *    `metro`, `react-native` et une dizaine d'autres. Les traiter comme des
 *    failles distinctes produit un décompte impressionnant et sans information.
 * 2. **Vérifier le confinement.** Une exception affirme « ce paquet n'est pas
 *    atteignable en production ». Cette affirmation doit être contrôlée à
 *    chaque exécution, pas crue sur parole : le script relit l'arbre de
 *    dépendances et échoue si le paquet apparaît ailleurs que prévu.
 *
 * Usage :
 *   npm run audit:deps
 */
import { execFileSync } from 'node:child_process';

/**
 * Exceptions, chacune justifiée, datée, et **confinée à un workspace**.
 *
 * Ce n'est pas une liste de choses à ignorer mais une liste de décisions
 * prises. Une exception sans date devient permanente par simple oubli ; une
 * exception sans périmètre continuerait de couvrir le paquet le jour où il
 * atterrit dans le backend, là où il serait réellement exploitable.
 */
const ACCEPTED = [
  {
    name: 'image-size',
    /** Seul ce workspace a le droit de tirer le paquet. */
    confinedTo: 'mobile',
    reason:
      'Metro l’utilise pour lire les dimensions des images pendant le bundling. Il ne part ' +
      'jamais dans l’application : la faille exige de faire analyser un fichier ICNS/JXL/HEIF ' +
      'hostile, ce qui supposerait un asset hostile déjà commité dans le dépôt. Sera résolu ' +
      'par la prochaine montée de version d’Expo.',
    reviewedOn: '2026-08-13',
  },
  {
    name: 'uuid',
    confinedTo: 'mobile',
    reason:
      '@expo/config-plugins le tire via « xcode » pour éditer le projet Xcode lors d’un ' +
      'prebuild. Outillage de build exécuté sur une machine de développement, absent du ' +
      'serveur comme de l’application.',
    reviewedOn: '2026-08-13',
  },
];

const REVIEW_AFTER_DAYS = 90;
const BLOCKING = new Set(['high', 'critical']);

/*
 * Sous Windows, `npm` est un script `.cmd`, et Node 20 refuse de le lancer sans
 * shell. Le passage par le shell est sans danger **ici précisément** : tous les
 * arguments sont des littéraux, rien n'est interpolé. La même construction avec
 * une valeur venue de l'extérieur serait une injection de commande.
 */
const isWindows = process.platform === 'win32';
const NPM = isWindows ? 'npm.cmd' : 'npm';

function npmJson(args) {
  try {
    return JSON.parse(
      execFileSync(NPM, args, {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        ...(isWindows ? { shell: true } : {}),
      }),
    );
  } catch (error) {
    // `npm audit` et `npm ls` sortent en code 1 dès qu'il y a quelque chose à
    // signaler : la sortie est récupérée depuis l'erreur, sans quoi le script
    // s'arrêterait avant d'avoir rien analysé.
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

/**
 * Remonte aux paquets réellement porteurs d'une faille.
 *
 * Dans le rapport de `npm audit`, une entrée de `via` est soit un **objet** —
 * l'avis de sécurité lui-même, donc une cause racine — soit une **chaîne**,
 * c'est-à-dire le nom d'un autre paquet vulnérable dont celui-ci hérite. On
 * suit les chaînes jusqu'aux objets.
 */
function rootCauses(name, byName, seen = new Set()) {
  if (seen.has(name)) return new Set();
  seen.add(name);

  const vulnerability = byName[name];
  if (!vulnerability) return new Set();

  const roots = new Set();

  for (const entry of vulnerability.via ?? []) {
    if (typeof entry === 'object') {
      roots.add(entry.name ?? name);
      continue;
    }
    if (entry === name) {
      roots.add(name);
      continue;
    }
    for (const root of rootCauses(entry, byName, seen)) roots.add(root);
  }

  /*
   * Le repli sur `name` ne vaut que pour un paquet **sans** `via` : lui seul est
   * réellement sa propre cause. L'appliquer aussi à un nœud dont la remontée
   * s'est arrêtée sur un cycle — `metro-config` et `metro-transform-worker` se
   * citent mutuellement — les ferait passer pour des causes racines et rendrait
   * toute exception inopérante.
   */
  if (roots.size > 0) return roots;
  return (vulnerability.via ?? []).length === 0 ? new Set([name]) : new Set();
}

/**
 * Détermine quels workspaces tirent un paquet.
 *
 * C'est le contrôle qui donne sa valeur à l'exception. Sans lui, écrire
 * « non atteignable en production » suffirait à faire taire l'alerte, y compris
 * le jour où l'affirmation cesse d'être vraie.
 */
function workspacesPulling(name) {
  const tree = npmJson(['ls', name, '--json', '--all']);
  const found = new Set();

  function walk(node, workspace) {
    for (const [child, details] of Object.entries(node.dependencies ?? {})) {
      // Au premier niveau, chaque enfant est un workspace du monorepo.
      const current = workspace ?? child;
      if (child === name) found.add(current);
      walk(details ?? {}, current);
    }
  }

  walk(tree, undefined);
  return found;
}

function main() {
  const report = npmJson(['audit', '--json']);
  const byName = report.vulnerabilities ?? {};

  const blocking = [];
  const accepted = new Map();
  const warnings = [];

  for (const vulnerability of Object.values(byName)) {
    if (!BLOCKING.has(vulnerability.severity)) continue;

    const roots = [...rootCauses(vulnerability.name, byName)];
    const exceptions = roots.map((root) => ACCEPTED.find((entry) => entry.name === root));

    if (exceptions.some((exception) => !exception)) {
      blocking.push({ name: vulnerability.name, severity: vulnerability.severity, roots });
      continue;
    }

    for (const exception of exceptions) {
      accepted.set(exception.name, [...(accepted.get(exception.name) ?? []), vulnerability.name]);
    }
  }

  console.log('\nAudit des dépendances\n');

  const counts = report.metadata?.vulnerabilities ?? {};
  console.log(
    `  Signalées : ${counts.critical ?? 0} critiques, ${counts.high ?? 0} hautes, ` +
      `${counts.moderate ?? 0} modérées, ${counts.low ?? 0} basses`,
  );

  for (const [name, affected] of accepted) {
    const exception = ACCEPTED.find((entry) => entry.name === name);

    const pulledBy = workspacesPulling(name);
    const unexpected = [...pulledBy].filter((workspace) => workspace !== exception.confinedTo);

    console.log(`\n  ${name} — cause racine de ${affected.length} signalement(s)`);
    console.log(`    Tiré par : ${[...pulledBy].join(', ') || 'introuvable'}`);
    console.log(`    ${exception.reason}`);

    if (unexpected.length > 0) {
      blocking.push({
        name,
        severity: 'high',
        roots: [name],
        detail:
          `l’exception le confine à « ${exception.confinedTo} » mais il est aussi tiré par ` +
          `${unexpected.join(', ')} — le raisonnement de non-atteignabilité ne tient plus`,
      });
    }

    const age = Math.round((Date.now() - Date.parse(exception.reviewedOn)) / 86_400_000);
    if (age > REVIEW_AFTER_DAYS) {
      warnings.push(
        `L’exception « ${name} » date de ${age} jours. Une montée de version la résout ` +
          'peut-être désormais.',
      );
    }
  }

  for (const warning of warnings) console.log(`\n  ATTENTION  ${warning}`);

  if (blocking.length > 0) {
    console.log('\n  BLOQUANTES :');
    for (const item of blocking) {
      console.log(`    - ${item.name} (${item.severity})`);
      console.log(`      ${item.detail ?? `cause racine : ${item.roots.join(', ')}`}`);
    }
    console.log(
      '\nCorrigez, ou ajoutez une exception datée, justifiée et confinée dans ' +
        'scripts/audit-dependencies.mjs si la faille n’est pas atteignable.\n',
    );
    process.exit(1);
  }

  console.log('\nAucune vulnérabilité haute ou critique non justifiée.\n');
}

main();
