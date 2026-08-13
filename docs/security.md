# Sécurité

Document vivant : les mesures sont introduites au fil des phases. La colonne
« Phase » indique quand chaque point devient exigible.

## Principes

1. **Ne jamais faire confiance au client.** Toute donnée entrante est validée côté
   serveur. Une validation côté mobile ou dashboard est une aide à la saisie.
2. **Autoriser sur le serveur.** Masquer un bouton dans l'interface n'est pas une
   mesure de sécurité — chaque route vérifie le rôle *et* la propriété de la ressource.
3. **Échouer bruyamment au démarrage, discrètement en réponse.** Un secret manquant
   fait échouer le boot ; une erreur interne renvoie un message générique, jamais une
   stack trace.

## Secrets

| Règle                                                          | Statut   |
| -------------------------------------------------------------- | -------- |
| `.env*` exclus de Git (`!.env.example` seul autorisé)          | Phase 1 ✅ |
| Variables validées au démarrage (`backend/src/config/env.ts`)  | Phase 1 ✅ |
| `JWT_SECRET` ≥ 32 caractères, aléatoire                         | Phase 1 ✅ |
| Hachage bcrypt (coût 12), `passwordHash` en `select: false`    | Phase 2 ✅ |
| Gardes `requireAuth` / `requireAdmin` sur toutes les écritures  | Phase 2 ✅ |
| Rôle relu en base à chaque requête (pas seulement dans le jeton)| Phase 2 ✅ |
| Réponse identique quel que soit l'existence du compte (login)  | Phase 2 ✅ |
| Secrets distincts par environnement (dev / staging / prod)     | Phase 4  |
| Rotation documentée des clés                                    | Phase 14 |

Ne **jamais** commiter : `MONGODB_URI`, `JWT_SECRET`, clés Cloudinary, clés Stripe,
clés d'API de cartographie non restreintes.

Attention au préfixe `NEXT_PUBLIC_` / `EXPO_PUBLIC_` : ces valeurs sont **intégrées au
bundle client** et lisibles par n'importe qui. Une clé de carte n'y a sa place que si
elle est restreinte par domaine (web) ou par bundle id / package name (mobile).

## Mots de passe

- Hachés avec **bcrypt** (coût 12), jamais stockés ni journalisés en clair.
- Longueur minimale de 8 caractères, maximum 128. Pas d'exigence de composition :
  la longueur est le facteur déterminant (NIST SP 800-63B).
- `POST /api/auth/forgot-password` renvoie **la même réponse** qu'un email existe ou non,
  pour ne pas permettre d'énumérer les comptes.
- Jetons de réinitialisation : aléatoires, à usage unique, expirant sous 1 heure,
  stockés hachés.

## Authentification

| Client    | Transport du jeton                                        |
| --------- | --------------------------------------------------------- |
| Dashboard | Cookie **HTTP-only**, `Secure`, `SameSite=Lax`             |
| Mobile    | Jeton en stockage sécurisé (`expo-secure-store`)           |

Le mobile ne peut pas utiliser de cookie HTTP-only de manière fiable ; la distinction
est assumée. Dans les deux cas le jeton d'accès dure 15 minutes et se renouvelle
via un jeton de rafraîchissement de 30 jours, stocké **haché** et révocable.

La rotation est systématique et un jeton rejoué déclenche la révocation de toutes
les sessions du compte : c'est la seule réaction sûre, puisqu'on ne peut pas
distinguer la victime de l'attaquant.

| Événement | Effet |
| --- | --- |
| Déconnexion | Révoque le jeton présenté |
| Changement de mot de passe | Révoque **toutes** les sessions |
| Réinitialisation | Révoque **toutes** les sessions |
| Jeton de rafraîchissement rejoué | Révoque **toutes** les sessions |

## Validation des entrées

Chaque route handler valide corps, paramètres de requête et paramètres de chemin avec
un schéma Zod issu de `@tourism/shared/validation` ou défini dans le backend.

Points d'attention spécifiques à MongoDB :

- **Injection d'opérateur** — un corps JSON `{"email": {"$ne": null}}` devient un
  opérateur si passé directement à une requête. La validation Zod l'empêche : un champ
  déclaré `z.string()` rejette un objet. Ne jamais passer `req.body` brut à une requête.
- **Pollution de masse** — ne jamais construire un `$set` depuis un corps non filtré.
  Les champs modifiables sont énumérés explicitement.
- **Champs dérivés** — `rating`, `reviewCount`, `availableSeats`, `role`, `status` de
  paiement ne sont jamais acceptés depuis le client.

## En-têtes HTTP

Appliqués par `backend/next.config.ts` (Phase 1) :

`X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` ·
`Referrer-Policy: no-referrer` · `X-Robots-Tag: noindex, nofollow` ·
`Permissions-Policy: camera=(), microphone=(), geolocation=()`

À ajouter en Phase 14 : `Strict-Transport-Security`, et une CSP sur le dashboard.

## CORS

Liste blanche explicite via `CORS_ORIGINS`. Jamais `*` sur une route authentifiée —
un joker combiné aux credentials annule la protection d'origine.

## Limitation de débit (Phase 13 ✅)

| Famille                                                    | Limite   | Clé de comptage |
| ---------------------------------------------------------- | -------- | --------------- |
| Authentification (connexion, inscription, mot de passe oublié) | 20 / min | compte ou IP |
| Écritures authentifiées                                    | 120 / min | compte ou IP   |
| Lecture publique                                           | 300 / min | compte ou IP   |
| `GET /api/health`                                          | aucune    | —              |

**Appliquée par défaut**, dans `withRoute`, jamais souscrite route par route :
une protection optionnelle ne protège que ce dont on s'est souvenu, et la route
ajoutée dans six mois serait exposée sans que rien ne le signale.

Le point de santé en est volontairement exempt : c'est un load balancer qui
l'interroge, plusieurs fois par minute et par instance. Le limiter ferait
retirer du pool des instances saines — la sonde provoquerait la panne qu'elle
surveille.

### Le compte prime sur l'adresse IP

Une requête authentifiée est comptée sous `user:<id>`, jamais sous son adresse.
Compter uniquement par IP pénalise le partage d'adresse, qui est la norme et non
l'exception : NAT d'un opérateur mobile mauritanien, Wi-Fi d'un hôtel, réseau
d'une agence de voyage. Tous ces utilisateurs se partageraient un seul quota, et
le plus actif couperait l'accès aux autres.

Le jeton est vérifié **cryptographiquement** avant d'en tirer l'identifiant. Se
contenter de lire son contenu laisserait n'importe qui forger un identifiant
différent à chaque requête, donc obtenir un quota neuf à volonté.

### Ce que la limitation ne remplace pas

Le **verrouillage de compte** (`failedLoginAttempts` / `lockedUntil`, Phase 8)
reste en base et n'a pas été déplacé. Un contrôle de sécurité stocké dans
MongoDB survit à un redémarrage de Redis ; un compteur en cache s'efface, et un
attaquant n'aurait qu'à attendre une purge pour repartir de zéro.

La limitation protège l'infrastructure contre le volume, le verrouillage protège
un compte précis. Les deux sont complémentaires, et les fusionner affaiblirait
le second.

### Dégradation

Si Redis est injoignable, **la requête est autorisée**. La limitation protège
contre l'abus, elle n'est pas un contrôle d'accès : refuser tout le trafic parce
que le compteur est absent transformerait une panne de cache en interruption de
service — exactement ce qu'un attaquant chercherait à provoquer.

Sans `REDIS_URL`, le repli est un compteur en mémoire, valable pour la seule
instance courante. C'est un filet, pas une protection : `verify:deployment`
échoue si la production n'a pas de Redis.

## Secrets partagés entre services

Trois secrets distincts, jamais interchangeables :

| Secret                    | Relation de confiance          |
| ------------------------- | ------------------------------ |
| `JWT_SECRET`              | backend ↔ clients              |
| `REALTIME_PUBLISH_SECRET` | backend ↔ service temps réel   |
| `INTERNAL_API_SECRET`     | worker ↔ routes internes       |

Les confondre transformerait la compromission de l'un en compromission des
autres : un jeton client volé deviendrait un droit de diffusion, ou un droit de
déclencher des envois d'emails.

Les trois sont comparés en **temps constant**. Une égalité de chaînes s'arrête au
premier caractère différent et révèle, par sa durée, combien de caractères sont
déjà corrects.

### Ce que le worker ne détient pas

Le worker n'a **ni `MONGODB_URI` ni la clé du fournisseur d'emails**. Il appelle
`/api/internal/*`, et c'est le backend qui détient les secrets. Compromettre le
worker ne donne donc accès ni aux données ni au compte d'envoi — seulement au
droit de déclencher des traitements que le backend valide de toute façon.

Sans `INTERNAL_API_SECRET`, les routes internes refusent **tout** appel : le
défaut d'une variable absente doit toujours être le refus.

## En-têtes du navigateur (Phase 14 ✅)

L'API est verrouillée depuis la Phase 2, mais elle ne sert que du JSON à des
clients programmatiques. **La vraie surface est le dashboard** : il sert du HTML
à un navigateur, y exécute du JavaScript, et détient un cookie de session
administrateur. Une injection réussie là donne le contrôle de la plateforme.

Les en-têtes sont posés dans le middleware, pas dans `next.config.ts`, parce que
la CSP repose sur un nonce qui doit être régénéré à chaque réponse. Un nonce
figé dans la configuration serait identique pour tous les visiteurs, donc
devinable — c'est-à-dire sans valeur.

| Directive | Choix | Pourquoi |
| --------- | ----- | -------- |
| `default-src` | `'none'` | Tout est refusé, chaque autorisation est ensuite explicite |
| `script-src` | `'nonce-…' 'strict-dynamic'` | `'unsafe-inline'` ferait exécuter un script injecté exactement comme ceux de Next |
| `style-src` | `'self' 'unsafe-inline'` | Compromis assumé : Next insère du CSS critique sans nonce. Le risque résiduel est l'exfiltration par sélecteur, sans commune mesure avec l'exécution de script |
| `frame-ancestors` | `'none'` | Détournement de clic ; doublé par `X-Frame-Options` pour les navigateurs anciens |
| `base-uri` | `'none'` | Un `<base>` injecté détournerait toutes les URL relatives |
| `connect-src` | `'self'` | Le navigateur ne parle qu'au dashboard : les appels à l'API partent du serveur Next |

`Referrer-Policy: strict-origin-when-cross-origin` empêche qu'un chemin comme
`/bookings/6a7c…/edit` parte vers un site tiers par le simple `Referer`.

`Permissions-Policy` refuse caméra, micro, position et paiement. L'intérêt n'est
pas de se protéger de son propre code, mais de limiter ce qu'un script injecté
pourrait demander.

## Rotation d'un secret

### `JWT_SECRET`

Sans précaution, le changer invalide instantanément toutes les sessions. La
conséquence pratique n'est pas la gêne des utilisateurs : c'est qu'**on hésite à
le faire**, et qu'un secret qu'on n'ose pas remplacer reste en place après la
fuite qui aurait dû le faire changer.

`JWT_SECRET_PREVIOUS` est donc accepté **en vérification seulement**. La
signature n'utilise jamais que la clé courante.

1. `JWT_SECRET_PREVIOUS` = ancienne valeur, `JWT_SECRET` = nouvelle. Sur le
   backend **et** sur le service temps réel — sans quoi les sockets tomberaient
   alors que l'API resterait accessible, une panne partielle bien plus
   difficile à diagnostiquer qu'une panne franche.
2. Déployer.
3. Attendre `JWT_ACCESS_TTL` (15 min par défaut). Les jetons de rafraîchissement
   ne sont pas concernés : ce sont des chaînes aléatoires opaques stockées en
   base, sans lien avec cette clé.
4. Retirer `JWT_SECRET_PREVIOUS` et redéployer. **Cette étape n'est pas
   facultative** : la laisser en place maintiendrait valide le secret que la
   rotation était censée retirer du service.

### Les autres secrets

| Secret | Effet du changement | Précaution |
| ------ | ------------------- | ---------- |
| `REALTIME_PUBLISH_SECRET` | Publications refusées jusqu'à ce que les deux côtés concordent | Déployer le service temps réel avant le backend : une publication perdue ne coûte qu'une mise à jour différée |
| `INTERNAL_API_SECRET` | Les tâches du worker échouent | Sans gravité : BullMQ réessaie, les tâches repartent une fois les deux côtés alignés |
| `MONGODB_URI`, `MAIL_API_KEY` | Rotation côté fournisseur, puis redéploiement | — |

Aucun secret n'est en Git. `.gitignore` exclut tous les `.env*` sauf les
`.env.example`, et `verify:deployment` échoue si un secret attendu manque.

## Journalisation

Les valeurs sensibles sont **rédigées au point de sortie unique** du logger, et
non à la charge de chaque appelant. Rien ne fuite aujourd'hui, mais une
protection qui repose sur la vigilance de celui qui écrit `logger.error(...)`
finit toujours par céder : il suffit d'un contexte d'erreur enrichi un peu trop
généreusement.

La comparaison se fait sur le nom du champ en minuscules et sans séparateurs,
pour que `passwordHash`, `password_hash` et `PASSWORD` tombent sous la même
règle. Le nom du champ est conservé et seule la valeur est remplacée : voir
`password: [rédigé]` aide à comprendre l'incident, alors qu'un champ effacé
laisse croire qu'il n'a jamais été transmis.

### Événements de sécurité

Un champ `securityEvent` distinct rend les règles d'alerte triviales à écrire.
Noyés parmi les `logger.warn` ordinaires — un champ mal rempli, une page
introuvable — ces événements exigeraient de reconnaître à l'œil ce qui relève
d'une attaque.

| Événement | Niveau | Lecture |
| --------- | ------ | ------- |
| `login_failed` | warn | Banal isolément ; c'est la répétition qui compte |
| `account_locked` | warn | Force brute contenue |
| `rate_limited` | warn | Abus ou client mal configuré |
| `forbidden` | warn | Tentative d'accès hors périmètre |
| `internal_call_rejected` | **error** | Quelqu'un appelle `/api/internal/*` sans le secret |
| `privilege_changed` | **error** | Tracé même légitime : après un incident, la question est « qui a donné ce rôle, et quand » |
| `refresh_replay` | **error** | **Aucune explication innocente** : un jeton déjà consommé ne peut réapparaître que copié |

Les deux derniers méritent une alerte immédiate. Les mettre au même niveau que
les échecs de connexion les ferait passer inaperçus au milieu du bruit.

## Dépendances

```bash
npm run audit:deps
```

`npm audit` seul ne suffit pas : il signale la même chose depuis des mois, on
s'habitue à sa sortie, et une vraie faille s'y perdrait. Le script en fait une
**décision**, par deux traitements :

1. **Remontée à la cause racine.** Une faille dans `image-size` fait apparaître
   `metro`, `react-native` et une dizaine d'autres. Douze signalements, une
   seule cause.
2. **Contrôle du confinement.** Chaque exception déclare le workspace autorisé à
   tirer le paquet, et le script relit l'arbre de dépendances à chaque
   exécution. Une exception par simple nom continuerait de couvrir le paquet le
   jour où il atterrirait dans le backend, là où il serait exploitable.

Les exceptions sont datées et signalées au bout de 90 jours. Une exception sans
date devient permanente par simple oubli.

État au 13/08/2026 : 12 hautes et 7 modérées, toutes issues de `image-size`
(Metro) et `uuid` (édition du projet Xcode). Outillage de build, jamais embarqué
dans l'application ni présent sur le serveur. Résolues par la prochaine montée
de version d'Expo.

## Ce qui relève des phases suivantes

| Sujet | Phase | Pourquoi pas maintenant |
| ----- | ----- | ----------------------- |
| HTTPS, certificats, pare-feu | 15 | Vercel les fournit ; il n'y a pas encore de serveur à configurer |
| WAF, protection DDoS, CDN | 16 | Se placent devant l'infrastructure, qui n'existe pas encore |
| Chiffrement au repos | 15 | Relève de la configuration MongoDB Atlas et du disque du VPS |

## Paiement (Phase 23)

Règle non négociable : **un paiement n'est confirmé que par le serveur**. La réponse
du SDK côté client est une indication d'interface, jamais une preuve. La confirmation
vient d'un webhook signé du fournisseur, dont la signature est vérifiée, et dont le
traitement est idempotent (le même événement peut être livré plusieurs fois).

Aucune donnée de carte ne transite ni n'est stockée par la plateforme.

## Téléversement de fichiers (Phase 7 ✅)

- **Réservé aux administrateurs** — `POST /api/uploads` exige le rôle `ADMIN`.
- Types autorisés : `image/jpeg`, `image/png`, `image/webp`, déterminés d'après la
  **signature binaire du fichier**, jamais d'après l'extension ni le `Content-Type`
  déclaré, l'un comme l'autre étant choisis librement par l'appelant.
- Taille maximale : **4 Mo**.
- Le nom fourni par le client n'est jamais réutilisé : le fichier est renommé avec
  un identifiant aléatoire, ce qui écarte la traversée de répertoire et les
  collisions.
- Le dossier de destination provient d'une **liste blanche**, jamais d'une valeur
  libre.
- La route de service local rejette tout chemin sortant de la racine de stockage,
  et ne sert que les types connus.

### Pourquoi le fichier transite par l'API

Le plan initial (Phase 1) prévoyait un téléversement **direct** vers le fournisseur
via signature. Cette décision a été révisée en Phase 7, pour une raison de fond :

> **Le serveur ne peut pas valider ce qu'il ne voit pas.** En téléversement direct,
> le client envoie ce qu'il veut au fournisseur puis déclare une URL et un type. Un
> fichier arbitraire renommé `.jpg` passerait sans contrôle.

Contrepartie assumée : le corps de requête est plafonné par l'hébergeur — 4,5 Mo sur
Vercel — d'où la limite applicative de 4 Mo. Si des images plus lourdes deviennent
nécessaires, le téléversement signé redevient la voie à suivre, et il faudra alors
vérifier l'asset auprès du fournisseur après coup pour retrouver la garantie perdue.

## Contenus déposés par les utilisateurs (Phase 10 ✅)

- **Avis modérés a priori** : rien ne s'affiche avant validation.
- **Preuve de réservation** exigée sur les lieux réservables — la seule barrière
  réellement efficace contre les faux avis, qu'ils viennent d'un concurrent ou de
  l'établissement lui-même.
- **Un avis par compte et par lieu**, garanti par un index unique et non par un
  simple contrôle applicatif.
- Le **signalement** ne masque jamais automatiquement : il ne fait que remonter
  l'avis dans la file de modération. Un seuil automatique se retournerait en
  outil de censure entre concurrents.
- Un utilisateur ne peut supprimer que **ses propres** avis ; les favoris d'un
  compte ne sont ni lisibles ni modifiables par un autre.

## Journalisation

Ne jamais journaliser : mots de passe, jetons, en-têtes `Authorization`, cookies,
`MONGODB_URI`, données de paiement.

Les stack traces ne sont incluses qu'en dehors de la production
(`backend/src/lib/logger.ts`).

## À faire avant la mise en production (Phase 14)

- [ ] HTTPS forcé, HSTS activé
- [ ] Limitation de débit adossée à Redis
- [x] Verrouillage temporaire de compte après échecs répétés — Phase 8 ✅
- [ ] Pare-feu : n'exposer que 80/443
- [ ] Accès MongoDB Atlas restreint par liste d'IP
- [ ] Sauvegardes automatiques et **restauration testée**
- [ ] `npm audit` intégré à la CI
- [ ] Supervision des erreurs et alertes
- [ ] Revue de sécurité complète des routes d'autorisation
