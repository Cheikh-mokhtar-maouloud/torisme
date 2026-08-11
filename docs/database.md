# Base de données

**MongoDB** (Atlas en hébergé), accédé via **Mongoose**.

> Statut (Phase 2) : `users`, `categories`, `hotels`, `rooms`, `restaurants`,
> `attractions` et `excursions` sont **implémentés et indexés**
> (`backend/src/models/`). Les collections de réservation, d'avis, de favoris,
> de notifications et de paiement décrivent encore le modèle cible.

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

Les deux types de réservation posent des problèmes de concurrence **différents**,
et reçoivent donc des réponses différentes.

**Excursions — la contrainte tient dans un document.** `availableSeats` est un
compteur unique : `findOneAndUpdate` conditionné à `$gte` est atomique par
construction, MongoDB ne modifiant un document que par une opération à la fois.
Aucun verrou. La condition inclut aussi le statut et la date, dans la même
opération.

**Hébergement — la contrainte porte sur une plage de dates.** Il faut compter les
réservations qui chevauchent la période, puis insérer : deux opérations, donc une
fenêtre. MongoDB n'offre pas d'unicité conditionnelle par intervalle.

La réponse est un **verrou par chambre** (`collection bookingLocks`), reposant sur
l'atomicité d'une insertion en index unique — disponible y compris sur une
instance autonome. Un index TTL le libère si le processus meurt.

> Mesuré avant correction : 12 réservations simultanées sur une chambre à une
> seule unité aboutissaient **toutes les 12**.

Le verrou a été préféré à une transaction précisément parce qu'il ne requiert pas
de replica set : le comportement reste identique en développement et en
production, là où une divergence serait la plus coûteuse.

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

## Recherche par proximité : `$geoWithin`, pas `$nearSphere`

Les listes géolocalisées filtrent avec :

```js
{ location: { $geoWithin: { $centerSphere: [[longitude, latitude], rayonMètres / 6378137] } } }
```

`$nearSphere` serait plus naturel — il trie par distance croissante — mais MongoDB
l'interdit dans un pipeline d'agrégation. Or `countDocuments()` en est un : toute
liste paginée avec filtre géographique échouerait en erreur serveur. Le cas a été
rencontré et corrigé en Phase 2.

`$centerSphere` attend un rayon en **radians**, d'où la division par le rayon
terrestre (`GEO.EARTH_RADIUS_METERS`).

### Le cas de la carte (Phase 6)

`/api/map` utilise les deux opérateurs, selon le besoin :

| Besoin | Opérateur | Pourquoi |
| --- | --- | --- |
| Cadre visible | `$geoWithin` + `$box` | correspond exactement au rectangle affiché ; compatible avec `countDocuments` |
| Autour d'un point, trié | `$geoNear` | seul opérateur exposant la distance calculée |

`$geoNear` impose deux contraintes : il doit être la **première** étape du
pipeline, et ses filtres passent par sa clause `query` — filtrer par un `$match`
ultérieur ferait porter la limite de distance sur des documents ensuite écartés,
donnant moins de résultats que demandé.

Les quatre collections étant interrogées en parallèle, chacune revient triée par
distance mais leur fusion ne l'est plus : le tri final est refait sur l'ensemble.

## Transactions

Le calcul de disponibilité et le décrément de stock (Phase 8) exigent des
transactions multi-documents, elles-mêmes conditionnées à un **replica set**.
MongoDB Atlas en fournit un, y compris sur l'offre gratuite ; une instance locale
installée par défaut est en mode *standalone* et ne les supporte pas. À prévoir
avant la Phase 8 : Atlas, ou une configuration locale en replica set à un nœud.

## Ce qui ne va pas en base

- Les fichiers image (seulement leur URL et leurs métadonnées) — voir `docs/security.md`
- Les mots de passe en clair — uniquement un hash bcrypt
- Les secrets d'application
