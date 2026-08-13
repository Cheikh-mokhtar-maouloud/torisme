# Déploiement

Le déploiement suit la progression par phases : chaque étape n'est franchie qu'une
fois la précédente vérifiée en conditions réelles.

> **Statut** — le code est prêt à être déployé (Phase 4). Le déploiement lui-même
> demande des comptes Vercel et MongoDB Atlas ; ce document est le mode opératoire
> à suivre pas à pas.

## Environnements

| Environnement | Usage                    | Origine des variables            |
| ------------- | ------------------------ | -------------------------------- |
| development   | Poste local              | `.env.local` (non commité)       |
| staging       | Recette avant production | Variables du fournisseur         |
| production    | Public                   | Variables du fournisseur         |

Chaque environnement a **ses propres secrets et sa propre base**. Ne jamais pointer
une recette vers la base de production : une migration ratée y devient un incident
client. `JWT_SECRET` doit différer par environnement, sans quoi un jeton de recette
resterait valide en production.

---

# PHASE 4 — Premier déploiement

## Étape 1 — MongoDB Atlas

1. Créer un compte sur [mongodb.com/atlas](https://www.mongodb.com/atlas) et un
   cluster **M0** (gratuit). Choisir la région la plus proche des utilisateurs —
   `eu-west-1` (Irlande) ou `eu-west-3` (Paris) pour la Mauritanie.
2. **Database Access** → créer un utilisateur applicatif avec le rôle
   `readWrite` **limité à la base du projet**, pas `atlasAdmin`. Un identifiant
   qui fuite ne doit pas donner les pleins pouvoirs sur le cluster.
3. **Network Access** → autoriser les adresses IP.
   Vercel utilise des adresses dynamiques : `0.0.0.0/0` est souvent nécessaire au
   départ. C'est une faiblesse assumée et temporaire — c'est l'une des raisons de
   migrer vers un VPS à IP fixe en Phase 15. Le mot de passe applicatif devient
   alors la seule barrière : il doit être long et unique.
4. Copier la chaîne de connexion :

   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   ```

   Le mot de passe doit être **encodé pour l'URL** : un `@`, un `/` ou un `#` brut
   casserait l'analyse de la chaîne et produirait une erreur d'authentification
   trompeuse.

## Étape 2 — Backend sur Vercel

1. Importer le dépôt Git dans Vercel.
2. **Root Directory** : `backend`.
3. Activer **« Include files outside of the Root Directory »** — obligatoire :
   sans cela, Vercel n'envoie pas `shared/`, et le build échoue sur
   `Cannot find module '@tourism/shared'`.
4. Framework : Next.js (détecté). Build et install par défaut : Vercel reconnaît
   les workspaces npm et installe depuis la racine.
5. Variables d'environnement (Settings → Environment Variables) :

   | Variable                | Valeur                                            |
   | ----------------------- | ------------------------------------------------- |
   | `MONGODB_URI`           | chaîne Atlas de l'étape 1                         |
   | `MONGODB_DB_NAME`       | `tourism`                                         |
   | `MONGODB_MAX_POOL_SIZE` | `5`                                               |
   | `JWT_SECRET`            | 48 octets aléatoires (commande ci-dessous)        |
   | `JWT_ACCESS_TTL`        | `15m`                                             |
   | `JWT_REFRESH_TTL`       | `30d`                                             |
   | `CORS_ORIGINS`          | à renseigner à l'étape 4                          |
   | `APP_ENV`               | `production`                                      |
   | `LOG_LEVEL`             | `info`                                            |

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   > `NODE_ENV` est défini automatiquement par Vercel : ne pas le déclarer.

6. Déployer, puis vérifier :

   ```bash
   curl https://VOTRE-BACKEND.vercel.app/api/health
   curl "https://VOTRE-BACKEND.vercel.app/api/health?deep=true"   # doit indiquer mongodb connected
   ```

## Étape 3 — Créer le premier administrateur

Sans cette étape, **le dashboard est inutilisable** : le seed est interdit hors
développement et l'inscription publique ne crée que des comptes `USER`.

Depuis le poste de développement, pointé sur la base de production :

```bash
cd backend
MONGODB_URI="mongodb+srv://…" \
MONGODB_DB_NAME=tourism \
ADMIN_EMAIL="admin@votre-domaine.mr" \
ADMIN_PASSWORD="un-mot-de-passe-long-et-unique" \
ADMIN_NAME="Votre Nom" \
npm run create-admin
```

Le script est idempotent : relancé sur un email existant, il promeut le compte
et le réactive sans toucher au mot de passe. C'est aussi la procédure de secours
si le dernier administrateur se retrouve verrouillé dehors.

> Ne jamais committer ces valeurs et éviter de les laisser dans l'historique du
> terminal — préfixer la commande d'un espace suffit sur la plupart des shells.

## Étape 4 — Dashboard sur Vercel

1. Second projet Vercel, **même dépôt**, **Root Directory** : `dashboard`.
2. Activer également **« Include files outside of the Root Directory »**.
3. Variables :

   | Variable    | Valeur                                  |
   | ----------- | --------------------------------------- |
   | `API_URL`   | `https://VOTRE-BACKEND.vercel.app`      |
   | `APP_ENV`   | `production`                            |

   `API_URL` n'est pas préfixée `NEXT_PUBLIC_` : le dashboard n'appelle le backend
   que depuis son serveur. L'URL de l'API n'apparaît donc pas dans le bundle envoyé
   au navigateur.

4. Déployer, puis **revenir au projet backend** et renseigner :

   ```
   CORS_ORIGINS=https://VOTRE-DASHBOARD.vercel.app
   ```

   Sans barre oblique finale. Redéployer le backend pour que la variable prenne effet.

## Étape 5 — Domaine et HTTPS

Vercel fournit le certificat TLS automatiquement.

1. Ajouter le domaine dans Settings → Domains (`admin.votre-domaine.mr` pour le
   dashboard, `api.votre-domaine.mr` pour le backend).
2. Créer les enregistrements DNS indiqués par Vercel chez le registrar.
3. Mettre à jour **`CORS_ORIGINS`** (backend) et **`API_URL`** (dashboard) avec les
   domaines définitifs, puis redéployer les deux.

## Étape 6 — Vérifications avant de passer à la suite

Un script reproduit automatiquement toute la liste :

```bash
npm run verify:deployment https://api.votre-domaine.mr https://admin.votre-domaine.mr
```

Il sort en code 1 si une vérification échoue. Lancé sur `localhost`, il accepte
l'absence d'HTTPS et signale ces points en avertissement — utile pour répéter la
procédure avant de déployer.

Le détail, si vous préférez le faire à la main :

```bash
BACKEND=https://api.votre-domaine.mr
DASHBOARD=https://admin.votre-domaine.mr

# 1. Santé et base de données
curl "$BACKEND/api/health?deep=true"

# 2. En-têtes de sécurité (HSTS doit apparaître en production)
curl -sI "$BACKEND/api/health" | grep -iE "strict-transport|content-security|x-frame"

# 3. CORS : le dashboard est autorisé, un tiers ne l'est pas
curl -sI -H "Origin: $DASHBOARD" "$BACKEND/api/health" | grep -i access-control-allow-origin
curl -sI -H "Origin: https://exemple-tiers.com" "$BACKEND/api/health" | grep -i access-control-allow-origin  # aucune sortie attendue

# 4. Écriture protégée
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BACKEND/api/hotels"   # attendu : 401

# 5. Le dashboard redirige vers la connexion
curl -s -o /dev/null -w "%{http_code}\n" "$DASHBOARD"                    # attendu : 307
```

Liste de contrôle :

- [ ] `GET /api/health?deep=true` répond 200 avec `mongodb: connected`
- [ ] `Strict-Transport-Security` présent
- [ ] Le domaine du dashboard reçoit `Access-Control-Allow-Origin`, un tiers non
- [ ] `POST /api/hotels` sans jeton renvoie 401
- [ ] Le dashboard redirige vers `/login`, la connexion administrateur fonctionne
- [ ] Création, modification et suppression d'un hôtel réussissent depuis le dashboard
- [ ] Aucun secret dans le dépôt Git : `git ls-files | grep -E "\.env$"` ne renvoie rien

**Ne pas engager la Phase 5 avant que ces sept points soient constatés en réel.**

## Retour arrière

Vercel conserve les déploiements précédents : Deployments → « Promote to
Production » sur la version antérieure. Le retour est immédiat et sans build.

Attention : un retour arrière du code ne défait pas une modification de schéma en
base. Tant que les migrations restent additives (ajout de champs optionnels), le
retour est sans risque.

---

# Phase 13 — Redis, files et worker

## Où héberger Redis

| Option           | Quand |
| ---------------- | ----- |
| Upstash          | Serverless : facturé à la commande, aucune instance à maintenir. Le choix par défaut tant que le backend est sur Vercel. |
| Redis Cloud      | Trafic soutenu, où la facturation à la commande devient plus chère qu'une instance. |
| Conteneur du VPS | À partir de la Phase 15, quand un serveur existe déjà. |

Avec un fournisseur géré, l'URL est en `rediss://` (TLS). L'oublier donne une
erreur de protocole difficile à rattacher à sa cause.

## Variables à ajouter

Backend :

```
REDIS_URL=rediss://...
REDIS_KEY_PREFIX=tourism        # distinct par environnement
CACHE_TTL_SECONDS=60
INTERNAL_API_SECRET=<32 octets>
```

Service temps réel — **le même** `REDIS_KEY_PREFIX`, sans quoi il s'abonne à un
canal que personne n'alimente :

```
REDIS_URL=rediss://...
REDIS_KEY_PREFIX=tourism
```

Worker :

```
REDIS_URL=rediss://...
REDIS_KEY_PREFIX=tourism
BACKEND_URL=https://api.exemple.mr
INTERNAL_API_SECRET=<identique au backend>
```

> Le préfixe isole les environnements. `staging` et `production` peuvent partager
> une instance Redis, mais avec un préfixe commun `staging` recevrait les
> événements de `production` — donc de vraies notifications poussées vers des
> appareils de test.

## Où héberger le worker

Mêmes contraintes que le service temps réel : un processus **de longue durée**,
impossible sur Vercel. Render, Railway, Fly, ou le VPS de la Phase 15.

Il n'expose aucun port et ne reçoit aucun trafic entrant : il ne lui faut donc ni
domaine, ni certificat, ni règle d'entrée dans le pare-feu — seulement un accès
sortant vers Redis et vers l'API.

Une seule instance suffit. BullMQ en supporte plusieurs, mais rien ne le justifie
avant que le volume d'emails ne devienne le facteur limitant.

## Vérifications

```bash
npm run verify:deployment https://api.exemple.mr https://admin.exemple.mr
```

Contrôle notamment que Redis est configuré et joignable, que les réponses
portent un quota de débit, et que `/api/internal/*` refuse un appel non
authentifié.

Puis, worker démarré :

```bash
npm run test:worker --workspace worker
```

## Si Redis tombe

Rien ne s'arrête. Le cache devient transparent, la limitation retombe sur un
compteur par instance, les emails repartent en envoi direct, le temps réel
repasse par HTTP. `/api/health?deep=true` rapporte `redis.reachable: false`
**sans** dégrader le statut global : une panne de cache ne doit jamais faire
retirer une instance saine du pool.

Ce qui est réellement perdu : les réessais d'email et les rappels différés. Les
rappels déjà programmés sont dans Redis — si l'instance est recréée vide, ils ne
partiront pas. Les réservations, elles, ne sont pas affectées.

Après une purge ou un redémarrage sans persistance, le worker réenregistre son
planning d'entretien de lui-même, dans un délai de quinze minutes.

# Phase 14 — Sécurité de production

## Avant chaque mise en production

```bash
npm run audit:deps                                    # dépendances
npm run test:security --workspace backend             # protections
npm run verify:deployment https://api… https://admin… # conformité réelle
```

Les trois échouent en code 1 : ils sont utilisables tels quels dans une chaîne
d'intégration.

## Variables ajoutées

`JWT_SECRET_PREVIOUS` — vide en temps normal, renseignée seulement pendant une
rotation, **sur le backend et le service temps réel à la fois**. La procédure
complète est dans `security.md`.

## Ce que la Phase 14 ne couvre pas

HTTPS, certificats et pare-feu relèvent de la Phase 15 : Vercel les fournit
aujourd'hui, et il n'y a pas encore de serveur à configurer. WAF et protection
DDoS relèvent de la Phase 16, puisqu'ils se placent devant une infrastructure
qui n'existe pas encore.

# Phases suivantes

## Phase 15 — Migration vers un VPS

Motif : Socket.IO et les workers BullMQ nécessitent des processus de longue durée,
incompatibles avec le modèle sans serveur de Vercel.

Pile cible : Ubuntu LTS · Docker + Docker Compose · Nginx (terminaison TLS et proxy
inverse) · Node.js · Redis · workers BullMQ. MongoDB reste sur Atlas — l'héberger
soi-même impose une astreinte de sauvegarde et de restauration sans contrepartie ici.

Services prévus :

```
nginx        proxy inverse, TLS
backend      API Next.js
realtime     serveur Socket.IO
worker       consommateurs BullMQ
redis        file d'attente + cache + adaptateur Socket.IO
```

Deux réglages changent à ce moment : `MONGODB_MAX_POOL_SIZE` passe de 5 à 20-50
(un processus unique sert tout le trafic, au lieu de nombreuses instances), et
l'accès Atlas peut enfin être restreint à l'IP fixe du serveur.

Le `docker-compose.yml` sera écrit en Phase 15, pas avant : une configuration
Docker rédigée trop tôt décrit une architecture qui n'existe pas encore.

## Phase 16 — Mise à l'échelle

```
Utilisateur → Cloudflare (CDN + WAF + TLS) → Load balancer → Backend ×N
                                                                 ↓
                                                    Redis (file, cache, pub/sub)
                                                                 ↓
                                                       Workers BullMQ ×N
                                                                 ↓
                                                          MongoDB Atlas
```

Prérequis absolu : **le backend doit rester sans état**. Toute donnée conservée en
mémoire de processus (session, compteur de débit, cache local) casse dès la
deuxième instance. C'est pourquoi la contrainte est posée dès la Phase 1.

Socket.IO nécessite l'adaptateur Redis pour que deux clients connectés à des
instances différentes reçoivent les mêmes événements.

## Mobile

Les applications mobiles ne se « déploient » pas comme un serveur :

- **Compilation** : EAS Build (`eas build --platform android|ios`)
- **Distribution** : Google Play et App Store
- **Correctifs** : EAS Update pour les modifications purement JavaScript, sans
  repasser par la revue des magasins

Prévoir un profil de build par environnement, pointant vers l'API correspondante
via `EXPO_PUBLIC_API_URL`.
