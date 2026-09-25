import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

import { useAuth } from '../auth/auth-context';
import { appConfig } from '../config/env';
import { colors, radius, spacing, typography } from '../theme';
import { PressableScale } from './motion';

/**
 * Referme l'onglet d'authentification au retour vers l'application.
 *
 * Appelé au chargement du module, comme la bibliothèque l'exige : sans lui,
 * l'onglet du navigateur reste ouvert derrière l'application après la
 * connexion, et l'utilisateur le retrouve en changeant de tâche.
 */
WebBrowser.maybeCompleteAuthSession();

/**
 * Bouton « Continuer avec Google ».
 *
 * ─── Ce qu'il fait sans identifiant configuré ───────────────────────────────
 *
 * En **production**, il ne s'affiche pas : un bouton voué à l'échec est pire
 * que son absence — l'utilisateur l'essaie, échoue, et conclut que
 * l'application est cassée.
 *
 * En **développement**, il s'affiche désactivé, avec la variable manquante
 * nommée sous lui. La version précédente disparaissait sans rien dire, ce qui
 * laissait croire que la fonctionnalité n'avait pas été écrite alors qu'elle
 * l'était entièrement. Un composant invisible ne se débogue pas.
 *
 * ─── Ce qui traverse le réseau ──────────────────────────────────────────────
 *
 * Le jeton d'identité, et lui seul. L'application ne le décode pas et n'en tire
 * aucune conclusion — c'est le serveur qui vérifie la signature de Google,
 * l'expiration et l'audience. Faire confiance au client sur l'identité qu'il
 * revendique laisserait n'importe qui ouvrir n'importe quelle session.
 */
export function GoogleSignInButton({ onError }: { onError?: (message: string) => void }) {
  const { t } = useTranslation();
  const { loginWithGoogle } = useAuth();
  const [isBusy, setBusy] = useState(false);

  const clientId = appConfig.googleClientId;

  /*
   * Le hook est appelé même sans identifiant : les règles de React interdisent
   * de le sauter selon une condition. C'est le rendu qui s'abstient, pas le
   * hook.
   */
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    clientId: clientId || 'non-configure',
  });

  /*
   * Le résultat est attendu directement, plutôt que reçu par un effet observant
   * `response`.
   *
   * Les deux voies existent dans la bibliothèque. Celle-ci se lit de haut en
   * bas — ouvrir, attendre, échanger, terminer — et garde l'indicateur
   * d'attente dans la même portée que le geste qui l'a déclenché. La variante
   * par effet oblige à modifier l'état depuis celui-ci, ce que React
   * déconseille et que le linter refuse.
   */
  const handlePress = async () => {
    /*
     * Sans identifiant, l'appui explique au lieu de ne rien faire.
     *
     * Un bouton grisé ne dit pas *pourquoi* il l'est, et laisse croire à une
     * fonctionnalité inachevée alors que tout est en place sauf une valeur de
     * configuration. Le message nomme la variable et la marche à suivre.
     */
    if (!isConfigured) {
      Alert.alert(t('auth.googleSetupTitle'), t('auth.googleSetupSteps'), [
        { text: t('language.understood') },
      ]);
      return;
    }

    setBusy(true);

    try {
      const result = await promptAsync();

      if (result.type !== 'success') {
        /*
         * Fermer l'onglet n'est pas un échec : l'utilisateur a changé d'avis.
         * Lui afficher une erreur lui ferait croire que quelque chose s'est mal
         * passé, et le découragerait de réessayer.
         */
        if (result.type === 'error') onError?.(t('auth.googleFailed'));
        return;
      }

      const idToken = result.params.id_token;

      if (!idToken) {
        onError?.(t('auth.googleFailed'));
        return;
      }

      await loginWithGoogle(idToken);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : t('auth.googleFailed'));
    } finally {
      setBusy(false);
    }
  };

  // En production, pas de bouton sans identifiant. Voir la note d'en-tête.
  if (!clientId && appConfig.isProduction) return null;

  const isConfigured = Boolean(clientId);

  return (
    <View style={styles.wrapper}>
      <View style={styles.separatorRow}>
        <View style={styles.separatorLine} />
        <Text style={styles.separatorLabel}>{t('auth.or')}</Text>
        <View style={styles.separatorLine} />
      </View>

      <PressableScale
        accessibilityLabel={t('auth.continueWithGoogle')}
        onPress={() => void handlePress()}
        disabled={isBusy || (isConfigured && !request)}
        scaleTo={0.98}
        contentStyle={styles.button}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color={colors.text.primary} />
        ) : (
          <>
            {/*
              Le « G » est dessiné en texte plutôt qu'en logo officiel : celui-ci
              est une marque déposée dont l'usage est encadré par une charte, et
              l'embarquer sans s'y conformer expose à une demande de retrait.
            */}
            <Text style={[styles.mark, !isConfigured && styles.disabled]}>G</Text>
            <Text style={[styles.label, !isConfigured && styles.disabled]}>
              {t('auth.continueWithGoogle')}
            </Text>
          </>
        )}
      </PressableScale>

      {isConfigured ? null : (
        /*
          Le nom exact de la variable, et non « non configuré ».
          Un message vague oblige à fouiller le code pour savoir quoi faire ;
          celui-ci se lit et s'applique.
        */
        <Text style={styles.hint}>{t('auth.googleNotConfigured')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.lg, marginTop: spacing.lg },

  separatorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  separatorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface.border,
  },
  separatorLabel: { ...typography.caption, color: colors.text.muted },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.surface.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  mark: { ...typography.h3, color: colors.brand[700], fontWeight: '700' },
  disabled: { color: colors.text.muted },
  hint: { ...typography.caption, color: colors.text.muted, textAlign: 'center' },
  label: { ...typography.bodyStrong, color: colors.text.primary },
});
