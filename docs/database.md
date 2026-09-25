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

## Champs servant de garde-fou de concurrence

Certains champs n'existent pas pour être affichés, mais pour arbitrer entre deux
écritures simultanées. Les modifier ou les indexer sans le savoir casserait une
garantie.

| Champ | Collection | Ce qu'il empêche |
| ----- | ---------- | ---------------- |
| `roomId` unique | `bookingLocks` | Deux réservations concurrentes sur les mêmes dates (Phase 8) |
| `availableSeats` + `$inc` conditionnel | `excursions` | La survente de places (Phase 9) |
| `failedLoginAttempts` / `lockedUntil` | `users` | La force brute sur un compte (Phase 8) |
| `reminderSentAt` | `excursionBookings` | Le double envoi d'un rappel (Phase 13) |

`reminderSentAt` mérite un mot. Il est posé par une mise à jour **conditionnée à
son absence**, et c'est le résultat de cette écriture qui décide de l'envoi. Se
fier au « une tâche, une exécution » de la file serait une erreur : une file
garantit *au moins* une livraison, jamais exactement une. Le départage doit donc
avoir lieu en base, seul endroit où deux workers concurrents se rencontrent.

## Import de lieux depuis OpenStreetMap

```bash
npm run import:osm --workspace backend -- --dry-run   # compte sans écrire
npm run import:osm --workspace backend                # import réel
```

### Pourquoi cette source, et pas Booking ou TripAdvisor

Les fiches de ces plateformes, et surtout leurs photographies, appartiennent aux
établissements ou aux photographes. Les recopier dans une plateforme
concurrente est une contrefaçon, pas une zone grise — et leurs conditions
d'utilisation interdisent explicitement l'extraction automatisée.

OpenStreetMap est sous licence **ODbL** : la réutilisation commerciale est
autorisée à condition de citer la source. C'est déjà le fond de carte de
l'application.

### Ce que la source donne, et ce qu'elle ne donne pas

| Donnée | Disponible |
| ------ | ---------- |
| Nom, coordonnées | oui, pour tous |
| Ville, rue | souvent ; sinon géocodage inverse par Nominatim |
| Téléphone, site web | environ un lieu sur dix |
| Étoiles | rarement, et repris seulement si annoncé |
| **Description** | **non** |
| **Photographies** | **non**, sauf sites liés à Wikidata |

Les descriptions écrites par l'import sont donc **strictement factuelles**,
construites à partir des étiquettes : « Hôtel situé à Nouadhibou, rue de la
plage Raha. » Inventer un texte d'ambiance reviendrait à publier sous le nom de
la plateforme des affirmations que personne n'a vérifiées, sur des
établissements qui existent réellement.

Les photographies ne viennent que de **Wikimedia Commons**, pour les lieux
reliés par une étiquette `wikidata`. Cela ne concerne que quelques sites
classés : les hôtels et restaurants n'en ont pas, et l'application affiche
« Photo à venir ».

### Tout est importé en brouillon

Une donnée collaborative n'est pas vérifiée : un restaurant peut avoir fermé, un
nom être mal orthographié, des coordonnées être approximatives. Publier
directement afficherait aux voyageurs des informations dont personne n'a
répondu. Le tri se fait depuis le dashboard.

### Obligations à respecter

- **Attribution** : « Données © contributeurs OpenStreetMap » doit figurer là où
  ces fiches sont affichées. La carte l'affiche déjà pour les tuiles ; les
  fiches importées relèvent de la même exigence.
- **Identification** : Overpass refuse un agent utilisateur anonyme (réponse
  406, dont le libellé évoque à tort une surcharge) et Nominatim bannit les
  adresses trop insistantes. L'import se nomme et respecte une requête par
  seconde.
