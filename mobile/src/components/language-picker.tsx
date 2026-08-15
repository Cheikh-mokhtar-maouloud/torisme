import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import i18n, { LANGUAGES, currentLanguage, setLanguage, type Language } from '../i18n';
import { colors, radius, spacing, typography } from '../theme';
import { Icon } from './icon';
import { PressableScale } from './motion';

/**
 * Choix de la langue.
 *
 * Les trois noms sont écrits **dans leur propre langue** — « العربية » et non
 * « Arabe ». C'est la convention de tous les sélecteurs de langue, et elle a une
 * raison : celui qui cherche l'arabe ne lit peut-être pas le français, donc un
 * libellé français lui serait inutile là où il en a le plus besoin.
 *
 * Les trois sont affichées ensemble plutôt que dans une liste déroulante :
 * trois choix tiennent sur une ligne, et un menu qui s'ouvre pour trois options
 * ajoute un geste sans rien apporter.
 */
export function LanguagePicker() {
  /*
   * Le hook est appelé pour son abonnement, non pour `t` : il fait redessiner
   * ce composant au changement de langue, ce qui déplace la coche sur la
   * nouvelle option. Sans lui, la sélection resterait visuellement sur
   * l'ancienne langue alors que le reste de l'écran a déjà changé.
   */
  useTranslation();

  const active = currentLanguage();

  const choose = (language: Language) => {
    if (language === active) return;

    const { needsRestart } = setLanguage(language);

    /*
     * L'avertissement n'est affiché que si le sens d'écriture change.
     *
     * Passer du français à l'anglais ne demande rien : le texte se met à jour
     * sur place. Passer à l'arabe retourne la mise en page, et React Native ne
     * lit ce sens qu'au démarrage — sans redémarrage, on obtiendrait un écran
     * en arabe disposé de gauche à droite, plus déroutant que la langue
     * d'origine.
     */
    if (needsRestart) {
      /*
       * Le message est demandé **dans la langue choisie**, explicitement.
       *
       * `t` reste lié à la langue du rendu en cours, et `changeLanguage` est
       * asynchrone : l'alerte s'affichait donc en français alors que
       * l'interface derrière elle était déjà passée à l'arabe. Or c'est
       * précisément le message qu'il faut comprendre pour savoir quoi faire.
       */
      const inTarget = (key: string) => i18n.t(key, { lng: language });

      Alert.alert(inTarget('language.restartTitle'), inTarget('language.restartMessage'), [
        { text: inTarget('language.understood') },
      ]);
    }
  };

  return (
    <View style={styles.row}>
      {(Object.keys(LANGUAGES) as Language[]).map((language) => {
        const isActive = language === active;

        return (
          <PressableScale
            key={language}
            accessibilityLabel={LANGUAGES[language].label}
            onPress={() => choose(language)}
            style={styles.slot}
            contentStyle={[styles.option, isActive && styles.optionActive]}
          >
            <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
              {LANGUAGES[language].label}
            </Text>
            {isActive ? <Icon name="check" size={15} color={colors.text.inverse} /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  slot: { flexGrow: 1, flexBasis: 'auto' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.neutral[100],
  },
  optionActive: { backgroundColor: colors.neutral[900] },
  label: { ...typography.caption, color: colors.text.secondary, fontWeight: '600' },
  labelActive: { color: colors.text.inverse },
});
