/**
 * Captures d'écran du tableau de bord, pour la documentation.
 *
 * Usage :
 *   node scripts/capture-dashboard.mjs
 *
 * ─── Pourquoi un navigateur piloté ──────────────────────────────────────────
 *
 * Le mode `--screenshot` de Chrome photographie une URL, sans plus. Toutes les
 * pages intéressantes du tableau de bord sont derrière une authentification :
 * il faut donc remplir un formulaire, attendre la redirection, puis capturer.
 *
 * `puppeteer-core` et non `puppeteer` : le premier pilote le Chrome déjà
 * installé, le second en télécharge un de 150 Mo. Pour des captures, la
 * différence ne se justifie pas.
 */

import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import puppeteer from 'puppeteer-core';

const BASE = process.env.DASHBOARD_URL ?? 'http://localhost:3005';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tourism.mr';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin123!';
// Un chemin de système de fichiers, non une URL : `screenshot` attend le
// premier et échoue sur la seconde avec une erreur qui ne le dit pas.
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));

/** Emplacements usuels de Chrome, du plus probable au moins. */
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const executablePath = CANDIDATES.find((path) => existsSync(path));

if (!executablePath) {
  console.error('\nÉchec : Chrome introuvable. Emplacements testés :');
  CANDIDATES.forEach((path) => console.error(`  ${path}`));
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: 'new',
  args: ['--hide-scrollbars', '--disable-gpu'],
});

const page = await browser.newPage();
// 1440 × 900 : une résolution d'écran courante. Plus large donnerait des
// captures illisibles une fois réduites dans un README.
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

async function shoot(name) {
  // Le réseau doit être au repos : sans cette attente, les images des fiches
  // apparaissent comme des rectangles vides sur la capture.
  await page
    .waitForNetworkIdle({ idleTime: 700, timeout: 15_000 })
    .catch(() => {});
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`  ${name}.png`);
}

console.log(`\nCible : ${BASE}\n`);

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
await shoot('dashboard-login');

await page.type('input[type="email"], input[name="email"]', EMAIL);
await page.type('input[type="password"], input[name="password"]', PASSWORD);
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
  page.click('button[type="submit"]'),
]);

/*
 * Les pages sont parcourues dans l'ordre où un administrateur les découvre :
 * vue d'ensemble, puis contenus, puis réservations. Une documentation qui
 * suivrait l'ordre alphabétique des URL ne raconterait rien.
 */
const PAGES = [
  ['', 'dashboard-accueil'],
  ['/hotels', 'dashboard-hotels'],
  ['/restaurants', 'dashboard-restaurants'],
  ['/attractions', 'dashboard-sites'],
  ['/excursions', 'dashboard-excursions'],
  ['/bookings', 'dashboard-reservations'],
];

for (const [path, name] of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2' }).catch(() => {});
  await shoot(name);
}

await browser.close();
console.log('\nCaptures terminées.\n');
