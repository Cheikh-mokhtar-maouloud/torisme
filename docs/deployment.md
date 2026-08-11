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
