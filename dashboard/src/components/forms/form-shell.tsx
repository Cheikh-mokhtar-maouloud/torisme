'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/primitives';
import type { FormState } from '@/lib/forms';

/**
 * Enveloppe commune aux formulaires de création et d'édition : carte, message
 * d'erreur global, barre d'actions et état de soumission.
 */
export function FormShell({
  action,
  state,
  cancelHref,
  submitLabel,
  children,
}: {
  action: (payload: FormData) => void;
  state: FormState;
  cancelHref: string;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <form action={action}>
      <Card className="p-5 sm:p-6">
        {state.status === 'error' && state.message && (
          <div className="mb-5">
            <Alert>{state.message}</Alert>
          </div>
        )}

        <div className="space-y-6">{children}</div>
      </Card>

      <div className="mt-4 flex items-center gap-2">
        <SubmitButton label={submitLabel} />
        <ButtonLink href={cancelHref} variant="secondary">
          Annuler
        </ButtonLink>
      </div>
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Enregistrement…' : label}
    </Button>
  );
}

/**
 * Bouton de suppression.
 *
 * `confirm()` natif : une modale maison demanderait un état client, un piège de
 * focus et une gestion d'échappement pour un gain d'ergonomie faible sur une
 * action rare et destructrice.
 */
export function DeleteButton({
  action,
  label = 'Supprimer',
  confirmMessage,
}: {
  action: () => void;
  label?: string;
  confirmMessage: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <DeleteSubmit label={label} />
    </form>
  );
}

function DeleteSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? 'Suppression…' : label}
    </Button>
  );
}
