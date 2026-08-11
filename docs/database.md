# Base de données

**MongoDB** (Atlas en hébergé), accédé via **Mongoose**.

> Statut : ce document décrit le modèle **cible**. Les schémas Mongoose sont
> implémentés en Phase 2. Les types correspondants existent déjà dans
> `shared/src/types/entities.ts` et font foi pour le contrat d'API.

## Collections

| Collection          | Rôle                                       | Relations sortantes         |
| ------------------- | ------------------------------------------ | --------------------------- |
| `users`             | Comptes (rôles `USER` / `ADMIN`)           | —                           |
| `hotels`            | Établissements hôteliers                   | —                           |
| `rooms`             | Types de chambres                          | `hotelId`                   |
| `restaurants`       | Restaurants                                | `categoryIds`               |
| `attractions`       | Sites et attractions                       | `categoryIds`               |
| `excursions`        | Excursions programmées                     | —                           |
| `bookings`          | Réservations d'hébergement                 | `userId`, `hotelId`, `roomId` |
| `excursionBookings` | Réservations d'excursion                   | `userId`, `excursionId`     |
| `reviews`           | Avis et notes                              | `userId`, `targetId`, `bookingId` |
| `favorites`         | Favoris                                    | `userId`, `targetId`        |
| `notifications`     | Notifications in-app                       | `userId`                    |
| `categories`        | Catégories transverses                     | —                           |
| `payments`          | Transactions                               | `bookingId`, `userId`       |

Les images ne sont **pas** une collection : elles sont un sous-document `images[]`
embarqué dans l'entité propriétaire (voir plus bas).

## Règles de modélisation

### Embarquer ou référencer

**Embarquer** ce qui est toujours lu avec le parent et borné en taille :
images, équipements, horaires d'ouverture, programme d'excursion.

**Référencer** ce qui est interrogé indépendamment ou non borné :
chambres d'un hôtel, avis, réservations.

Une galerie de 30 images embarquée reste bien en deçà de la limite de 16 Mo par
document ; 5 000 avis embarqués la dépasseraient et rendraient toute lecture d'hôtel
coûteuse.

### Géolocalisation

Tout lieu affichable sur la carte stocke un champ `location` au format **GeoJSON Point** :

```js
{ type: 'Point', coordinates: [longitude, latitude] }
```

**L'ordre est `[longitude, latitude]`** — l'inverse de la convention `lat, lng` utilisée
par la plupart des API de cartographie. C'est la source d'erreur la plus fréquente sur
ce type de projet : une inversion place Nouakchott en Antarctique sans lever d'erreur.
La conversion se fait dans une seule fonction utilitaire, jamais à la main dans une requête.

Chaque collection géolocalisée porte un index `2dsphere` :

```js
schema.index({ location: '2dsphere' });
```

### Dénormalisation assumée

Certaines valeurs sont dupliquées pour éviter une agrégation à chaque lecture de liste :

| Champ dénormalisé          | Sur          | Recalculé quand                        |
| -------------------------- | ------------ | -------------------------------------- |
| `rating`, `reviewCount`    | lieux        | à chaque avis approuvé ou supprimé     |
| `minPricePerNight`         | `hotels`     | à chaque écriture sur une `room`       |
| `availableSeats`           | `excursions` | à chaque réservation ou annulation     |

Ces champs sont **dérivés** : ils ne doivent jamais être modifiables directement via
l'API d'administration, uniquement recalculés par le service qui possède la source.

### Intégrité des réservations

MongoDB n'a pas de contrainte d'unicité conditionnelle par plage de dates. La protection
contre les doubles réservations repose donc sur deux mécanismes combinés (Phase 8) :

1. **Décrément atomique** du stock via `findOneAndUpdate` avec condition
   (`{ availableSeats: { $gte: n } }`) — une opération, pas un lire-puis-écrire.
2. **Transaction multi-documents** pour les écritures liées (réservation + stock + paiement).
   Les transactions exigent un replica set : Atlas en fournit un même sur l'offre gratuite.

Un index unique sur `reference` garantit l'idempotence côté client.

## Index prévus

| Collection    | Index                                              | Motif                       |
| ------------- | -------------------------------------------------- | --------------------------- |
| `users`       | `{ email: 1 }` unique                              | Connexion                   |
| `hotels`      | `{ location: '2dsphere' }`                         | Recherche par proximité     |
| `hotels`      | `{ 'address.city': 1, status: 1 }`                 | Liste filtrée par ville     |
| `hotels`      | index texte sur `name`, `description`              | Recherche plein texte       |
| `rooms`       | `{ hotelId: 1, status: 1 }`                        | Chambres d'un hôtel         |
| `restaurants` | `{ location: '2dsphere' }`, `{ categoryIds: 1 }`   | Carte, filtres              |
| `attractions` | `{ location: '2dsphere' }`, `{ categoryIds: 1 }`   | Carte, filtres              |
| `excursions`  | `{ startsAt: 1, status: 1 }`                       | Excursions à venir          |
| `bookings`    | `{ userId: 1, createdAt: -1 }`                     | Historique utilisateur      |
| `bookings`    | `{ roomId: 1, checkIn: 1, checkOut: 1 }`           | Calcul de disponibilité     |
| `bookings`    | `{ reference: 1 }` unique                          | Idempotence                 |
| `reviews`     | `{ targetType: 1, targetId: 1, status: 1 }`        | Avis d'un lieu              |
| `favorites`   | `{ userId: 1, targetType: 1, targetId: 1 }` unique | Empêche les doublons        |
| `notifications` | `{ userId: 1, createdAt: -1 }`                   | Boîte de réception          |

**Règle** : aucune requête ne part en production sans que son plan d'exécution ait été
vérifié (`.explain('executionStats')`). Un `COLLSCAN` sur une collection qui grandit est
un incident différé, pas une optimisation à faire plus tard.

## Ce qui ne va pas en base

- Les fichiers image (seulement leur URL et leurs métadonnées) — voir `docs/security.md`
- Les mots de passe en clair — uniquement un hash bcrypt
- Les secrets d'application
