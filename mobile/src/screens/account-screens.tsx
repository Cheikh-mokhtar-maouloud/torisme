import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import type { User } from '@tourism/shared/types';
import { changePasswordSchema, updateProfileSchema } from '@tourism/shared/validation';

import { api, ApiRequestError } from '../api/client';
import { useAuth } from '../auth/auth-context';
import { Button, Field, Input } from '../components/ui';
import { colors, spacing, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

/**
 * Modification du profil.
 *
 * L'email n'est pas modifiable : le changer suppose de vérifier la nouvelle
 * adresse, sans quoi une faute de frappe rendrait le compte irrécupérable. Ce
 * parcours arrive avec les emails (Phase 11).
 */
export function EditProfileScreen() {
  const navigation = useNavigation<Navigation>();
  const { user, refreshUser } = useAuth();

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setFormError(undefined);

    const parsed = updateProfileSchema.safeParse({
      fullName,
      // Un champ vidé doit être omis, pas envoyé vide : le schéma refuserait
      // une chaîne vide comme numéro de téléphone.
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    });

    if (!parsed.success) {
      setErrors(collectErrors(parsed.error.issues));
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      await api.patch<User>('/api/auth/profile', parsed.data);
      await refreshUser();
      navigation.goBack();
    } catch (error) {
      setFormError(
        error instanceof ApiRequestError ? error.message : 'Modification impossible. Réessayez.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AccountLayout title="Modifier le profil" formError={formError}>
      <Field label="Nom complet" error={errors.fullName}>
        <Input
          value={fullName}
          onChangeText={setFullName}
          autoComplete="name"
          invalid={Boolean(errors.fullName)}
        />
      </Field>

      <Field label="Téléphone" error={errors.phone}>
        <Input
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+222…"
          autoComplete="tel"
          invalid={Boolean(errors.phone)}
        />
      </Field>

      <Field label="Email">
        <Input value={user?.email ?? ''} editable={false} style={styles.readOnly} />
      </Field>
      <Text style={styles.hint}>
        L’adresse email ne peut pas être modifiée depuis l’application pour le moment.
      </Text>

      <Button label="Enregistrer" onPress={() => void handleSubmit()} loading={isSubmitting} />
    </AccountLayout>
  );
}

/**
 * Changement de mot de passe.
 *
 * Réussir déconnecte : le serveur révoque toutes les sessions, y compris celle
 * en cours. C'est voulu — un changement de mot de passe doit fermer les sessions
 * ouvertes sur d'autres appareils — et l'écran le dit avant, puis ramène à
 * l'accueil déconnecté.
 */
export function ChangePasswordScreen() {
  const navigation = useNavigation<Navigation>();
  const { logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setFormError(undefined);

    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      setErrors(collectErrors(parsed.error.issues));
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      await api.post('/api/auth/change-password', parsed.data);

      // La session courante vient d'être révoquée côté serveur : on nettoie
      // localement pour que l'application n'utilise pas un jeton mort.
      await logout();

      Alert.alert(
        'Mot de passe modifié',
        'Vos autres appareils ont été déconnectés. Reconnectez-vous avec votre nouveau mot de passe.',
        [{ text: 'Se connecter', onPress: () => navigation.replace('Login') }],
      );
    } catch (error) {
      if (error instanceof ApiRequestError && error.fields) {
        setErrors(
          Object.fromEntries(
            Object.entries(error.fields).map(([key, messages]) => [key, messages[0] ?? '']),
          ),
        );
      } else {
        setFormError(
          error instanceof ApiRequestError ? error.message : 'Modification impossible. Réessayez.',
        );
      }
      setIsSubmitting(false);
    }
  };

  return (
    <AccountLayout title="Changer le mot de passe" formError={formError}>
      <Field label="Mot de passe actuel" error={errors.currentPassword}>
        <Input
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoComplete="current-password"
          invalid={Boolean(errors.currentPassword)}
        />
      </Field>

      <Field label="Nouveau mot de passe" error={errors.newPassword}>
        <Input
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoComplete="new-password"
          placeholder="8 caractères minimum"
          invalid={Boolean(errors.newPassword)}
        />
      </Field>

      <Text style={styles.hint}>
        Vous serez déconnecté de tous vos appareils, celui-ci compris.
      </Text>

      <Button label="Modifier" onPress={() => void handleSubmit()} loading={isSubmitting} />
    </AccountLayout>
  );
}

function AccountLayout({
  title,
  formError,
  children,
}: {
  title: string;
  formError?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{title}</Text>
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
  scroll: { padding: spacing.xl, gap: spacing.lg },
  title: { ...typography.h2, color: colors.text.primary },
  formError: { ...typography.caption, color: colors.status.danger },
  hint: { ...typography.caption, color: colors.text.muted, marginTop: -spacing.sm },
  readOnly: { backgroundColor: colors.surface.subtle, color: colors.text.muted },
});
