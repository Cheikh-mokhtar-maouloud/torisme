'use client';

import { useActionState } from 'react';

import { UserRole } from '@tourism/shared/constants';
import type { User } from '@tourism/shared/types';

import { FormShell } from '@/components/forms/form-shell';
import { Checkbox, Field, Fieldset, Input, Select } from '@/components/ui/field';
import { Alert } from '@/components/ui/primitives';
import { IDLE_FORM_STATE } from '@/lib/forms';

import { updateUserAction } from '../actions';

export function UserForm({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [state, formAction] = useActionState(updateUserAction.bind(null, user.id), IDLE_FORM_STATE);

  return (
    <FormShell action={formAction} state={state} cancelHref="/users" submitLabel="Enregistrer">
      {isSelf && (
        <Alert tone="info">
          Il s’agit de votre propre compte : vous ne pouvez ni le désactiver, ni retirer votre rôle
          administrateur.
        </Alert>
      )}

      <Fieldset title="Identité">
        <Field label="Nom complet" name="fullName" errors={state.fields?.fullName} required>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={user.fullName}
            required
            invalid={Boolean(state.fields?.fullName)}
          />
        </Field>

        <Field
          label="Email"
          name="email"
          hint="Non modifiable depuis l’administration : changer l’email d’un tiers permettrait une prise de contrôle du compte."
        >
          <Input id="email" name="email" defaultValue={user.email} disabled />
        </Field>

        <Field label="Téléphone" name="phone" errors={state.fields?.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={user.phone ?? ''} />
        </Field>
      </Fieldset>

      <Fieldset title="Droits et accès">
        <Field
          label="Rôle"
          name="role"
          errors={state.fields?.role}
          hint="Un administrateur accède à ce dashboard et peut modifier tout le contenu."
        >
          <Select id="role" name="role" defaultValue={user.role} disabled={isSelf}>
            <option value={UserRole.USER}>Touriste</option>
            <option value={UserRole.ADMIN}>Administrateur</option>
          </Select>
        </Field>

        <div className="flex items-end pb-2">
          <Checkbox
            name="isActive"
            label="Compte actif"
            defaultChecked={user.isActive}
            disabled={isSelf}
          />
        </div>
      </Fieldset>
    </FormShell>
  );
}
