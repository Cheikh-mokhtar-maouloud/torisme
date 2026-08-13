/**
 * En-têtes de sécurité du dashboard.
 *
 * Le backend est verrouillé depuis la Phase 2, mais il ne sert que du JSON à
 * des clients programmatiques. **C'est ici qu'est la vraie surface** : le
 * dashboard sert du HTML à un navigateur, exécute du JavaScript et détient un
 * cookie de session administrateur. Une injection réussie ici donne le contrôle
 * de toute la plateforme.
 */

/**
 * Politique de sécurité du contenu, construite autour d'un **nonce**.
 *
 * Next injecte des scripts en ligne pour l'hydratation. Les autoriser par
 * `'unsafe-inline'` reviendrait à désactiver la protection principale de la
 * CSP : un script injecté dans la page s'exécuterait exactement comme ceux de
 * Next. Le nonce, régénéré à chaque réponse, n'autorise que les scripts que le
 * serveur a lui-même émis — un attaquant ne peut pas le deviner.
 *
 * `'strict-dynamic'` étend cette confiance aux scripts chargés *par* un script
 * autorisé, ce dont Next a besoin pour charger ses fragments. Il neutralise
 * aussi les listes blanches de domaines, ce qui est voulu : une liste de
 * domaines est contournable dès qu'un seul d'entre eux héberge un fichier
 * complaisant.
 */
export function contentSecurityPolicy(nonce: string, isProduction: boolean): string {
  const directives = [
    // Tout est refusé par défaut ; chaque autorisation est ensuite explicite.
    "default-src 'none'",
    `script-src 'nonce-${nonce}' 'strict-dynamic' ${isProduction ? '' : "'unsafe-eval'"}`.trim(),
    /*
     * Les styles gardent `'unsafe-inline'`, et c'est un compromis assumé.
     * Next insère du CSS critique en ligne sans nonce, et Tailwind produit des
     * styles calculés au rendu. Le risque résiduel — exfiltration par sélecteur
     * d'attribut — est sans commune mesure avec l'exécution de script que la
     * directive précédente interdit.
     */
    "style-src 'self' 'unsafe-inline'",
    // `data:` couvre les aperçus locaux avant téléversement ; `blob:` les
    // images générées côté client. `https:` reste nécessaire tant que les
    // photos peuvent venir de Cloudinary ou d'une URL saisie à la main.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Le navigateur ne parle qu'au dashboard lui-même : les appels à l'API
    // partent du serveur Next, jamais du client (voir lib/config.ts).
    `connect-src 'self'${isProduction ? '' : ' ws: http://localhost:*'}`,
    "form-action 'self'",
    // Double protection contre le détournement de clic, avec X-Frame-Options :
    // `frame-ancestors` est la directive moderne, l'en-tête couvre les
    // navigateurs plus anciens.
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ];

  return directives.join('; ');
}

/**
 * En-têtes constants.
 *
 * `Permissions-Policy` refuse des capacités que le dashboard n'utilise pas.
 * L'intérêt n'est pas de se protéger de son propre code mais de limiter ce
 * qu'un script injecté pourrait atteindre : sans cette ligne, une injection
 * réussie peut demander la caméra ou la position.
 */
export function staticSecurityHeaders(isProduction: boolean): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    /*
     * `strict-origin-when-cross-origin` : un lien sortant ne transmet que
     * l'origine, jamais le chemin complet. Un chemin comme
     * `/bookings/6a7c…/edit` révélerait sinon des identifiants internes au site
     * de destination, par le simple `Referer`.
     */
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    /*
     * HSTS en production uniquement. Émis depuis `localhost` en HTTP, il
     * n'aurait aucun effet ; émis depuis un `localhost` en HTTPS, il forcerait
     * le navigateur du développeur à refuser HTTP sur ce domaine pendant six
     * mois — un blocage difficile à diagnostiquer.
     */
    ...(isProduction
      ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload' }
      : {}),
  };
}
