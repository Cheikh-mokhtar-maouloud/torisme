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
      setFormError(
        error instanceof ApiRequestError ? error.message : 'Connexion impossible. Réessayez.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Connexion"
      subtitle={route.params?.message ?? 'Retrouvez vos réservations et vos favoris.'}
      formError={formError}
      footer={
        <Pressable accessibilityRole="button" onPress={() => navigation.replace('Register')}>
          <Text style={styles.footerLink}>
            Pas encore de compte ? <Text style={styles.footerLinkStrong}>Créer un compte</Text>
          </Text>
        </Pressable>
      }
    >
      <Field label="Email" error={errors.email}>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="vous@exemple.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          invalid={Boolean(errors.email)}
        />
      </Field>

      <Field label="Mot de passe" error={errors.password}>
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

      <Button label="Se connecter" onPress={() => void handleSubmit()} loading={isSubmitting} />

      <GoogleSignInButton onError={setFormError} />
    </AuthLayout>
  );
}

export function RegisterScreen() {
  const navigation = useNavigation<Navigation>();
  const { register } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

    setErrors({});
    setIsSubmitting(true);

    try {
      await register(parsed.data);
      navigation.goBack();
    } catch (error) {
      setFormError(
        error instanceof ApiRequestError ? error.message : 'Inscription impossible. Réessayez.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Créer un compte"
      subtitle="Quelques secondes suffisent pour réserver."
      formError={formError}
      footer={
        <Pressable accessibilityRole="button" onPress={() => navigation.replace('Login')}>
          <Text style={styles.footerLink}>
            Déjà inscrit ? <Text style={styles.footerLinkStrong}>Se connecter</Text>
          </Text>
        </Pressable>
      }
    >
      <Field label="Nom complet" error={errors.fullName}>
        <Input
          value={fullName}
          onChangeText={setFullName}
          placeholder="Fatimetou Sidi"
          autoComplete="name"
          textContentType="name"
          invalid={Boolean(errors.fullName)}
        />
      </Field>

      <Field label="Email" error={errors.email}>
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="vous@exemple.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          invalid={Boolean(errors.email)}
        />
      </Field>

      <Field label="Mot de passe" error={errors.password}>
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder="8 caractères minimum"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          invalid={Boolean(errors.password)}
        />
      </Field>

      <Button label="Créer mon compte" onPress={() => void handleSubmit()} loading={isSubmitting} />
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
