import { useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { api, ApiRequestError } from '../api/client';
import { Button, Field, Input } from '../components/ui';
import { colors, layout, radius, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Demande d'un code de réinitialisation.
 *
 * L'écran affiche toujours le même message après envoi, que l'adresse soit
 * inscrite ou non — comme le serveur. Confirmer l'existence d'un compte ici
 * offrirait un moyen de tester des adresses en masse, et l'écran ne doit pas
 * révéler ce que le serveur prend soin de taire.
 */
export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Navigation>();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(undefined);

    if (!email.includes('@')) {
      setError(t('reset.invalidEmail'));
      return;
    }

    setSubmitting(true);

    try {
      await api.post('/api/auth/forgot-password', { email: email.trim().toLowerCase() });
      navigation.replace('ResetPassword', { email: email.trim().toLowerCase() });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('reset.requestFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('reset.forgotTitle')}</Text>
        <Text style={styles.subtitle}>{t('reset.forgotSubtitle')}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Field label={t('auth.email')}>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.emailExample')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            onSubmitEditing={() => void handleSubmit()}
            returnKeyType="go"
          />
        </Field>

        <Button
          label={t('reset.sendCode')}
          onPress={() => void handleSubmit()}
          loading={isSubmitting}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Saisie du code et du nouveau mot de passe.
 *
 * Les deux se font sur le même écran : séparer le code du nouveau mot de passe
 * ajouterait une étape sans rien garantir de plus, et allongerait le temps
 * pendant lequel un code valide circule.
 */
export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RootStackParamList, 'ResetPassword'>>();
  const navigation = useNavigation<Navigation>();

  const { email } = route.params;

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string>();
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(undefined);

    if (!/^\d{6}$/.test(code.trim())) {
      setError(t('verify.sixDigits'));
      return;
    }

    if (password.length < 8) {
      setError(t('reset.passwordTooShort'));
      return;
    }

    // Même raison qu'à l'inscription : un mot de passe masqué se saisit à
    // l'aveugle, et une faute de frappe enfermerait dehors quelqu'un qui vient
    // justement de récupérer son accès.
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setSubmitting(true);

    try {
      await api.post('/api/auth/reset-password', { email, code: code.trim(), password });
      navigation.replace('Login', { message: t('reset.successThenLogin') });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : t('reset.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('reset.resetTitle')}</Text>
        <Text style={styles.subtitle}>{t('reset.resetSubtitle', { email })}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

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
          />
        </Field>

        <Field label={t('reset.newPassword')}>
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.passwordHint')}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
        </Field>

        <Field label={t('auth.confirmPassword')}>
          <Input
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder={t('auth.confirmPasswordPlaceholder')}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            onSubmitEditing={() => void handleSubmit()}
            returnKeyType="go"
          />
        </Field>

        <Button
          label={t('reset.confirm')}
          onPress={() => void handleSubmit()}
          loading={isSubmitting}
        />
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

  codeInput: { textAlign: 'center', fontSize: 28, letterSpacing: 10, fontWeight: '700' },
});
