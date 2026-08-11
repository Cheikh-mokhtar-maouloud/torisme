'use client';

import { useActionState } from 'react';

import { Currency } from '@tourism/shared/constants';
import type { Hotel } from '@tourism/shared/types';

import { FormShell } from '@/components/forms/form-shell';
import {
  AddressFields,
  LocationFields,
  PlaceIdentityFields,
} from '@/components/forms/place-fields';
import { Field, Fieldset, Input } from '@/components/ui/field';
import { IDLE_FORM_STATE } from '@/lib/forms';

import { createHotelAction, updateHotelAction } from './actions';

export function HotelForm({ hotel }: { hotel?: Hotel }) {
  const isEdit = hotel !== undefined;

  // En édition, l'identifiant est lié à l'action avant de la passer au hook :
  // il ne transite donc pas par un champ caché que le client pourrait modifier.
  const action = isEdit ? updateHotelAction.bind(null, hotel.id) : createHotelAction;
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);

  return (
    <FormShell
      action={formAction}
      state={state}
      cancelHref={isEdit ? `/hotels/${hotel.id}` : '/hotels'}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer l’hôtel'}
    >
      <PlaceIdentityFields values={hotel} fields={state.fields} />
      <AddressFields values={hotel} fields={state.fields} />
      <LocationFields values={hotel} fields={state.fields} />

      <Fieldset title="Caractéristiques">
        <Field
          label="Étoiles"
          name="stars"
          errors={state.fields?.stars}
          hint="De 1 à 5, optionnel."
        >
          <Input
            id="stars"
            name="stars"
            type="number"
            min={1}
            max={5}
            defaultValue={hotel?.stars ?? ''}
          />
        </Field>

        <Field label="Devise" name="currency" errors={state.fields?.currency} required>
          <select
            id="currency"
            name="currency"
            defaultValue={hotel?.currency ?? Currency.MRU}
            className="block w-full rounded-md bg-white px-3 py-2 pr-8 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-600 focus:outline-none"
          >
            <option value={Currency.MRU}>MRU — Ouguiya</option>
            <option value={Currency.USD}>USD — Dollar</option>
            <option value={Currency.EUR}>EUR — Euro</option>
          </select>
        </Field>

        <Field label="Heure d’arrivée" name="checkInTime" errors={state.fields?.checkInTime}>
          <Input
            id="checkInTime"
            name="checkInTime"
            type="time"
            defaultValue={hotel?.checkInTime ?? '14:00'}
          />
        </Field>

        <Field label="Heure de départ" name="checkOutTime" errors={state.fields?.checkOutTime}>
          <Input
            id="checkOutTime"
            name="checkOutTime"
            type="time"
            defaultValue={hotel?.checkOutTime ?? '12:00'}
          />
        </Field>

        <Field label="Téléphone" name="phone" errors={state.fields?.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={hotel?.phone ?? ''} />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Équipements"
            name="amenities"
            errors={state.fields?.amenities}
            hint="Séparés par des virgules : wifi, piscine, parking…"
          >
            <Input
              id="amenities"
              name="amenities"
              defaultValue={hotel?.amenities?.join(', ') ?? ''}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field
            label="Règles"
            name="rules"
            errors={state.fields?.rules}
            hint="Séparées par des virgules : Non-fumeur, Animaux non admis…"
          >
            <Input id="rules" name="rules" defaultValue={hotel?.rules?.join(', ') ?? ''} />
          </Field>
        </div>
      </Fieldset>
    </FormShell>
  );
}
