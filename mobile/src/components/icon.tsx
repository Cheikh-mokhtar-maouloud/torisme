import { Feather, Ionicons } from '@expo/vector-icons';

import { colors } from '../theme';

/**
 * Icônes de l'application.
 *
 * Un seul jeu, **Feather** : trait de 2 points, grille de 24, angles arrondis.
 * Mélanger deux familles se voit immédiatement — les épaisseurs de trait et les
 * rayons diffèrent, et l'ensemble paraît assemblé par accident.
 *
 * Ce fichier remplace les emojis employés jusqu'ici comme icônes. Un emoji est
 * une police de caractères propre au système : il change de dessin d'un
 * téléphone à l'autre, ignore la couleur qu'on lui demande, et son gabarit ne
 * s'aligne pas sur celui du texte voisin. Trois raisons pour lesquelles aucune
 * application soignée n'en utilise dans sa navigation.
 */

/**
 * Noms d'icônes utilisés par l'application.
 *
 * Le type restreint volontairement le vocabulaire : passer par cette table
 * oblige à choisir parmi les icônes déjà en place, plutôt qu'à en introduire
 * une de plus à chaque écran.
 */
export const ICONS = {
  home: 'home',
  search: 'search',
  map: 'map',
  ticket: 'bookmark',
  user: 'user',
  attraction: 'camera',
  excursion: 'compass',
  restaurant: 'coffee',
  star: 'star',
  heart: 'heart',
  back: 'chevron-left',
  forward: 'chevron-right',
  close: 'x',
  settings: 'settings',
  bell: 'bell',
  calendar: 'calendar',
  location: 'map-pin',
  filter: 'sliders',
  check: 'check',
  alert: 'alert-circle',
  info: 'info',
  logout: 'log-out',
  edit: 'edit-2',
  trash: 'trash-2',
  plus: 'plus',
  wifi: 'wifi',
  parking: 'square',
  users: 'users',
  clock: 'clock',
  phone: 'phone',
  mail: 'mail',
  globe: 'globe',
} as const;

/**
 * Icônes empruntées à Ionicons, faute d'équivalent chez Feather.
 *
 * Deux cas, chacun pour un manque précis :
 *
 * - **le lit.** Feather n'en a pas, d'où la clé employée jusqu'ici — qui ne se
 *   comprend qu'une fois qu'on sait qu'elle désigne une chambre. Un symbole qui
 *   demande à être expliqué a déjà échoué.
 * - **le cœur plein.** Feather ne dessine que des contours, or un favori a deux
 *   états et c'est le remplissage qui les distingue d'un coup d'œil. Un cœur
 *   vide et un cœur vide légèrement plus foncé ne se distinguent pas.
 *
 * Le mélange de familles reste à éviter, pour la raison dite plus haut : les
 * épaisseurs de trait diffèrent et l'ensemble paraît assemblé par accident. La
 * variante « outline » d'Ionicons est celle qui s'en approche le plus. Ces
 * emprunts doivent rester des exceptions justifiées, non le début d'un second
 * jeu.
 */
const IONICONS = {
  hotel: 'bed-outline',
  heartOutline: 'heart-outline',
  heartFilled: 'heart',
} as const;

export type IconName = keyof typeof ICONS | keyof typeof IONICONS;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

/**
 * `size` par défaut à 20 : c'est la taille qui s'aligne optiquement sur du
 * texte de 15 points. Une icône de 24 à côté d'un corps de texte paraît
 * toujours trop lourde.
 */
export function Icon({ name, size = 20, color = colors.text.primary }: IconProps) {
  if (name in IONICONS) {
    const ionName = IONICONS[name as keyof typeof IONICONS];
    /*
     * Légèrement agrandie : à taille nominale égale, un glyphe d'Ionicons
     * occupe moins de sa case qu'un Feather et paraît plus petit à côté de lui.
     * Le facteur rétablit l'équilibre optique dans la rangée des catégories.
     */
    return <Ionicons name={ionName} size={Math.round(size * 1.15)} color={color} />;
  }

  return <Feather name={ICONS[name as keyof typeof ICONS]} size={size} color={color} />;
}
