'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { BookingStatus } from '@tourism/shared/constants';
import type { Booking } from '@tourism/shared/types';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { Alert } from '@/components/ui/primitives';
import { IDLE_FORM_STATE } from '@/lib/forms';

import { cancelBookingAction, confirmBookingAction } from './actions';

/**
 * Actions d'une réservation.
 *
 * Seules celles que le statut courant autorise sont affichées : proposer
 * « Confirmer » sur une réservation annulée ne produirait qu'une erreur.
 */
export function BookingActions({ booking }: { booking: Booking }) {
  const canConfirm = booking.status === BookingStatus.PENDING;
  const canCancel =
    booking.status === BookingStatus.PENDING || booking.status === BookingStatus.CONFIRMED;

  if (!canConfirm && !canCancel) {
    return (
      <p className="text-sm text-slate-500">
        Aucune action possible sur une réservation{' '}
        {booking.status === BookingStatus.CANCELLED ? 'annulée' : 'terminée'}.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {canConfirm && <ConfirmForm bookingId={booking.id} />}
      {canCancel && <CancelForm bookingId={booking.id} />}
    </div>
  );
}

function ConfirmForm({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(
    confirmBookingAction.bind(null, bookingId),
    IDLE_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-2">
      {state.status === 'error' && state.message && <Alert>{state.message}</Alert>}
      <SubmitButton label="Confirmer la réservation" pendingLabel="Confirmation…" />
      <p className="text-xs text-slate-500">
        Confirme le séjour auprès du client. La chambre reste immobilisée sur ces dates.
      </p>
    </form>
  );
}

function CancelForm({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(
    cancelBookingAction.bind(null, bookingId),
    IDLE_FORM_STATE,
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm('Annuler cette réservation ? L’action est définitive.')) {
          event.preventDefault();
        }
      }}
      className="space-y-2 border-t border-slate-200 pt-4"
    >
      {state.status === 'error' && state.message && <Alert>{state.message}</Alert>}

      <label htmlFor="reason" className="block text-sm font-medium text-slate-700">
        Motif d’annulation
      </label>
      <Textarea
        id="reason"
        name="reason"
        rows={2}
        placeholder="Communiqué au client. Facultatif."
      />
      <SubmitButton label="Annuler la réservation" pendingLabel="Annulation…" variant="danger" />
      <p className="text-xs text-slate-500">
        L’annulation libère immédiatement la chambre sur ces dates.
      </p>
    </form>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  variant = 'primary',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
