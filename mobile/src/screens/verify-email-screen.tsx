import { useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { api, ApiRequestError } from '../api/client';
import { Button, Field, Input } from '../components/ui';
import { PressableScale } from '../components/motion';
import { colors, layout, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Saisie du code de vérification.
 *
 * ─── Pourquoi cet écran ne connecte pas ─────────────────────────────────────
 *
 * La vérification réussie renvoie vers la connexion, où l'utilisateur saisit
 * son mot de passe. Ouvrir la session ici ferait de cet écran une seconde porte
 * d'entrée, gardée par six chiffres au lieu d'un mot de passe — et ces six
 * chiffres viennent de transiter par une boîte de courriel.
 */
export function VerifyEmailScreen() {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RootStackParamList, 'VerifyEmail'>>();
  const navigation = useNavigation<Navigation>();

  const { email } = route.params;

  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [isSubmitting, setSubmitting] = useState(false);
  const [isResending, setResending] = useState(false);

  const handleVerify = async () => {
    setError(undefined);
    setNotice(undefined);

    if (!/^\d{6}$/.test(code.trim())) {
      setError(t('verify.sixDigits'));
      return;
    }

    setSubmitting(true);

    try {
      await api.post('/api/auth/verify-email', { email, code: code.trim() });

      /*
       * `replace` et non `navigate` : l'écran de vérification ne doit pas rester
       * dans l'historique. Y revenir par le bouton retour afficherait un
       * formulaire dont le code vient d'être consommé.
       */
      navigation.replace('Login', { message: t('verify.successThenLogin') });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('verify.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError(undefined);
    setResending(true);

    try {
      await api.post('/api/auth/resend-verification', { email });
      // Le message est le même quoi qu'il arrive : le serveur ne dit pas si
      // l'adresse existe, et l'écran ne doit pas le déduire non plus.
      setNotice(t('verify.resent'));
    } catch {
      setNotice(t('verify.resent'));
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('verify.title')}</Text>
        <Text style={styles.subtitle}>{t('verify.subtitle', { email })}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Field label={t('verify.codeLabel')}>
          <Input
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            style={styles.codeInput}
            onSubmitEditing={() => void handleVerify()}
            returnKeyType="go"
          />
        </Field>

        <Button
          label={t('verify.confirm')}
          onPress={() => void handleVerify()}
          loading={isSubmitting}
        />

        <PressableScale
          accessibilityLabel={t('verify.resend')}
          onPress={() => void handleResend()}
          disabled={isResending}
          scaleTo={0.98}
          contentStyle={styles.resend}
        >
          <Text style={styles.resendLabel}>{t('verify.resend')}</Text>
        </PressableScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.background },
  content: { padding: layout.screenPadding, paddingTop: spacing.xxl, gap: spacing.lg },

  title: { ...typography.h1, color: colors.text.primary },
  subtitle: { ...typography.body, color: colors.text.secondary, marginTop: -spacing.sm },

  error: {
    ...typography.caption,
    color: colors.status.danger,
    backgroundColor: '#fef2f2',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  notice: {
    ...typography.caption,
    color: colors.brand[700],
    backgroundColor: colors.brand[50],
    padding: spacing.md,
    borderRadius: radius.md,
  },

  /*
   * Chiffres espacés et centrés : un code se relit caractère par caractère pour
   * le comparer à celui du courriel, ce qu'un texte serré rend pénible.
   */
  codeInput: {
    textAlign: 'center',
    fontSize: 28,
    letterSpacing: 10,
    fontWeight: '700',
  },

  resend: { alignItems: 'center', paddingVertical: spacing.md },
  resendLabel: { ...typography.bodyStrong, color: colors.brand[700] },
});
