# Architecture

## Vue d'ensemble

La plateforme est un **monorepo npm workspaces** contenant trois applications et un
paquet partagé. Le principe directeur : **une seule source de vérité pour la logique
métier**, côté backend. Le mobile et le dashboard sont des clients de la même API.

```
tourism-platform/
├── mobile/      Application React Native (Expo) — touristes
├── dashboard/   Application Next.js — administration
├── backend/     API REST Next.js (route handlers) + MongoDB
├── realtime/    Service Socket.IO — diffusion temps réel
├── worker/      Worker BullMQ — emails, rappels, entretien
├── shared/      Types, constantes et schémas Zod communs
└── docs/        Documentation
```

## Pourquoi un monorepo

Les trois applications partagent le contrat d'API : formes d'entités, codes d'erreur,
énumérations de statuts, règles de validation. Dupliquer ces définitions garantit une
dérive silencieuse — un statut ajouté côté backend qui n'existe pas côté mobile.
`@tourism/shared` élimine cette classe de bug au niveau du compilateur.

Le paquet partagé est distribué en **TypeScript source** (pas de build préalable) :

- Next.js le compile via `transpilePackages: ['@tourism/shared']`
- Metro le compile nativement (voir `mobile/metro.config.js`)

Conséquence : aucune étape de build intermédiaire, et le rechargement à chaud
fonctionne quand on modifie `shared/`.

## Frontière des responsabilités

| Couche          | Responsabilité                                                        | Interdit                                            |
| --------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| `shared`        | Contrat : types, constantes, schémas Zod                              | Accès réseau, accès base, dépendance à un framework |
| `backend`       | Logique métier, persistance, autorisation, validation d'entrée        | Rendu d'interface                                   |
| `dashboard`     | Interface d'administration, appels API                                | Règles métier (disponibilité, prix, statuts)        |
| `mobile`        | Interface touriste, appels API                                        | Règles métier                                       |

La règle la plus importante : **aucun calcul de disponibilité, de prix ou de
transition de statut ne doit exister côté client**. Un client peut afficher un prix
calculé par le serveur ; il ne le calcule jamais lui-même.

## Architecture backend

```
backend/src/
├── app/api/          Route handlers Next.js (couche HTTP uniquement)
├── config/           Validation des variables d'environnement
├── lib/              Utilitaires transverses (réponses, logs, auth)
├── models/           Schémas Mongoose            (Phase 2)
└── services/         Logique métier              (Phase 2)
```

Les route handlers font trois choses et rien d'autre : valider l'entrée (Zod),
appeler un service, formater la réponse. Toute la logique vit dans `services/`,
ce qui la rend testable sans serveur HTTP.

## Évolution prévue de l'infrastructure

L'architecture cible est construite par étapes, pas d'emblée :

| Étape          | Infrastructure                                       | Phase |
| -------------- | ---------------------------------------------------- | ----- |
| Départ         | Vercel (backend + dashboard) + MongoDB Atlas         | 4     |
| Temps réel     | Socket.IO sur serveur Node dédié                     | 12 ✅ |
| Asynchrone     | Redis + BullMQ, workers séparés de l'API             | 13 ✅ |
| Serveur propre | VPS Ubuntu + Docker + Nginx                          | 15    |
| Échelle        | Cloudflare (CDN/WAF) + load balancer + N instances   | 16    |

Contrainte à respecter dès maintenant pour que cette évolution reste possible :
**le backend doit rester sans état**. Aucune donnée en mémoire de processus
(session, compteur, cache local) — tout état partagé va en base ou, plus tard, en Redis.

## Authentification du dashboard

Le dashboard ne fait **jamais** d'appel au backend depuis le navigateur :

```
navigateur ──► dashboard (server action / server component) ──► backend API
               cookie HTTP-only sur son propre domaine        Authorization: Bearer
```

À la connexion, la server action interroge le backend, reçoit le jeton et le
dépose dans un cookie posé par le dashboard sur **son** domaine. Toutes les
lectures ultérieures partent du serveur Next, qui relit ce cookie et le
transforme en en-tête `Authorization`.

Trois problèmes disparaissent avec cette forme :

- **CORS** — aucune requête inter-origines côté navigateur, donc rien à
  autoriser ;
- **cookies tiers** — en production le dashboard et l'API vivront sur des
  domaines distincts ; un cookie porté par l'API exigerait `SameSite=None`,
  que les navigateurs restreignent de plus en plus ;
- **vol de jeton par XSS** — le jeton n'atteint jamais le JavaScript de la page.

Le contrôle d'accès est appliqué à trois niveaux, du moins au plus fiable :
le middleware constate la présence du cookie (filtre de confort), le layout
protégé revalide la session auprès de `/api/auth/me` à chaque rendu, et l'API
revérifie le rôle sur chaque route. Seul le dernier fait autorité.

Contrainte à connaître : Next interdit d'écrire un cookie pendant le rendu d'un
composant serveur. Une session périmée ne peut donc pas être effacée sur place —
on redirige vers `/login?error=…`, et le middleware laisse passer cette page
lorsqu'une erreur est signalée, sans quoi un cookie invalide provoquerait une
boucle de redirection.

## Temps réel (Phase 12)

```
backend (serverless)                    realtime (Node, longue durée)
  │                                       │
  │  POST /emit  ─────────────────────►   │  io.to(salle).emit(...)
  │  X-Publish-Secret                     │        │
  │                                       │        ▼
  │                                  mobile / dashboard (Socket.IO)
```

**Pourquoi un service séparé.** Les route handlers Next sur Vercel ne peuvent
pas héberger une connexion longue. Le SSE couvrirait les besoins actuels — tous
les événements vont du serveur vers le client — mais serait coupé de la même
façon, et n'offrirait pas de chemin vers l'adaptateur Redis de la Phase 16.

**Transport backend → temps réel.** Un appel HTTP signé d'un secret partagé,
distinct de `JWT_SECRET` : ce sont deux relations de confiance différentes, et
les confondre ferait qu'un jeton client volé permettrait de publier. Le secret
est comparé en **temps constant**, une égalité de chaînes révélant par sa durée
combien de caractères sont corrects.

La Phase 13 remplacera ce transport par Redis pub/sub, ce qui supprimera
l'aller-retour HTTP et permettra de faire tourner plusieurs instances du service.

**Cloisonnement.** Le client ne choisit jamais sa salle : elle est dérivée de son
jeton (`user:<id>`, plus `admins` pour un administrateur). Un `join` piloté par
le client permettrait d'écouter le canal de n'importe qui.

**Le temps réel n'est jamais un socle.** La publication ne lève pas, le service
peut être arrêté, l'application reste pleinement fonctionnelle — simplement sans
mise à jour instantanée. Côté client, un événement ne fait qu'**invalider un
cache** : les données sont ensuite rechargées depuis l'API, seule source de
vérité. Écrire la charge utile directement dans le cache ferait diverger
l'affichage au moindre champ oublié dans l'événement.

## Redis, files et travail différé (Phase 13)

```
                    ┌──────────────┐
   dépose ────────► │    Redis     │ ◄──── consomme
                    │ files+pubsub │
   backend          └──────────────┘          worker
      │                    ▲                     │
      │  cache, débit ─────┘                     │
      │                                          │
      └──────────  /api/internal/*  ◄────────────┘
```

**Rien n'est obligatoire.** Sans `REDIS_URL` : le cache devient transparent, les
files s'exécutent en ligne, la limitation retombe sur un compteur mémoire, le
temps réel repasse par HTTP. L'application entière continue de fonctionner —
c'est la même règle qu'en Phase 12, et elle est vérifiée par le fait que tout le
développement d'avant cette phase se faisait ainsi.

### Pourquoi un workspace `worker/` distinct de `realtime/`

Profils de charge différents, et un traitement d'email qui plante ne doit pas
couper les sockets ouverts. En Phase 15 ce seront deux processus PM2 sur le même
VPS : la séparation ne coûte rien à ce moment-là, alors que les fusionner
maintenant serait difficile à défaire.

### Le worker ne contient aucune logique métier

Chaque tâche se résout en un appel à `/api/internal/*`. C'est la règle posée en
Phase 1 — la logique vit à un seul endroit — et elle vaut ici autant que pour le
mobile ou le dashboard. Le worker n'apporte que ce qu'un backend serverless ne
sait pas faire : **réessayer, différer, répéter**.

Conséquence directe : le worker ne détient ni l'URI MongoDB ni la clé du
fournisseur d'emails. Voir `security.md`.

### Ce que Redis ne remplace pas

| Mécanisme existant                    | Pourquoi il reste en MongoDB |
| ------------------------------------- | ---------------------------- |
| Verrou de réservation (`room-lock`)    | Cœur métier ; le faire dépendre d'un service déclaré facultatif serait une régression |
| Verrouillage de compte (Phase 8)       | Un contrôle de sécurité doit survivre à une purge de cache |
| Purge des sessions et verrous expirés  | Index TTL : MongoDB le fait déjà |
| Idempotence des rappels (`reminderSentAt`) | Une file garantit *au moins* une livraison, jamais exactement une |

Ce dernier point est le plus important de la phase. Le garde-fou contre le
double envoi **ne peut pas** vivre dans la file : il est en base, sous forme
d'une mise à jour conditionnelle, seul endroit où deux workers concurrents se
départagent réellement.

### Ce que l'entretien périodique a révélé

`COMPLETED` existait dans les énumérations depuis la Phase 2 mais n'était
**jamais posé** : un séjour terminé restait « Confirmé » indéfiniment, une
excursion passée restait « Programmée ». C'est le premier traitement de la
plateforme sans déclencheur utilisateur — il lui fallait un ordonnanceur, et
c'est pourquoi il arrive seulement maintenant.

## Contrat d'API

Toutes les réponses ont la même enveloppe :

```jsonc
// Succès
{ "success": true, "data": { ... } }

// Erreur
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": { ... } } }
```

Le client se base sur `error.code` (stable, énuméré dans `shared/src/constants/api.ts`),
jamais sur `error.message` qui est destiné à l'humain et sera traduit.

## Décisions prises et leurs raisons

**Expo plutôt que React Native nu** — permet de construire des binaires iOS sans macOS,
gère `react-native-maps` et les notifications push via des plugins, et `expo prebuild`
donne accès au code natif si un besoin le justifie. Aucune porte n'est fermée.

**Next.js pour le backend** — le dashboard est déjà en Next.js ; un seul framework
réduit la surface d'outillage. Limite connue : les route handlers Next ne peuvent pas
héberger un serveur Socket.IO à connexion longue sur Vercel. En Phase 12, le temps réel
sera un service Node distinct — cette séparation est anticipée, pas subie.

**Objets `as const` plutôt qu'`enum` TypeScript** — les `enum` ne sont pas effaçables
par Babel, qui compile le code React Native. Un `as const` produit un type identique
sans code runtime.
