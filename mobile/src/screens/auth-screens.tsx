import { useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { loginSchema, registerSchema } from '@tourism/shared/validation';

import { ApiRequestError } from '../api/client';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../auth/auth-context';
import { GoogleSignInButton } from '../components/google-sign-in';
import { Button, Field, Input } from '../components/ui';
import { colors, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Connexion et inscription.
 *
 * La validation locale utilise les mêmes schémas Zod que l'API : elle évite un
 * aller-retour pour une faute évidente, mais ne remplace jamais la validation
 * serveur, seule à faire autorité.
 */
export function LoginScreen() {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RootStackParamList, 'Login'>>();
  const navigation = useNavigation<Navigation>();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setFormError(undefined);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(collectErrors(parsed.error.issues));
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      await login(parsed.data);
      // `goBack` plutôt qu'une navigation vers l'accueil : l'utilisateur
      // revient là où il en était, typiquement au récapitulatif de réservation.
      navigation.goBack();
    } catch (error) {
      setFormError(error instanceof ApiRequestError ? error.message : t('auth.loginFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={t('screens.login')}
      subtitle={route.params?.message ?? t('auth.loginSubtitle')}
      formError={formError}
      footer={
        <Pressable accessibilityRole="button" onPress={() => navigation.replace('Register')}>
          <Text style={styles.footerLink}>
            {t('auth.noAccount')}{' '}
            <Text style={styles.footerLinkStrong}>{t('screens.register')}</Text>
          </Text>
        </Pressable>
      }
    >
      <Field label={t('auth.email')} error={errors.email}>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailExample')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          invalid={Boolean(errors.email)}
        />
      </Field>

      <Field label={t('auth.password')} error={errors.password}>
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          invalid={Boolean(errors.password)}
          onSubmitEditing={() => void handleSubmit()}
          returnKeyType="go"
        />
      </Field>

      <Button
        label={t('profile.signIn')}
        onPress={() => void handleSubmit()}
        loading={isSubmitting}
      />

      <GoogleSignInButton onError={setFormError} />
    </AuthLayout>
  );
}

export function RegisterScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Navigation>();
  const { register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setFormError(undefined);

    const parsed = registerSchema.safeParse({ fullName, email, password });
    if (!parsed.success) {
      setErrors(collectErrors(parsed.error.issues));
      return;
    }

    /*
     * La confirmation est vérifiée ici, et **pas** envoyée au serveur.
     *
     * Elle ne protège de rien côté serveur : un client peut envoyer deux fois
     * la même valeur quoi qu'il arrive. Elle protège de la faute de frappe —
     * un mot de passe masqué se saisit à l'aveugle, et une lettre de travers
     * enferme dehors quelqu'un qui vient tout juste de s'inscrire.
     *
     * Le contrôle vient après celui du schéma : signaler « les mots de passe
     * diffèrent » sur un mot de passe trop court ferait corriger la mauvaise
     * chose.
     */
    if (password !== confirmPassword) {
      setErrors({ confirmPassword: t('auth.passwordMismatch') });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      await register(parsed.data);

      /*
       * `replace` : l'inscription ne doit pas rester dans l'historique. Le
       * compte existe désormais, et y revenir ne produirait qu'un refus pour
       * doublon.
       */
      navigation.replace('VerifyEmail', { email: parsed.data.email });
    } catch (error) {
      setFormError(error instanceof ApiRequestError ? error.message : t('auth.registerFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={t('screens.register')}
      subtitle={t('auth.registerSubtitle')}
      formError={formError}
      footer={
        <Pressable accessibilityRole="button" onPress={() => navigation.replace('Login')}>
          <Text style={styles.footerLink}>
            {t('auth.alreadyRegistered')}{' '}
            <Text style={styles.footerLinkStrong}>{t('profile.signIn')}</Text>
          </Text>
        </Pressable>
      }
    >
      <Field label={t('auth.fullName')} error={errors.fullName}>
        <Input
          value={fullName}
          onChangeText={setFullName}
          placeholder={t('auth.fullNameExample')}
          autoComplete="name"
          textContentType="name"
          invalid={Boolean(errors.fullName)}
        />
      </Field>

      <Field label={t('auth.email')} error={errors.email}>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailExample')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          invalid={Boolean(errors.email)}
        />
      </Field>

      <Field label={t('auth.password')} error={errors.password}>
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.passwordHint')}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          invalid={Boolean(errors.password)}
        />
      </Field>

      <Field label={t('auth.confirmPassword')} error={errors.confirmPassword}>
        <Input
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder={t('auth.confirmPasswordPlaceholder')}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          invalid={Boolean(errors.confirmPassword)}
          onSubmitEditing={() => void handleSubmit()}
          returnKeyType="go"
        />
      </Field>

      <Button
        label={t('auth.createAccount')}
        onPress={() => void handleSubmit()}
        loading={isSubmitting}
      />
    </AuthLayout>
  );
}

function AuthLayout({
  title,
  subtitle,
  formError,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  formError?: string | undefined;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      // Sans cela, le clavier iOS recouvre le champ mot de passe et le bouton.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {formError ? <Text style={styles.formError}>{formError}</Text> : null}

        <View style={styles.form}>{children}</View>

        <View style={styles.footer}>{footer}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Aplatit les erreurs Zod en une entrée par champ — la première suffit à l'affichage. */
function collectErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_');
    result[key] ??= issue.message;
  }
  return result;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.background },
  scroll: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.xs },

  title: { ...typography.h1, color: colors.text.primary },
  subtitle: { ...typography.body, color: colors.text.secondary },
  formError: {
    ...typography.caption,
    color: colors.status.danger,
    marginTop: spacing.md,
  },
  form: { gap: spacing.lg, marginTop: spacing.xl },
  footer: { marginTop: spacing.xl, alignItems: 'center' },
  footerLink: { ...typography.body, color: colors.text.secondary },
  footerLinkStrong: { color: colors.brand[700], fontWeight: '600' },
});
