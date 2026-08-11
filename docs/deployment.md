# Déploiement

Le déploiement suit la progression par phases : chaque étape n'est franchie qu'une fois
la précédente vérifiée en conditions réelles.

> Statut : aucun déploiement n'a encore été réalisé. Ce document décrit le plan.
> Le premier déploiement est l'objet de la **Phase 4**.

## Environnements

| Environnement | Usage                                  | Fichier                     |
| ------------- | -------------------------------------- | --------------------------- |
| development   | Poste local                            | `.env.local`                |
| staging       | Recette avant production               | variables du fournisseur    |
| production    | Public                                 | variables du fournisseur    |

Chaque environnement a **ses propres secrets et sa propre base**. Ne jamais pointer un
environnement de recette vers la base de production : une migration ratée y devient un
incident client.

## Phase 4 — Premier déploiement (Vercel)

### Backend

1. Importer le dépôt sur Vercel, **répertoire racine `backend/`**.
2. Variables d'environnement à renseigner : `MONGODB_URI`, `MONGODB_DB_NAME`,
   `JWT_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `CORS_ORIGINS`, `APP_ENV`, `LOG_LEVEL`.
3. `CORS_ORIGINS` doit contenir l'URL réelle du dashboard déployé.

### Dashboard

1. Second projet Vercel, **répertoire racine `dashboard/`**.
2. Variable : `NEXT_PUBLIC_API_URL` = URL du backend déployé.

> Vercel détecte les workspaces npm et installe depuis la racine : `@tourism/shared`
> est résolu automatiquement. Aucun réglage particulier n'est nécessaire.

### MongoDB Atlas

Créer un cluster, un utilisateur applicatif aux droits limités à la base du projet, et
restreindre l'accès réseau. Vercel utilisant des IP dynamiques, l'accès ouvert est
souvent nécessaire au départ — c'est une raison de plus de migrer vers un VPS à IP fixe
(Phase 15).

### Vérifications avant de passer à la suite

- [ ] `GET /api/health` répond 200 sur l'URL de production
- [ ] Le dashboard s'affiche et joint le backend
- [ ] Aucun secret présent dans le dépôt Git
- [ ] HTTPS actif (automatique chez Vercel)
- [ ] Les en-têtes de sécurité sont bien présents dans les réponses

**Ne pas engager la Phase 5 avant que ces cinq points soient constatés en réel.**

## Phase 15 — Migration vers un VPS

Motif de la migration : Socket.IO et les workers BullMQ nécessitent des processus
longue durée, incompatibles avec le modèle sans serveur de Vercel.

Pile cible : Ubuntu LTS · Docker + Docker Compose · Nginx (terminaison TLS et proxy) ·
Node.js · Redis · workers BullMQ. MongoDB reste sur Atlas — héberger soi-même une base
de données impose une astreinte de sauvegarde et de restauration qui n'apporte rien ici.

Services Docker prévus :

```
nginx        proxy inverse, TLS
backend      API Next.js
realtime     serveur Socket.IO
worker       consommateurs BullMQ
redis        file d'attente + cache + adaptateur Socket.IO
```

Le `docker-compose.yml` est écrit en Phase 15, pas avant : une configuration Docker
rédigée trop tôt décrit une architecture qui n'existe pas encore.

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

Prérequis absolu : **le backend doit être sans état**. Toute donnée conservée en mémoire
de processus (session, compteur de débit, cache local) casse dès la deuxième instance.
C'est pourquoi la contrainte est posée dès la Phase 1, et non au moment de la mise à
l'échelle.

Socket.IO nécessite l'adaptateur Redis pour que deux clients connectés à des instances
différentes reçoivent les mêmes événements.

## Mobile

Les applications mobiles ne se « déploient » pas comme un serveur :

- **Compilation** : EAS Build (`eas build --platform android|ios`)
- **Distribution** : Google Play et App Store
- **Correctifs** : EAS Update pour les modifications purement JavaScript, sans
  repasser par la revue des magasins

Prévoir un profil de build par environnement (staging / production) pointant vers l'API
correspondante.

## Retour arrière

Vercel conserve les déploiements précédents : un retour arrière est immédiat depuis
l'interface. Sur VPS, cela suppose de conserver les images Docker taguées par version —
et non de reconstruire depuis `latest`, ce qui empêche tout retour fiable.
