'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Alert } from '@/components/ui/primitives';
import { IDLE_FORM_STATE } from '@/lib/forms';

import { loginAction } from './actions';

export function LoginForm({ notice }: { notice?: string }) {
  const [state, formAction] = useActionState(loginAction, IDLE_FORM_STATE);

  return (
    <form action={formAction} className="space-y-4">
      {notice && <Alert tone="info">{notice}</Alert>}
      {state.status === 'error' && state.message && <Alert>{state.message}</Alert>}

      <Field label="Email" name="email" errors={state.fields?.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          invalid={Boolean(state.fields?.email)}
          placeholder="admin@tourism.mr"
        />
      </Field>

      <Field label="Mot de passe" name="password" errors={state.fields?.password} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          invalid={Boolean(state.fields?.password)}
        />
      </Field>

      <SubmitButton />
    </form>
  );
}

/**
 * `useFormStatus` doit être appelé dans un composant enfant du formulaire :
 * appelé dans le même composant que `<form>`, il renverrait toujours `false`.
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Connexion…' : 'Se connecter'}
    </Button>
  );
}
