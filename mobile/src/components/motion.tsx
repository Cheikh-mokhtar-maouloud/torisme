import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { duration } from '../theme';

/**
 * Animations de l'interface.
 *
 * Deux gestes, pas davantage : l'appui qui répond, et l'arrivée du contenu. Une
 * application qui anime tout devient fatigante avant d'être élégante — chaque
 * mouvement doit dire quelque chose.
 *
 * Toutes passent par `useNativeDriver`, ce qui les fait jouer sur le fil
 * d'affichage plutôt que sur celui de JavaScript. C'est la différence entre une
 * animation fluide et une animation qui saccade dès qu'une requête se termine —
 * et sur les appareils modestes, ce cas est la règle, pas l'exception.
 *
 * Conséquence à connaître : ce pilote n'accepte que `opacity` et les
 * transformations. Animer une couleur ou une hauteur impose de le désactiver,
 * donc de repasser par JavaScript. Mieux vaut alors s'en priver.
 */

/**
 * Bouton qui s'enfonce légèrement sous le doigt.
 *
 * Sur mobile il n'y a pas de survol : sans retour au toucher, rien ne distingue
 * un appui pris d'un appui perdu, et l'utilisateur appuie deux fois. Une simple
 * baisse d'opacité le dit, mais faiblement ; l'échelle se perçoit même du coin
 * de l'œil.
 *
 * `spring` et non `timing` : le retour à la taille normale garde un reste
 * d'élan, ce qui donne la sensation d'une matière plutôt que d'un dessin qui
 * change de valeur.
 */
export function PressableScale({
  onPress,
  children,
  style,
  contentStyle,
  scaleTo = 0.96,
  accessibilityLabel,
  accessibilityRole = 'button',
  disabled = false,
}: {
  onPress: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Style de la vue animée, qui s'intercale entre le bouton et son contenu.
   *
   * Cette distinction n'est pas un raffinement : la vue animée rompt la chaîne
   * de mise en page. Un `alignItems: 'center'` posé sur le bouton centre la vue
   * animée, non ce qu'elle contient — les pastilles de catégorie se sont ainsi
   * retrouvées décalées de leurs libellés. Ce qui concerne la disposition
   * interne doit passer ici.
   */
  contentStyle?: StyleProp<ViewStyle>;
  /** 0.96 par défaut. En dessous de 0,9 l'effet devient un rebond, pas un appui. */
  scaleTo?: number;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'search' | 'link';
  disabled?: boolean;
}) {
  /*
   * `useState` à initialisation paresseuse, et non `useRef(...).current`.
   *
   * Les deux créent la valeur une seule fois, mais la seconde forme lit une ref
   * pendant le rendu — ce que React déconseille et que le linter refuse. La
   * fonction passée à `useState` n'est appelée qu'au premier rendu ; sans elle,
   * un `new Animated.Value(1)` serait construit à chaque rendu puis jeté.
   *
   * L'état n'est jamais remplacé : c'est l'objet animé qui change, pas la
   * référence. D'où le tableau à un seul élément.
   */
  const [scale] = useState(() => new Animated.Value(1));

  const animateTo = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      // Amorti élevé : un bouton qui oscille paraît instable. On veut la
      // souplesse du ressort sans son rebond.
      damping: 18,
      stiffness: 260,
      mass: 0.6,
    }).start();

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => animateTo(scaleTo)}
      onPressOut={() => animateTo(1)}
      /*
       * L'annulation compte autant que l'appui : un doigt qui glisse hors du
       * bouton déclenche `onPressOut`, mais un composant parent qui prend le
       * geste — le défilement d'un carrousel — n'émet que celui-ci. Sans lui,
       * le bouton resterait enfoncé après un simple glissement.
       */
      onTouchCancel={() => animateTo(1)}
      style={style}
    >
      <Animated.View style={[contentStyle, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * Apparition en fondu, avec une légère montée.
 *
 * Le décalage (`delay`) sert à faire arriver les sections l'une après l'autre
 * plutôt que d'un bloc. Ce n'est pas un ornement : l'œil suit l'ordre
 * d'apparition, ce qui donne à lire la hiérarchie de l'écran au moment même où
 * elle se met en place.
 *
 * La montée reste faible — douze points. Une entrée qui vient de loin attire
 * l'attention sur le mouvement au lieu du contenu, et se remarque à chaque
 * visite alors qu'on ne la voit qu'une fois avec plaisir.
 */
export function FadeInUp({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // Même raison que dans PressableScale, plus haut.
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: duration.entrance,
      delay,
      // Sortie décélérée : rapide au départ, posée à l'arrivée. C'est la courbe
      // des objets qui s'immobilisent ; la linéaire paraît mécanique.
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, delay]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
