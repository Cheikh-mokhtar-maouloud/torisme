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

Le jeton d'accès est renvoyé **à la fois** dans le corps de la réponse (consommé
par le mobile via `Authorization: Bearer`) et posé en cookie HTTP-only `tourism_session`
(consommé par le dashboard). Durée de vie : 15 minutes.

`forgot-password` et `reset-password` sont livrés en Phase 8.

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
| GET     | `/api/rooms/:id/availability` | public                    |

`GET /api/rooms/:id/availability?checkIn=…&checkOut=…` renvoie les unités
restantes **et le prix total**. Le montant est calculé par le serveur et n'est
jamais recomposé par un client : un prix envoyé depuis l'application serait
modifiable.

Une réservation inexistante ou appartenant à un tiers renvoie **404**, pas 403 :
répondre « interdit » confirmerait son existence et permettrait de les énumérer.

> Limite connue, levée en Phase 8 : entre la vérification de disponibilité et
> l'insertion, deux requêtes simultanées peuvent réserver la même dernière unité.
> La correction demande une transaction multi-documents, donc un replica set.

### Interactions

| Méthode | Chemin                           | Accès                 |
| ------- | -------------------------------- | --------------------- |
| GET     | `/api/reviews`                   | public (approuvés)    |
| POST    | `/api/reviews`                   | user                  |
| GET     | `/api/favorites`                 | user                  |
| POST    | `/api/favorites`                 | user                  |
| DELETE  | `/api/favorites/:id`             | propriétaire          |
| GET     | `/api/notifications`             | user                  |
| PATCH   | `/api/notifications/:id/read`    | propriétaire          |

## Règles d'autorisation

Trois niveaux, vérifiés **côté serveur uniquement** :

- **public** — aucune authentification
- **user** — jeton valide requis
- **admin** — jeton valide avec `role === 'ADMIN'`

Pour les ressources possédées (réservation, favori, notification), la vérification
porte sur la propriété, pas seulement sur le rôle : un utilisateur authentifié ne doit
jamais pouvoir lire la réservation d'un autre en changeant l'identifiant dans l'URL.
