'use client';

import { useActionState, useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { UPLOAD } from '@tourism/shared/constants';
import type { ImageRef } from '@tourism/shared/types';

import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, EmptyState } from '@/components/ui/primitives';
import {
  moveImageAction,
  removeImageAction,
  setMainImageAction,
  uploadImageAction,
  type ImageResource,
} from '@/lib/actions/images';
import { IDLE_FORM_STATE } from '@/lib/forms';

/**
 * Galerie d'une fiche : ajout, réordonnancement, image principale, suppression.
 *
 * L'image de position 0 est la couverture — celle qui apparaît dans les listes
 * et sur la carte. C'est affiché explicitement, sinon l'ordre paraît arbitraire.
 */
export function ImageManager({
  resource,
  entityId,
  images,
}: {
  resource: ImageResource;
  entityId: string;
  images: ImageRef[];
}) {
  const sorted = [...images].sort((a, b) => a.order - b.order);
  const maxMegabytes = Math.round(UPLOAD.MAX_IMAGE_SIZE_BYTES / (1024 * 1024));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Photos <span className="font-normal text-slate-500">({sorted.length})</span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            JPEG, PNG ou WebP · {maxMegabytes} Mo maximum · la première image sert de couverture
          </p>
        </div>
        <UploadForm resource={resource} entityId={entityId} />
      </div>

      <Card>
        {sorted.length === 0 ? (
          <EmptyState
            title="Aucune photo"
            description="Une fiche sans photo s’affiche avec un simple repère dans l’application."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map((image, index) => (
              <li key={image.providerId ?? image.url} className="flex items-center gap-4 p-3">
                {/*
                  `<img>` plutôt que `next/image` : les URL proviennent d'un
                  fournisseur externe configurable à l'exécution, qu'il faudrait
                  déclarer à l'avance dans `next.config`. L'optimisation n'a
                  guère d'intérêt sur une vignette d'administration.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.alt ?? ''}
                  className="size-16 shrink-0 rounded-md bg-slate-100 object-cover"
                />

                <div className="min-w-0 flex-1">
                  {index === 0 ? (
                    <Badge tone="info">Couverture</Badge>
                  ) : (
                    <span className="text-xs text-slate-500">Position {index + 1}</span>
                  )}
                  <p className="mt-1 truncate font-mono text-xs text-slate-400">
                    {image.width && image.height ? `${image.width} × ${image.height} · ` : ''}
                    {image.providerId ?? image.url}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {index > 0 && (
                    <IconAction
                      action={setMainImageAction.bind(
                        null,
                        resource,
                        entityId,
                        image.providerId ?? '',
                      )}
                      label="Définir comme couverture"
                      icon="★"
                    />
                  )}
                  <IconAction
                    action={moveImageAction.bind(
                      null,
                      resource,
                      entityId,
                      image.providerId ?? '',
                      'up',
                    )}
                    label="Monter"
                    icon="↑"
                    disabled={index === 0}
                  />
                  <IconAction
                    action={moveImageAction.bind(
                      null,
                      resource,
                      entityId,
                      image.providerId ?? '',
                      'down',
                    )}
                    label="Descendre"
                    icon="↓"
                    disabled={index === sorted.length - 1}
                  />
                  <DeleteImage
                    action={removeImageAction.bind(
                      null,
                      resource,
                      entityId,
                      image.providerId ?? '',
                    )}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function UploadForm({ resource, entityId }: { resource: ImageResource; entityId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction] = useActionState(
    uploadImageAction.bind(null, resource, entityId),
    IDLE_FORM_STATE,
  );

  return (
    <form
      action={(formData) => {
        formAction(formData);
        // Réinitialise le champ : sans cela, resélectionner le même fichier
        // n'émettrait aucun événement de changement.
        if (inputRef.current) inputRef.current.value = '';
      }}
      className="flex items-center gap-2"
    >
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept={UPLOAD.ALLOWED_IMAGE_TYPES.join(',')}
        required
        className="block w-56 text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
      />
      <UploadButton />

      {state.status === 'error' && state.message ? (
        <div className="w-full">
          <Alert>{state.message}</Alert>
        </div>
      ) : null}
    </form>
  );
}

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Envoi…' : 'Ajouter'}
    </Button>
  );
}

function IconAction({
  action,
  label,
  icon,
  disabled = false,
}: {
  action: () => void;
  label: string;
  icon: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span aria-hidden className="px-1.5 py-1 text-sm text-slate-200">
        {icon}
      </span>
    );
  }

  return (
    <form action={action}>
      <button
        type="submit"
        title={label}
        aria-label={label}
        className="rounded px-1.5 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        {icon}
      </button>
    </form>
  );
}

function DeleteImage({ action }: { action: () => void }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm('Supprimer définitivement cette photo ?')) event.preventDefault();
      }}
    >
      <button
        type="submit"
        title="Supprimer"
        aria-label="Supprimer la photo"
        className="rounded px-1.5 py-1 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700"
      >
        ✕
      </button>
    </form>
  );
}
