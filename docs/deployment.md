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

# Phase 15 — Migration vers un serveur propre

## Pourquoi partir de Vercel

Ce n'est pas une préférence. Depuis la Phase 12, deux services **n'ont aucun
hébergement possible** en serverless :

- `realtime` maintient des connexions WebSocket ouvertes ;
- `worker` consomme une file en continu et exécute des tâches différées.

Vercel coupe les exécutions longues par construction. Jusqu'ici ces deux
services tournaient sur le poste de développement, ce qui n'est pas un
déploiement.

S'y ajoutent trois gains : MongoDB et Redis sur le même hôte que l'API
(latence divisée), un pool de connexions dimensionné pour une instance unique au
lieu de dizaines d'instances éphémères, et un coût prévisible.

## Topologie

```
                 Internet
                    │
              ┌─────┴─────┐   80 → 443, ACME
              │   nginx   │   TLS, limitation de bordure
              └─────┬─────┘
        ┌───────────┼───────────┐
        │           │           │
    backend    dashboard    realtime          worker
        │           │           │                │
        └─────┬─────┴───────────┴────────┬───────┘
              │                          │
          ┌───┴───┐                  ┌───┴───┐
          │ mongo │                  │ redis │
          └───────┘                  └───────┘
```

**Seul Nginx publie des ports.** MongoDB et Redis n'en publient aucun : ils ne
sont joignables que par le réseau interne de Docker. Publier 27017 « pour
déboguer » est la première cause d'exposition de bases MongoDB sur Internet.

## Les images

| Image | Base | Taille | Particularité |
| ----- | ---- | ------ | ------------- |
| backend, dashboard | `node:20-alpine` | ~310 Mo | Sortie `standalone` de Next |
| realtime, worker | `node:20-alpine` | ~230 Mo | `npm ci --omit=dev` |

Trois choix méritent d'être explicités.

**Le workspace `mobile` est exclu des images serveur.** Il n'a rien à y faire, et
c'est lui qui porte la chaîne Expo/Metro — donc les vulnérabilités recensées par
`audit:deps`. Les installer les ferait entrer en production alors qu'aucun code
ne les appelle.

**Sortie `standalone`.** Next produit un `server.js` accompagné des seules
dépendances réellement atteintes. Quelques centaines de méga-octets au lieu de
plus d'un giga, et une surface d'attaque réduite à ce qui sert.

**`tini` comme PID 1.** Sans init, Node reçoit le PID 1 et n'hérite pas des
gestionnaires de signaux par défaut : `docker stop` envoie SIGTERM, personne ne
l'écoute, et le conteneur est tué au bout du délai de grâce — au milieu d'une
requête.

Les conteneurs tournent sous un utilisateur non privilégié : une exécution de
code arbitraire y obtient les droits de `nextjs`, pas ceux de root.

## Mise en service

```bash
# 1. Préparation du serveur (une seule fois)
./scripts/provision-vps.sh admin@exemple.mr

# 2. Configuration
cp .env.example .env && $EDITOR .env

# 3. Certificats — Nginx doit déjà écouter sur 80 pour le défi ACME
docker compose up -d nginx
docker run --rm -v ./docker/nginx/certs:/etc/letsencrypt -v certbot-www:/var/www/certbot   certbot/certbot certonly --webroot -w /var/www/certbot   --email admin@exemple.mr --agree-tos -d api.exemple.mr -d admin.exemple.mr -d ws.exemple.mr

# 4. Démarrage
npm run stack:up

# 5. Vérification
npm run verify:deployment https://api.exemple.mr https://admin.exemple.mr
```

## Sauvegardes

```bash
npm run backup                              # quotidien, par cron
bash scripts/restore.sh --dry-run backups/… # vérification
bash scripts/restore.sh backups/…           # restauration réelle
```

**Une sauvegarde jamais restaurée n'est pas une sauvegarde, c'est une
hypothèse.** `--dry-run` rejoue l'archive dans une base jetable, compte les
documents, puis la supprime — sans toucher à la production.

Deux garde-fous méritent d'être connus :

- La rétention est appliquée **après** contrôle de la nouvelle archive. Purger
  d'abord reviendrait à détruire les seules sauvegardes utilisables si le dump
  du jour a échoué.
- Une archive vide fait échouer le script. `mongodump` peut renvoyer 0 en
  produisant un fichier vide — base inexistante, nom mal orthographié — et une
  sauvegarde vide qui se déclare réussie est pire que pas de sauvegarde.

La restauration réelle exige de retaper le nom de la base. `--drop` remplace les
collections : restaurer par erreur une archive de la veille effacerait une
journée de réservations, sans retour possible.

## Scripts d'exploitation dans l'image

`create-admin` et `seed` sont écrits en TypeScript et lancés par `tsx` en
développement. L'image d'exécution n'a ni TypeScript ni `tsx` : ils sont donc
compilés en JavaScript autonome dans `dist-ops`.

Sans cette étape, **il serait impossible de créer le premier administrateur sur
le serveur** — la plateforme se déploierait sans que personne ne puisse s'y
connecter. Le défaut ne se serait vu qu'au premier déploiement réel.

Le bundle n'externalise **rien**, pas même `mongoose` ou `zod` : les scripts
pèsent 3 Mo mais s'exécutent sans dépendre du `node_modules` de la sortie
standalone, dont le contenu est décidé par l'analyse de Next et ne couvre que ce
que le serveur atteint. Un script d'exploitation qui échoue sur un `Cannot find
module` au moment de créer le premier compte est précisément ce qu'on ne peut
pas se permettre.

```bash
docker compose exec backend node backend/dist-ops/create-admin.js
docker compose exec backend node backend/dist-ops/seed.js   # jeu de démonstration
```

## Vérifier la pile

```bash
bash scripts/test-stack.sh
```

Deux niveaux, délibérément séparés :

- **Les applications**, jointes par le réseau interne (`http://backend:3000`),
  ce que voient réellement le dashboard et le worker ;
- **La bordure Nginx**, jointe en HTTPS depuis l'hôte, ce que voit un client.

Les mélanger masquerait la moitié des pannes possibles : une image cassée
derrière un Nginx correct, ou l'inverse.

### Faire tourner les suites applicatives contre la pile

```bash
export NODE_TLS_REJECT_UNAUTHORIZED=0        # certificat auto-signé, poste local uniquement
SMOKE_BASE_URL=https://localhost npm run smoke --workspace backend
SMOKE_BACKEND_URL=https://localhost npm run test:journey --workspace mobile
```

`https://localhost` atteint le bloc de l'API : c'est le premier hôte virtuel
déclaré sur le port 443, donc celui que Nginx sert par défaut lorsque le nom
demandé ne correspond à aucun autre.

Joindre le dashboard par son nom exigerait une entrée dans le fichier `hosts`,
donc les droits administrateur. Le contourner en publiant son port
reviendrait à tester une topologie qui n'existe pas en production ; sa suite se
lance donc depuis le réseau interne :

```bash
docker compose run --rm --no-deps --entrypoint sh   -e SMOKE_DASHBOARD_URL=http://dashboard:3000   -e SMOKE_BACKEND_URL=http://backend:3000   backend -c "node /app/…"
```

`NODE_TLS_REJECT_UNAUTHORIZED=0` ne doit jamais quitter le poste de
développement : la variable désactive toute vérification de certificat, donc la
protection contre l'interception.

## Six pannes réelles trouvées par la conteneurisation

Ces défauts existaient déjà dans le code ; ils étaient invisibles parce que le
développement ne s'exécute ni sous un utilisateur non privilégié, ni depuis un
`node dist/`, ni derrière un proxy.

| Panne | Ce qu'elle aurait coûté |
| ----- | ----------------------- |
| `realtime` et `worker` ne démarraient **jamais** hors de `tsx` : leurs imports de `@tourism/shared` pointaient sur du TypeScript | Les deux services n'auraient pas démarré au premier déploiement |
| Nginx résolvait ses upstreams au chargement | Un service absent empêchait Nginx de démarrer *entièrement* : une panne en provoquait trois |
| `create-admin` inexécutable dans l'image | Plateforme déployée sans que personne ne puisse s'y connecter |
| Volume `uploads` créé sous root, conteneur exécuté sous l'uid 1001 | Chaque téléversement de photo en « permission denied » |
| Compose transmet une variable vide comme `""`, refusé par Zod | Refus de démarrage à cause d'un secret volontairement non renseigné |
| Nginx renvoyait du **HTML** sur un dépassement de quota | Tout client analysant le JSON échouait sur une erreur de syntaxe au lieu de comprendre qu'il doit ralentir |

Une septième, plus insidieuse, concerne l'outillage : Prettier inférait un
parseur pour les fichiers `.inc` de Nginx et fusionnait les commentaires avec les
directives. Le fichier restait plausible à l'œil ; seul `nginx -t` le révélait.
`docker/nginx/**` est désormais exclu du formatage.

## Ce qui n'a pas pu être vérifié

Tout le reste de cette phase a été exécuté : images construites, pile démarrée,
suites de tests passées contre les conteneurs, restauration réellement rejouée.
**Ces points-là ne l'ont pas été**, faute de serveur :

| Élément | Pourquoi |
| ------- | -------- |
| Émission Let's Encrypt | Exige un domaine public et le port 80 accessible depuis Internet |
| `ufw`, `fail2ban`, durcissement SSH | Modifient le pare-feu et l'accès d'une vraie machine |
| DNS | Aucun domaine enregistré |

Les certificats locaux sont **auto-signés** : ils prouvent que la terminaison
TLS et le routage fonctionnent, pas qu'une autorité de certification les
accepterait.

Gardez une session SSH ouverte pendant `provision-vps.sh`. Si la configuration
vous verrouille dehors, seule une session déjà établie permet de revenir.

## Retour arrière

Vercel reste déployable tant que le DNS n'a pas basculé. La bascule se fait par
le DNS, pas par le code : en cas de problème, on repointe les enregistrements et
la Phase 4 reprend du service. Les données, elles, ont bougé — d'où l'importance
d'avoir restauré une sauvegarde **avant** de basculer.

# Phase 16 — Mise à l'échelle

## Ce que cette phase démontre

Les phases précédentes ont **promis** que le backend restait sans état. Tant
qu'une seule instance tournait, ce n'était qu'une intention. Voici la preuve.

```bash
npm run test:scaling          # backend ×3, temps réel ×2
```

| Propriété | Mesure |
| --------- | ------ |
| Répartition de charge | 21 / 21 / 18 requêtes sur trois instances |
| Session utilisable partout | 30 appels authentifiés, 0 refus, répartis 10 / 10 / 10 |
| Quota **commun** | 300 servies, 40 refusées sur une rafale de 340 — un compteur local en aurait laissé passer 900 |
| Cache partagé | une entrée écrite par une instance sert aux autres |
| Diffusion temps réel | chaque instance reçoit la publication Redis |
| Arrêt d'une instance | 120 requêtes pendant le redémarrage, 0 erreur |

La ligne du quota est la plus parlante : elle prouve d'un seul chiffre que le
travail Redis de la Phase 13 n'était pas décoratif. Avec un compteur en mémoire
de processus, la limite aurait été triplée au moment précis où l'on ajoute des
instances pour absorber une montée en charge.

## Répartition sans blocage au démarrage

Nginx résout `backend` **à chaque requête**, via une variable et le résolveur
interne de Docker. Docker renvoie l'ensemble des adresses des instances, et
Nginx les parcourt à tour de rôle.

Un bloc `upstream` classique offrirait un choix d'algorithme plus riche, mais il
résout au chargement : ajouter une instance exigerait de recharger Nginx, et une
instance absente l'empêcherait de démarrer entièrement (voir Phase 15).

## Un défaut que seules plusieurs instances révèlent

Le volume des téléversements était monté sur `/app/backend/public/uploads`,
alors que le stockage local écrit dans `/app/.uploads` — délibérément hors de
`public/`, que Next ne lit qu'à la construction.

Un volume monté au mauvais endroit ne provoque **aucune erreur**. Chaque
instance écrivait sur son propre disque éphémère : les fichiers disparaissaient
au redémarrage, et derrière trois instances une image téléversée devenait
introuvable dès que la lecture tombait sur une autre.

Avec une seule instance, tout fonctionnait — y compris la suite de tests de la
Phase 15, qui l'avait validée à 25/25. Il a fallu mettre à l'échelle pour le
voir.

La correction du chemin n'a pas suffi, et la seconde cause était plus subtile :
**Next modifie le répertoire de travail du processus** dans sa sortie autonome.
Un chemin construit sur `process.cwd()` désignait donc `/app/backend/.uploads`
là où le volume était monté sur `/app/.uploads` — deux emplacements distincts,
aucune erreur, des fichiers écrits dans le vide.

Le répertoire est désormais **imposé** par `UPLOAD_DIR`, et non déduit. C'est la
leçon générale : un chemin qui dépend du répertoire de travail dépend d'un
détail d'exécution que personne ne contrôle.

## Audit des index

```bash
npm run audit:indexes --workspace backend
```

Chaque requête chaude passe par `explain`. Le contrôle est **structurel** : le
temps d'exécution dépend de la machine et du cache, le plan non — il dit si la
requête passera à l'échelle.

Le prédicat géographique est testé **isolément**, sans filtre de statut. Sur
trois documents, le planificateur choisit n'importe quel index et applique la
contrainte géographique après coup : le plan obtenu ne dit alors rien du
comportement sur trois mille fiches.

C'est précisément ainsi qu'a été trouvé le défaut le plus coûteux de cette
phase : la requête d'emprise de la carte utilisait `$geoWithin: { $box: … }`, un
opérateur de coordonnées **héritées** qui ne sait utiliser qu'un index `2d`,
jamais un `2dsphere`. La requête était parfaitement correcte et parcourait la
collection entière — à chaque déplacement de carte, c'est-à-dire la requête la
plus fréquente de l'application. Remplacée par un polygone GeoJSON, elle utilise
maintenant `IXSCAN(location_2dsphere)`.

Le rapport signale les collections de moins de cent documents : un plan mesuré
sur un jeu de démonstration ne garantit rien.

## Mesure de charge

```bash
npm run test:load -- https://api.exemple.mr 8 15 4
#                    url                   conc durée req/s
```

Le débit est **cadencé**, et c'est indispensable. À pleine vitesse, la
limitation de débit refuse l'immense majorité des requêtes ; ces 429 sont vides
et immédiats, et les latences affichées décrivent alors le refus, pas le
service. Sans ce cadencement, le premier essai annonçait 2 000 req/s à 9 ms —
un chiffre entièrement produit par des rejets.

Relevé sur le poste de développement, à 4 req/s :

| Parcours | p50 | p95 | p99 |
| -------- | --- | --- | --- |
| Liste des hôtels | 35 ms | 87 ms | 172 ms |
| Catégories (en cache) | 29 ms | 84 ms | 86 ms |
| Carte, cadre visible | 48 ms | 75 ms | 92 ms |
| Recherche textuelle | 40 ms | 84 ms | 89 ms |

Ces chiffres ne valent que pour cette machine — Docker Desktop sous Windows, TLS
compris. Leur intérêt est **comparatif** : avant et après une modification.

Pour chercher un plafond de débit réel, il faut relever le quota le temps de la
mesure. L'automatiser reviendrait à inscrire un contournement de la protection
dans le code de production.

## Ressources statiques

Aucun en-tête de cache n'est ajouté par Nginx. Next sert déjà ses actifs hachés
avec `public, max-age=31536000, immutable` — vérifié, pas supposé. En rajouter
un dupliquerait la règle à deux endroits, avec la certitude qu'ils divergent un
jour.

## CDN et pare-feu applicatif — non vérifiés

Un CDN placé devant la plateforme apporterait trois choses : la mise en cache des
images au plus près des visiteurs, l'absorption des attaques volumétriques avant
qu'elles n'atteignent le serveur, et un pare-feu applicatif.

**Rien de tout cela n'a pu être vérifié** : ces services se placent devant une
infrastructure publique, avec un domaine réel. Les recommandations qui suivent
sont raisonnées, pas éprouvées.

- **Ne pas mettre le CDN en cache devant l'API.** Les réponses dépendent du
  jeton ; une réponse mise en cache pour un compte et servie à un autre est une
  fuite de données. Seules les images téléversées s'y prêtent.
- **Conserver la limitation applicative.** Celle du CDN travaille sur l'adresse
  IP ; la nôtre compte par compte et connaît les rôles. Elles se complètent.
- **Vérifier l'en-tête d'adresse réelle.** Derrière un CDN, `X-Forwarded-For`
  contient la chaîne complète des relais. Notre configuration Nginx le
  **réécrit** avec l'adresse qu'elle observe : correct en bordure directe, faux
  derrière un CDN, où il faudrait faire confiance à l'en-tête du fournisseur —
  et seulement au sien, sur ses plages d'adresses.

Ce dernier point est un vrai piège : mal traité, toute la limitation de débit
compte le trafic mondial sur une poignée d'adresses de relais.

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
