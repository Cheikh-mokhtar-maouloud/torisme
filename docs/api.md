# API REST

Base : `http://localhost:4000` en développement.
La liste des chemins fait foi dans `shared/src/constants/api.ts` — le mobile et le
dashboard ne doivent jamais écrire une URL d'API en dur.

> Statut : seul `GET /api/health` est implémenté (Phase 1). Le reste décrit le contrat
> cible, construit à partir de la Phase 2.

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

| Méthode | Chemin        | Accès  | Description                    |
| ------- | ------------- | ------ | ------------------------------ |
| GET     | `/api/health` | public | Sonde de disponibilité         |

### Authentification

| Méthode | Chemin                        | Accès  |
| ------- | ----------------------------- | ------ |
| POST    | `/api/auth/register`          | public |
| POST    | `/api/auth/login`             | public |
| POST    | `/api/auth/logout`            | user   |
| GET     | `/api/auth/me`                | user   |
| POST    | `/api/auth/forgot-password`   | public |
| POST    | `/api/auth/reset-password`    | public |

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

### Réservations

| Méthode | Chemin                        | Accès                     |
| ------- | ----------------------------- | ------------------------- |
| GET     | `/api/bookings`               | user (les siennes) / admin (toutes) |
| POST    | `/api/bookings`               | user                      |
| GET     | `/api/bookings/:id`           | propriétaire ou admin     |
| PATCH   | `/api/bookings/:id/cancel`    | propriétaire ou admin     |

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
