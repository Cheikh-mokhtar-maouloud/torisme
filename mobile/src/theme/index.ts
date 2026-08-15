/**
 * Jetons de design de l'application mobile.
 *
 * Source unique de vérité : aucun composant ne doit contenir de valeur
 * hexadécimale ni de marge magique.
 *
 * Parti pris **éditorial** : le contenu domine, l'interface s'efface. Les
 * photos portent la page, la hiérarchie vient de la typographie et du vide, non
 * de bordures et d'ombres. Concrètement, une fiche n'est pas une carte blanche
 * posée sur un fond gris : c'est une image suivie de son texte, sur le même
 * fond que le reste.
 */

export const colors = {
  /**
   * Teal atlantique, employé **avec parcimonie**.
   *
   * Dans une interface éditoriale, la couleur de marque signale l'action et
   * rien d'autre. L'étaler sur des en-têtes et des pastilles la banalise : elle
   * ne veut plus dire « ceci est cliquable », donc elle ne dirige plus le
   * regard.
   */
  brand: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    300: '#5eead4',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    900: '#134e4a',
  },
  sand: {
    50: '#fdfaf3',
    200: '#f1e5cd',
    500: '#cfa961',
  },
  /**
   * Gris neutres, du plus clair au plus foncé.
   *
   * Une échelle continue permet de choisir un contraste plutôt que d'inventer
   * une couleur : chaque valeur intermédiaire existe déjà.
   */
  neutral: {
    0: '#ffffff',
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
  },
  text: {
    primary: '#18181b',
    secondary: '#52525b',
    muted: '#a1a1aa',
    inverse: '#ffffff',
  },
  surface: {
    background: '#ffffff',
    subtle: '#fafafa',
    border: '#e4e4e7',
  },
  status: {
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
  },
} as const;

/**
 * Couleurs de catégorie.
 *
 * Une teinte par type de lieu, la même sur la carte, sur l'accueil et sur les
 * fiches. C'est ce qui fait la différence entre de la couleur et de la
 * décoration : le point orange d'un marqueur et le disque orange d'une
 * catégorie disent la même chose, donc la légende de la carte s'apprend sans
 * être lue.
 *
 * `base` porte le trait et le texte, `tint` le fond. Les deux sont donnés
 * plutôt que calculés : une teinte obtenue par transparence prend la couleur de
 * ce qui est dessous, et ne tient donc pas sur une photographie.
 *
 * Ces valeurs étaient jusqu'ici enfermées dans le composant de la carte. Les
 * remonter ici évite qu'un écran invente sa propre nuance d'orange — la dérive
 * commence toujours par une seule exception.
 */
export const accent = {
  hotel: { base: '#0d9488', tint: '#ccfbf1' },
  restaurant: { base: '#d97706', tint: '#fef3c7' },
  attraction: { base: '#7c3aed', tint: '#ede9fe' },
  /*
   * Quatre teintes franchement distinctes, et non quatre variations
   * agréables ensemble.
   *
   * L'excursion a d'abord repris le sable de la marque, puis un ambre plus
   * soutenu : sur la carte, ses points devenaient indiscernables de ceux des
   * restaurants. À dix-huit pixels, deux nuances voisines d'une même famille
   * sont la même couleur — et la légende cesse de fonctionner, ce qui était
   * précisément sa raison d'être.
   *
   * Le rose côtoie le rouge d'alerte du thème. Ils ne se rencontrent jamais :
   * l'alerte n'habille que des pastilles de texte, jamais un repère de
   * catégorie.
   */
  excursion: { base: '#be123c', tint: '#ffe4e6' },
} as const;

export type AccentName = keyof typeof accent;

/**
 * Durées d'animation, en millisecondes.
 *
 * Courtes, et c'est délibéré : au-delà de 250 ms une transition d'interface
 * cesse d'être perçue comme une réaction et devient une attente. Le retour au
 * toucher est le plus bref de tous — il doit paraître simultané à l'appui.
 */
export const duration = {
  instant: 120,
  quick: 180,
  entrance: 320,
} as const;

/** Échelle d'espacement de base 4. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Marge latérale des écrans.
 *
 * Nommée à part parce qu'elle doit rester identique partout : c'est elle qui
 * fait tenir la colonne de texte d'un écran à l'autre. Un écran qui prendrait
 * 16 au lieu de 20 se voit immédiatement à la navigation.
 */
export const layout = {
  screenPadding: 20,
  /** Largeur d'une carte dans un carrousel horizontal. */
  cardWidth: 280,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 999,
} as const;

/**
 * Échelle typographique.
 *
 * Les grands titres sont **resserrés** (`letterSpacing` négatif) : au-delà de
 * 24 points, l'espacement par défaut fait paraître le mot délavé. Les petits
 * labels sont au contraire élargis, sans quoi les capitales se collent.
 *
 * Chaque style porte sa hauteur de ligne. La laisser au moteur produit des
 * interlignes serrés sur les titres et lâches sur le corps de texte — l'inverse
 * de ce qu'on veut.
 */
export const typography = {
  /** Titre d'accueil, un seul par écran. */
  display: { fontSize: 32, fontWeight: '700', lineHeight: 38, letterSpacing: -0.8 },
  h1: { fontSize: 26, fontWeight: '700', lineHeight: 32, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '700', lineHeight: 26, letterSpacing: -0.3 },
  h3: { fontSize: 17, fontWeight: '600', lineHeight: 22, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodyStrong: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  /** Sur-titre en capitales : catégorie, pays, section. */
  overline: { fontSize: 11, fontWeight: '700', lineHeight: 14, letterSpacing: 1.2 },
} as const;

/**
 * Ombres, volontairement rares et discrètes.
 *
 * Une ombre sert à dire « cet élément flotte au-dessus » — un bouton d'action,
 * une feuille modale. L'appliquer à toutes les cartes fait perdre ce sens et
 * salit l'écran d'un gris diffus. La séparation, ici, vient du vide.
 *
 * `elevation` est propre à Android, `shadow*` à iOS : les deux sont nécessaires
 * pour un rendu identique.
 */
export const shadow = {
  none: {},
  soft: {
    shadowColor: '#18181b',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lifted: {
    shadowColor: '#18181b',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;
