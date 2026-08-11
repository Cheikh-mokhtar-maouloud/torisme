'use client';

import { useActionState } from 'react';

import { Currency, ExcursionStatus } from '@tourism/shared/constants';
import type { Excursion } from '@tourism/shared/types';

import { FormShell } from '@/components/forms/form-shell';
import { AddressFields, LocationFields } from '@/components/forms/place-fields';
import { Field, Fieldset, Input, Select, Textarea } from '@/components/ui/field';
import { IDLE_FORM_STATE } from '@/lib/forms';

import { createExcursionAction, updateExcursionAction } from './actions';

/**
 * `<input type="datetime-local">` attend `YYYY-MM-DDTHH:mm` en **heure locale**.
 * Passer directement une chaîne ISO (UTC) décalerait l'heure affichée du fuseau
 * du navigateur, ce qui se remarque surtout après enregistrement.
 */
function toLocalInputValue(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function ExcursionForm({ excursion }: { excursion?: Excursion }) {
  const isEdit = excursion !== undefined;

  const action = isEdit ? updateExcursionAction.bind(null, excursion.id) : createExcursionAction;
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);

  const soldSeats = excursion ? excursion.totalSeats - excursion.availableSeats : 0;

  return (
    <FormShell
      action={formAction}
      state={state}
      cancelHref={isEdit ? `/excursions/${excursion.id}` : '/excursions'}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer l’excursion'}
    >
      <Fieldset title="Identité">
        <div className="sm:col-span-2">
          <Field label="Titre" name="title" errors={state.fields?.title} required>
            <Input
              id="title"
              name="title"
              defaultValue={excursion?.title ?? ''}
              required
              invalid={Boolean(state.fields?.title)}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Description" name="description" errors={state.fields?.description} required>
            <Textarea
              id="description"
              name="description"
              rows={4}
              defaultValue={excursion?.description ?? ''}
              required
              invalid={Boolean(state.fields?.description)}
            />
          </Field>
        </div>

        <Field label="Destination" name="destination" errors={state.fields?.destination} required>
          <Input
            id="destination"
            name="destination"
            defaultValue={excursion?.destination ?? ''}
            required
          />
        </Field>

        <Field label="Statut" name="status" errors={state.fields?.status} required>
          <Select
            id="status"
            name="status"
            defaultValue={excursion?.status ?? ExcursionStatus.SCHEDULED}
          >
            <option value={ExcursionStatus.SCHEDULED}>Programmée</option>
            <option value={ExcursionStatus.FULL}>Complète</option>
            <option value={ExcursionStatus.CANCELLED}>Annulée</option>
            <option value={ExcursionStatus.COMPLETED}>Terminée</option>
          </Select>
        </Field>

        <Field label="Guide" name="guideName" errors={state.fields?.guideName}>
          <Input id="guideName" name="guideName" defaultValue={excursion?.guideName ?? ''} />
        </Field>
      </Fieldset>

      <AddressFields values={{ address: excursion?.departureAddress }} fields={state.fields} />
      <LocationFields
        values={{ location: excursion?.departureLocation }}
        fields={state.fields}
        legend="Point de départ"
      />

      <Fieldset title="Programmation">
        <Field
          label="Date et heure de départ"
          name="startsAt"
          errors={state.fields?.startsAt}
          required
        >
          <Input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={toLocalInputValue(excursion?.startsAt)}
            required
          />
        </Field>

        <Field
          label="Durée (minutes)"
          name="durationMinutes"
          errors={state.fields?.durationMinutes}
          hint="960 pour 16 h, 4320 pour 3 jours."
          required
        >
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={15}
            defaultValue={excursion?.durationMinutes ?? 240}
            required
          />
        </Field>

        <Field label="Prix par place" name="price" errors={state.fields?.price} required>
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            step="any"
            defaultValue={excursion?.price ?? ''}
            required
          />
        </Field>

        <Field label="Devise" name="currency" errors={state.fields?.currency} required>
          <Select id="currency" name="currency" defaultValue={excursion?.currency ?? Currency.MRU}>
            <option value={Currency.MRU}>MRU — Ouguiya</option>
            <option value={Currency.USD}>USD — Dollar</option>
            <option value={Currency.EUR}>EUR — Euro</option>
          </Select>
        </Field>

        <Field
          label="Places totales"
          name="totalSeats"
          errors={state.fields?.totalSeats}
          hint={
            isEdit
              ? `${soldSeats} place(s) déjà réservée(s) : le total ne peut pas descendre en dessous.`
              : 'Les places restantes seront initialisées à cette valeur.'
          }
          required
        >
          <Input
            id="totalSeats"
            name="totalSeats"
            type="number"
            min={isEdit ? Math.max(1, soldSeats) : 1}
            max={1000}
            defaultValue={excursion?.totalSeats ?? 10}
            required
          />
        </Field>
      </Fieldset>
    </FormShell>
  );
}
