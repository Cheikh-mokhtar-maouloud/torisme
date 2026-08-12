'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { ReviewStatus } from '@tourism/shared/constants';
import type { Review } from '@tourism/shared/types';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { Alert, Badge, Card } from '@/components/ui/primitives';
import { IDLE_FORM_STATE } from '@/lib/forms';

import { approveReviewAction, deleteReviewAction, rejectReviewAction } from './actions';

const STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }
> = {
  [ReviewStatus.PENDING]: { label: 'En attente', tone: 'warning' },
  [ReviewStatus.APPROVED]: { label: 'Approuvé', tone: 'success' },
  [ReviewStatus.REJECTED]: { label: 'Rejeté', tone: 'danger' },
};

const TYPE_LABELS: Record<string, string> = {
  HOTEL: 'Hôtel',
  RESTAURANT: 'Restaurant',
  ATTRACTION: 'Attraction',
  EXCURSION: 'Excursion',
};

/**
 * Fiche d'avis en file de modération.
 *
 * Le formulaire de rejet est toujours visible plutôt que caché derrière un
 * bouton : un motif saisi au moment de la décision est bien plus souvent
 * renseigné qu'un motif demandé après coup.
 */
export function ReviewCard({
  review,
  authorName,
  targetName,
  formattedDate,
}: {
  review: Review;
  authorName: string;
  targetName: string;
  formattedDate: string;
}) {
  const status = STATUS[review.status] ?? { label: review.status, tone: 'neutral' as const };
  const isPending = review.status === ReviewStatus.PENDING;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">
              {'★'.repeat(review.rating)}
            </span>
            <span className="text-xs text-slate-400">{review.rating}/5</span>
            <Badge tone={status.tone}>{status.label}</Badge>
            {review.reportCount > 0 && (
              <Badge tone="danger">
                {review.reportCount} signalement{review.reportCount > 1 ? 's' : ''}
              </Badge>
            )}
            {review.bookingId && <Badge tone="info">Séjour vérifié</Badge>}
          </div>

          <p className="mt-1 text-xs text-slate-500">
            {TYPE_LABELS[review.targetType] ?? review.targetType} · {targetName} — par {authorName},{' '}
            {formattedDate}
          </p>
        </div>
      </div>

      {review.comment ? (
        <p className="mt-3 text-sm whitespace-pre-line text-slate-700">{review.comment}</p>
      ) : (
        <p className="mt-3 text-sm text-slate-400">Note sans commentaire.</p>
      )}

      {review.moderationReason && (
        <p className="mt-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
          <span className="font-medium">Motif de modération : </span>
          {review.moderationReason}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
        {isPending && <ApproveForm reviewId={review.id} />}
        <RejectForm reviewId={review.id} isPending={isPending} />
        <DeleteForm reviewId={review.id} />
      </div>
    </Card>
  );
}

function ApproveForm({ reviewId }: { reviewId: string }) {
  const [state, formAction] = useActionState(
    approveReviewAction.bind(null, reviewId),
    IDLE_FORM_STATE,
  );

  return (
    <form action={formAction}>
      {state.status === 'error' && state.message && <Alert>{state.message}</Alert>}
      <SubmitButton label="Approuver" pendingLabel="…" />
    </form>
  );
}

function RejectForm({ reviewId, isPending }: { reviewId: string; isPending: boolean }) {
  const [state, formAction] = useActionState(
    rejectReviewAction.bind(null, reviewId),
    IDLE_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-1 items-end gap-2">
      {state.status === 'error' && state.message && <Alert>{state.message}</Alert>}
      <div className="min-w-48 flex-1">
        <label htmlFor={`reason-${reviewId}`} className="sr-only">
          Motif du rejet
        </label>
        <Textarea
          id={`reason-${reviewId}`}
          name="reason"
          rows={1}
          placeholder="Motif du rejet (interne, facultatif)"
        />
      </div>
      <SubmitButton
        label={isPending ? 'Rejeter' : 'Retirer de l’affichage'}
        pendingLabel="…"
        variant="secondary"
      />
    </form>
  );
}

function DeleteForm({ reviewId }: { reviewId: string }) {
  return (
    <form
      action={deleteReviewAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            'Supprimer définitivement cet avis ? Le rejet suffit à le retirer de l’affichage tout en gardant une trace.',
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={reviewId} />
      <Button type="submit" variant="ghost" size="sm">
        Supprimer
      </Button>
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
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
