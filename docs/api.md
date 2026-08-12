# API REST

Base : `http://localhost:4000` en développement.
La liste des chemins fait foi dans `shared/src/constants/api.ts` — le mobile et le
dashboard ne doivent jamais écrire une URL d'API en dur.

> Statut (Phase 3) : santé, authentification, hôtels, chambres, restaurants,
> attractions, excursions, catégories, **utilisateurs et statistiques** sont
> implémentés et testés. Réservations, avis, favoris et notifications décrivent
> encore le contrat cible.

## Enveloppe de réponse

```jsonc
// 2xx
{ "success": true, "data": { ... } }

// 4xx / 5xx
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Données invalides",
    "fields": { "email": ["Email invalide"] }
  }
}
```

Les listes paginées renvoient :

```jsonc
{
  "success": true,
  "data": {
    "items": [...],
    "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7, "hasNextPage": true }
  }
}
```

## Codes d'erreur

| Code               | HTTP | Signification                                        |
| ------------------ | ---- | ---------------------------------------------------- |
| `VALIDATION_ERROR` | 422  | Corps ou paramètres invalides (`fields` détaille)     |
| `UNAUTHORIZED`     | 401  | Jeton absent, expiré ou invalide                      |
| `FORBIDDEN`        | 403  | Authentifié mais rôle insuffisant                     |
| `NOT_FOUND`        | 404  | Ressource inexistante                                 |
| `CONFLICT`         | 409  | Conflit d'état (email déjà pris…)                     |
| `RATE_LIMITED`     | 429  | Quota dépassé                                         |
| `ROOM_UNAVAILABLE` | 409  | Chambre indisponible sur la période demandée          |
| `EXCURSION_FULL`   | 409  | Plus de places                                        |
| `PAYMENT_FAILED`   | 402  | Paiement refusé par le fournisseur                    |
| `INTERNAL_ERROR`   | 500  | Erreur serveur (détail jamais exposé au client)       |

## Paramètres de requête communs

| Paramètre                   | Défaut | Contrainte        |
| --------------------------- | ------ | ----------------- |
| `page`                      | 1      | entier ≥ 1        |
| `limit`                     | 20     | 1 à 100           |
| `sortBy` / `sortOrder`      | —      | `asc` \| `desc`   |
| `latitude` + `longitude`    | —      | fournis ensemble  |
| `radiusMeters`              | 10 000 | ≤ 200 000         |

## Endpoints

### Santé

| Méthode | Chemin                   | Accès  | Description                                  |
| ------- | ------------------------ | ------ | -------------------------------------------- |
| GET     | `/api/health`            | public | Sonde de disponibilité (le processus répond)  |
| GET     | `/api/health?deep=true`  | public | Vérifie aussi MongoDB (`ping`) ; 503 si KO    |

La sonde superficielle est celle que doit interroger un load balancer : une base
lente ne doit pas faire retirer du pool une instance capable de servir du cache.
La sonde profonde est destinée à la supervision.

### Authentification

| Méthode | Chemin                        | Accès  |
| ------- | ----------------------------- | ------ |
| POST    | `/api/auth/register`          | public |
| POST    | `/api/auth/login`             | public |
| POST    | `/api/auth/logout`            | user   |
| GET     | `/api/auth/me`                | user   |
| POST    | `/api/auth/forgot-password`   | public |
| POST    | `/api/auth/reset-password`    | public |

| POST    | `/api/auth/refresh`           | public (jeton de rafraîchissement) |
| POST    | `/api/auth/change-password`   | user   |
| PATCH   | `/api/auth/profile`           | user   |

**Deux jetons.** Le jeton d'accès dure 15 minutes et n'est pas révocable — c'est
le prix de sa vérification purement cryptographique, sans aller-retour en base.
Le jeton de rafraîchissement dure 30 jours, est stocké haché et **révocable
immédiatement**.

`/api/auth/refresh` applique une **rotation systématique** : le jeton présenté est
consommé, un nouveau est émis. Représenter un jeton déjà consommé signale un vol —
la victime et l'attaquant détiennent la même valeur — et **toutes** les sessions
du compte sont alors révoquées.

Les sessions tombent également lors d'un changement de mot de passe et d'une
réinitialisation : sans cela, le changement ne protégerait pas d'un appareil
compromis.

**Verrouillage** : cinq échecs de connexion bloquent le compte 15 minutes, y
compris avec le bon mot de passe. Cela couvre l'attaque ciblée distribuée, que la
limitation par IP (Phase 14) laisse passer.

`forgot-password` renvoie toujours la même réponse, que l'email existe ou non, et
n'expose jamais le jeton. L'envoi par email arrive en Phase 11 ; en développement,
le jeton est journalisé.

`PATCH /api/auth/profile` accepte `fullName`, `phone` et `avatarUrl`. Ni l'email
ni le rôle : changer l'email suppose de vérifier la nouvelle adresse, et le rôle
ne se modifie que depuis l'administration.

### Images

| Méthode | Chemin                        | Accès  |
| ------- | ----------------------------- | ------ |
| POST    | `/api/uploads`                | admin  |
| DELETE  | `/api/uploads/<providerId>`   | admin  |
| GET     | `/api/files/<chemin>`         | public (stockage local uniquement) |

`POST /api/uploads` attend un `multipart/form-data` avec `file` et `folder`
(`hotels`, `rooms`, `restaurants`, `attractions`, `excursions`, `reviews`). Il
renvoie une référence `{ url, providerId, width, height, order }` à ajouter au
tableau `images` de la fiche via son `PUT`.

Le type est déterminé d'après les **octets du fichier**. Un texte annoncé
`image/jpeg` est refusé en 422, et un JPEG nommé `.png` est correctement identifié.

La suppression est **idempotente** : supprimer un fichier absent renvoie 200.

### Carte

| Méthode | Chemin     | Accès  |
| ------- | ---------- | ------ |
| GET     | `/api/map` | public |

Marqueurs géolocalisés, tous types confondus, en une seule requête. Deux modes
exclusifs :

| Mode | Paramètres | Usage |
| --- | --- | --- |
| Cadre visible | `swLat`, `swLng`, `neLat`, `neLng` | déplacement et zoom de la carte |
| Autour d'un point | `latitude`, `longitude`, `radiusMeters` | « autour de moi », **trié par distance** |

Filtres : `types=HOTEL,RESTAURANT,ATTRACTION,EXCURSION` · `limit` (60 par défaut, 200 max).

Le mode « autour d'un point » est le seul à renvoyer `distanceMeters`, car seul
`$geoNear` expose la distance calculée — et il doit être la **première** étape du
pipeline d'agrégation, ce qui interdit de filtrer en amont.

La réponse porte `countsByType` (compteurs des filtres) et `truncated`, vrai
lorsqu'un plafond a été atteint : la carte invite alors à zoomer plutôt que
d'afficher un sous-ensemble arbitraire sans le dire.

Un cadre incomplet, un cadre inversé (sud-ouest au nord du nord-est) ou une
latitude sans longitude renvoient **422**.

### Contenu

| Méthode | Chemin                        | Accès  |
| ------- | ----------------------------- | ------ |
| GET     | `/api/hotels`                 | public |
| GET     | `/api/hotels/:id`             | public |
| GET     | `/api/hotels/:id/rooms`       | public |
| POST    | `/api/hotels`                 | admin  |
| PUT     | `/api/hotels/:id`             | admin  |
| DELETE  | `/api/hotels/:id`             | admin  |

Le même schéma s'applique à `/api/rooms`, `/api/restaurants`, `/api/attractions`,
`/api/excursions`, `/api/categories` : lecture publique, écriture réservée à `ADMIN`.

### Administration

| Méthode | Chemin              | Accès |
| ------- | ------------------- | ----- |
| GET     | `/api/users`        | admin |
| GET     | `/api/users/:id`    | admin |
| PATCH   | `/api/users/:id`    | admin |
| GET     | `/api/admin/stats`  | admin |

`PATCH /api/users/:id` accepte `fullName`, `phone`, `role` et `isActive`.
L'email en est absent : le modifier sur le compte d'un tiers permettrait d'en
prendre le contrôle via la récupération de mot de passe.

Deux garde-fous sont appliqués côté serveur : un administrateur ne peut ni se
désactiver ni se retirer son propre rôle, et le dernier administrateur actif ne
peut être ni désactivé ni rétrogradé — faute de quoi plus personne n'accéderait
au dashboard.

### Réservations

| Méthode | Chemin                        | Accès                     |
| ------- | ----------------------------- | ------------------------- |
| GET     | `/api/bookings`               | user (les siennes) / admin (toutes) |
| POST    | `/api/bookings`               | user                      |
| GET     | `/api/bookings/:id`           | propriétaire ou admin     |
| PATCH   | `/api/bookings/:id/cancel`    | propriétaire ou admin     |
| PATCH   | `/api/bookings/:id/confirm`   | admin                     |
| GET     | `/api/rooms/:id/availability` | public                    |

`GET /api/rooms/:id/availability?checkIn=…&checkOut=…` renvoie les unités
restantes **et le prix total**. Le montant est calculé par le serveur et n'est
jamais recomposé par un client : un prix envoyé depuis l'application serait
modifiable.

Une réservation inexistante ou appartenant à un tiers renvoie **404**, pas 403 :
répondre « interdit » confirmerait son existence et permettrait de les énumérer.

**Concurrence (résolu en Phase 8).** Le comptage des chevauchements et
l'insertion se déroulent sous un **verrou par chambre**, posé via un index unique
et libéré par TTL en cas de panne du processus. Mesuré : sans verrou, 12
réservations simultanées sur une chambre à une seule unité aboutissaient **toutes
les 12** ; avec, exactement une aboutit et les onze autres reçoivent 409.

Le verrou a été préféré à une transaction parce qu'il ne requiert pas de replica
set : le comportement est donc identique sur une instance locale et sur Atlas.

### Réservations d'excursion

| Méthode | Chemin                                  | Accès                 |
| ------- | --------------------------------------- | --------------------- |
| GET     | `/api/excursion-bookings`               | user / admin (toutes) |
| POST    | `/api/excursion-bookings`               | user                  |
| GET     | `/api/excursion-bookings/:id`           | propriétaire ou admin |
| PATCH   | `/api/excursion-bookings/:id/cancel`    | propriétaire ou admin |
| PATCH   | `/api/excursion-bookings/:id/confirm`   | admin                 |

Collection distincte des réservations d'hébergement : les deux n'ont ni les
mêmes champs ni les mêmes règles, et les fusionner aurait imposé des colonnes
vides des deux côtés.

**Concurrence.** Contrairement à l'hébergement, la contrainte tient dans un seul
document (`availableSeats`) : un `findOneAndUpdate` conditionné à `$gte` suffit,
MongoDB garantissant qu'un document n'est modifié que par une opération à la
fois. Aucun verrou n'est donc nécessaire ici. Mesuré : 15 demandes simultanées
sur 5 places disponibles → exactement 5 acceptées, 10 en `EXCURSION_FULL`.

La condition porte aussi sur le statut et la date, dans la même opération :
les vérifier séparément rouvrirait la fenêtre que l'atomicité vient de fermer.

Une excursion sans place restante passe automatiquement en `FULL`, et revient à
`SCHEDULED` dès qu'une annulation en libère. Les places sont restituées à
l'annulation, sans jamais dépasser `totalSeats`.

Plafond de 10 places par réservation : sans borne, une seule demande pourrait
vider une sortie et bloquer tous les autres clients.

### Interactions

| Méthode | Chemin                           | Accès                 |
| ------- | -------------------------------- | --------------------- |
| GET     | `/api/reviews`                   | public (approuvés)    |
| POST    | `/api/reviews`                   | user                  |
| DELETE  | `/api/reviews/:id`               | auteur ou admin       |
| PATCH   | `/api/reviews/:id/moderate`      | admin                 |
| POST    | `/api/reviews/:id/report`        | user                  |
| GET     | `/api/favorites`                 | user                  |
| POST    | `/api/favorites`                 | user                  |
| DELETE  | `/api/favorites?targetType=…&targetId=…` | propriétaire  |
| GET     | `/api/notifications`             | user                  |
| PATCH   | `/api/notifications/:id/read`    | propriétaire          |
| PATCH   | `/api/notifications/read-all`    | user                  |
| POST    | `/api/admin/notifications`       | admin                 |

#### Notifications

`GET /api/notifications` renvoie la page **et** `unreadCount` : l'application
affiche une pastille à chaque ouverture, et une requête séparée pour un simple
compteur serait du gaspillage.

Les notifications sont émises automatiquement par les événements métier :

| Événement | In-app | Email |
| --- | :-: | :-: |
| Création de compte | — | ✅ bienvenue |
| Mot de passe oublié | — | ✅ lien de réinitialisation |
| Nouvelle demande de réservation | ✅ administrateurs | — |
| Réservation confirmée | ✅ client | ✅ |
| Réservation annulée | ✅ client | ✅ avec motif |
| Avis modéré | ✅ auteur | — |

**L'émission ne lève jamais.** Une confirmation de réservation ne doit pas
échouer parce que le serveur d'emails est indisponible : l'opération métier a
réussi, seule l'information n'est pas partie. L'échec est journalisé.

Corollaire assumé : une notification peut être perdue. La livraison durable —
file d'attente, réessais, lettres mortes — arrive en Phase 13.

`POST /api/admin/notifications` sans `userIds` diffuse à **tous les comptes
actifs**. Le dashboard impose un choix explicite de portée : une diffusion
générale ne doit jamais résulter d'un champ oublié.

#### Avis — règle anti faux avis

| Type de lieu | Condition |
| --- | --- |
| `HOTEL`, `EXCURSION` | réservation **confirmée ou terminée** exigée |
| `RESTAURANT`, `ATTRACTION` | ouvert, mais un seul avis par compte |

Une demande en attente ne suffit pas : elle n'atteste de rien. L'identifiant de
la réservation est conservé sur l'avis comme justificatif, et l'application
affiche « Séjour vérifié ».

Un index unique `(userId, targetType, targetId)` garantit l'unicité : un contrôle
applicatif seul laisserait passer deux envois simultanés.

**Modération a priori** : un avis naît `PENDING` et n'est visible qu'une fois
approuvé. Plus exigeant en travail d'administration, mais aucun contenu
diffamatoire ne s'affiche entre sa publication et son signalement. `scope=me`
permet à l'auteur de voir ses propres avis en attente.

Approuver, rejeter ou supprimer **recalcule la note du lieu** par agrégation
complète plutôt que par ajustement incrémental : une incohérence héritée d'un
incident disparaît au recalcul suivant au lieu d'être perpétuée.

**Signalement** : le compteur trie la file de modération, sans jamais masquer
automatiquement. Un retrait déclenché par le nombre de signalements deviendrait
vite un outil de censure entre concurrents.

#### Favoris

`POST` est **idempotent** : rajouter un favori existant le renvoie plutôt que
d'échouer — l'utilisateur voulait que le lieu soit en favori, il l'est.

`GET /api/favorites` renvoie chaque favori **enrichi de sa cible** (nom, ville,
vignette, note, prix). Les cibles sont chargées par type, soit quatre requêtes au
maximum quel que soit le nombre d'entrées, ce qui évite le N+1. Une fiche
dépubliée est marquée `unavailable`, une fiche supprimée renvoie `target: null`.

## Règles d'autorisation

Trois niveaux, vérifiés **côté serveur uniquement** :

- **public** — aucune authentification
- **user** — jeton valide requis
- **admin** — jeton valide avec `role === 'ADMIN'`

Pour les ressources possédées (réservation, favori, notification), la vérification
porte sur la propriété, pas seulement sur le rôle : un utilisateur authentifié ne doit
jamais pouvoir lire la réservation d'un autre en changeant l'identifiant dans l'URL.
