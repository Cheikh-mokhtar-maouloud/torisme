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
est assumée. Dans les deux cas le jeton d'accès est de courte durée (15 min) et
renouvelé par un jeton de rafraîchissement révocable.

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

## Limitation de débit (Phase 14)

| Route                        | Limite indicative        |
| ---------------------------- | ------------------------ |
| `POST /api/auth/login`       | 5 / 15 min / IP + email  |
| `POST /api/auth/register`    | 3 / heure / IP           |
| `POST /api/auth/forgot-password` | 3 / heure / email    |
| API en lecture               | 100 / min / IP           |
| Écritures authentifiées      | 30 / min / utilisateur   |

Le compteur devra vivre dans Redis, pas en mémoire de processus : avec plusieurs
instances derrière un load balancer, un compteur local multiplie la limite réelle par
le nombre d'instances.

## Paiement (Phase 23)

Règle non négociable : **un paiement n'est confirmé que par le serveur**. La réponse
du SDK côté client est une indication d'interface, jamais une preuve. La confirmation
vient d'un webhook signé du fournisseur, dont la signature est vérifiée, et dont le
traitement est idempotent (le même événement peut être livré plusieurs fois).

Aucune donnée de carte ne transite ni n'est stockée par la plateforme.

## Téléversement de fichiers (Phase 7)

- Types autorisés : `image/jpeg`, `image/png`, `image/webp` — vérifiés côté serveur
  d'après le contenu, pas d'après l'extension ni le `Content-Type` déclaré.
- Taille maximale : 5 Mo.
- Téléversement direct vers le fournisseur via signature à durée limitée, afin que les
  fichiers ne transitent pas par l'API.
- Le nom de fichier fourni par le client n'est jamais réutilisé tel quel.

## Journalisation

Ne jamais journaliser : mots de passe, jetons, en-têtes `Authorization`, cookies,
`MONGODB_URI`, données de paiement.

Les stack traces ne sont incluses qu'en dehors de la production
(`backend/src/lib/logger.ts`).

## À faire avant la mise en production (Phase 14)

- [ ] HTTPS forcé, HSTS activé
- [ ] Limitation de débit adossée à Redis
- [ ] Verrouillage temporaire de compte après échecs répétés
- [ ] Pare-feu : n'exposer que 80/443
- [ ] Accès MongoDB Atlas restreint par liste d'IP
- [ ] Sauvegardes automatiques et **restauration testée**
- [ ] `npm audit` intégré à la CI
- [ ] Supervision des erreurs et alertes
- [ ] Revue de sécurité complète des routes d'autorisation
