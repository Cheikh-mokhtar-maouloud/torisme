import { Feather } from '@expo/vector-icons';

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
  // « key » et non « home » : l'onglet Accueil utilise déjà la maison, et deux
  // icônes identiques pour deux sens différents sur le même écran se lisent
  // comme une erreur.
  hotel: 'key',
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

export type IconName = keyof typeof ICONS;

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
  return <Feather name={ICONS[name]} size={size} color={color} />;
}
