'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/primitives';
import { IDLE_FORM_STATE } from '@/lib/forms';

import { broadcastAction } from './actions';

export function BroadcastForm() {
  const [state, formAction] = useActionState(broadcastAction, IDLE_FORM_STATE);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === 'error' && state.message && <Alert>{state.message}</Alert>}
      {state.status === 'idle' && state.message && <Alert tone="info">{state.message}</Alert>}

      <Field label="Titre" name="title" errors={state.fields?.title} required>
        <Input id="title" name="title" maxLength={160} required placeholder="Maintenance prévue" />
      </Field>

      <Field
        label="Message"
        name="body"
        errors={state.fields?.body}
        hint="Affiché dans l’application. Restez bref et concret."
        required
      >
        <Textarea id="body" name="body" rows={4} maxLength={1000} required />
      </Field>

      <Field
        label="Destinataires"
        name="audience"
        hint="La diffusion générale touche tous les comptes actifs. Ce choix est délibéré."
        required
      >
        <Select id="audience" name="audience" defaultValue="">
          <option value="">Choisir…</option>
          <option value="all">Tous les comptes actifs</option>
        </Select>
      </Field>

      <Checkbox
        name="alsoEmail"
        label="Envoyer aussi par email (réservé aux annonces importantes)"
      />

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Envoi…' : 'Envoyer le message'}
    </Button>
  );
}
