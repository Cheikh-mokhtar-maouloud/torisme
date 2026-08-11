# Guide de développement

## Prérequis

| Outil   | Version                                                            |
| ------- | ------------------------------------------------------------------ |
| Node.js | **≥ 20.19.4** (voir avertissement ci-dessous)                      |
| npm     | ≥ 10                                                               |
| Git     | ≥ 2.39                                                             |
| MongoDB | Atlas (recommandé) ou instance locale                              |

> **Version de Node** — React Native 0.86 déclare `node >= 20.19.4`. Une version
> inférieure produit des avertissements `EBADENGINE` à l'installation. Le bundle Metro
> se construit malgré tout, mais il est recommandé de passer en 20.19.4+ ou 22 LTS
> avant d'attaquer le travail mobile en Phase 5.

## Installation

```bash
git clone <url>
cd tourism-platform
npm install          # installe les 4 workspaces en une fois
```

Puis créer les fichiers d'environnement à partir des exemples :

```bash
cp backend/.env.example   backend/.env.local
cp dashboard/.env.example dashboard/.env.local
cp mobile/.env.example    mobile/.env.local
```

Générer un `JWT_SECRET` :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Lancer les applications

| Application | Commande               | Port                    |
| ----------- | ---------------------- | ----------------------- |
| Backend API | `npm run dev:backend`  | http://localhost:4000   |
| Dashboard   | `npm run dev:dashboard`| http://localhost:3000   |
| Mobile      | `npm run dev:mobile`   | Expo (QR code)          |

Vérification rapide que le backend répond :

```bash
curl http://localhost:4000/api/health
curl "http://localhost:4000/api/health?deep=true"   # vérifie aussi MongoDB
```

### Données de développement

```bash
npm run seed --workspace backend      # remplit la base (idempotent, refusé en production)
```

Comptes créés par le seed :

| Compte  | Email                   | Mot de passe   |
| ------- | ----------------------- | -------------- |
| Admin   | `admin@tourism.mr`      | `Admin123!`    |
| Touriste| `touriste@example.com`  | `Touriste123!` |

### Test de fumée de l'API

Serveur démarré et base remplie, puis :

```bash
npm run smoke --workspace backend     # 40 vérifications HTTP de bout en bout
```

Il couvre l'autorisation par rôle, la visibilité des brouillons, la validation,
la pagination, la recherche géographique et le rejet des injections d'opérateurs
MongoDB. À relancer après toute modification du backend.

### Tests du dashboard

Backend et dashboard démarrés, base remplie :

```bash
npm run smoke         --workspace dashboard   # 30 vérifications HTTP
npm run test:payloads --workspace dashboard   # 14 vérifications des formulaires
```

Le premier vérifie la protection des routes, le cloisonnement des rôles et le
rendu de chaque page. Le second teste la conversion `FormData` → corps de
requête — notamment l'ordre des coordonnées GeoJSON — puis envoie réellement
ces corps à l'API pour s'assurer que formulaires et schémas Zod ne divergent pas.

> **Mobile sur appareil physique** : `localhost` désigne le téléphone, pas votre
> machine. Renseigner l'IP locale du poste de développement dans
> `mobile/.env.local` (`EXPO_PUBLIC_API_URL=http://192.168.x.x:4000`).

## Contrôles qualité

```bash
npm run typecheck      # tsc --noEmit sur les 4 workspaces
npm run lint           # ESLint
npm run format         # Prettier (écriture)
npm run format:check   # Prettier (vérification seule)
npm run build          # build de production backend + dashboard
```

Ces quatre commandes doivent passer avant tout commit.

## Le paquet partagé

`@tourism/shared` contient trois espaces :

```ts
import { BookingStatus, API_ROUTES } from '@tourism/shared/constants';
import type { Hotel, Paginated } from '@tourism/shared/types';
import { loginSchema } from '@tourism/shared/validation';
```

Il est distribué en TypeScript source : **aucun build n'est nécessaire**, une
modification est prise en compte immédiatement par Next et par Metro.

Ce qui y a sa place : types d'entités, énumérations, constantes de configuration,
schémas Zod. Ce qui n'y a pas sa place : code réseau, accès base, dépendance à React
ou à Next — le paquet doit rester utilisable par les trois applications.

## Conventions

**TypeScript** — `strict` partout, plus `noUncheckedIndexedAccess`,
`noUnusedLocals` et `noUnusedParameters`. `any` est interdit par ESLint ; utiliser
`unknown` et affiner.

**Nommage** — fichiers en `kebab-case`, composants React en `PascalCase`, types et
interfaces en `PascalCase`, constantes en `SCREAMING_SNAKE_CASE`.

**Logs** — passer par `backend/src/lib/logger.ts`. `console.*` est bloqué par ESLint
dans le backend.

**Validation** — toute entrée client est validée par un schéma Zod côté serveur, sans
exception. Une validation côté client est un confort d'interface, jamais une protection.

## Git

Commits au format [Conventional Commits](https://www.conventionalcommits.org/) :

```
feat(hotels): add hotel CRUD API
fix(bookings): prevent duplicate reservations
chore(deps): update dependencies
docs(api): document error codes
```

Portées usuelles : `auth`, `hotels`, `rooms`, `bookings`, `excursions`, `map`,
`mobile`, `dashboard`, `shared`, `deps`, `docs`.

Un commit = une modification cohérente. Ne pas fabriquer de commits sans contenu réel.

## Structure des dossiers

```
backend/
├── scripts/          seed.ts, smoke-test.ts
└── src/
    ├── app/api/      Route handlers (HTTP uniquement)
    ├── config/       Validation d'environnement
    ├── lib/          Connexion base, auth, erreurs, requêtes, sérialisation
    ├── models/       Schémas Mongoose
    └── services/     Logique métier

dashboard/
├── scripts/          smoke-test.mjs, payload-test.ts
└── src/
    ├── app/
    │   ├── login/        Connexion (hors zone protégée)
    │   └── (dashboard)/  Zone protégée : un module par dossier
    ├── components/
    │   ├── ui/           Boutons, champs, cartes, badges
    │   ├── data/         Tableau, pagination, barre de filtres
    │   ├── forms/        Groupes de champs partagés
    │   └── layout/       Sidebar
    ├── lib/
    │   ├── api/          Client HTTP serveur, erreurs typées
    │   ├── auth/         Session par cookie, garde administrateur
    │   └── payloads.ts   FormData → corps de requête (testé)
    └── middleware.ts

mobile/
├── App.tsx           Point d'entrée
└── src/
    ├── config/       Configuration runtime
    ├── theme/        Jetons de design
    ├── navigation/   Navigation             (Phase 5)
    ├── screens/      Écrans                 (Phase 5)
    ├── components/   Composants             (Phase 5)
    └── api/          Client API             (Phase 5)
```

## Problèmes courants

**`Configuration d'environnement invalide` au démarrage du backend** — un `.env.local`
manque ou une variable requise est vide. Le message liste les champs fautifs ; c'est
volontaire, un secret manquant doit échouer au démarrage et non au premier appel.

**Metro ne trouve pas `@tourism/shared`** — vérifier que `npm install` a été lancé
**depuis la racine** (les workspaces ne sont liés que de là), et que
`mobile/metro.config.js` est bien présent.

**Erreurs de résolution après ajout d'une dépendance mobile** — vider le cache Metro :
`npx expo start --clear`.
