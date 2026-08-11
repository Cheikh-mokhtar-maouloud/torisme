'use client';

import { useActionState } from 'react';

import { Currency } from '@tourism/shared/constants';
import type { Attraction } from '@tourism/shared/types';

import { CategoryPicker } from '@/components/forms/category-picker';
import { FormShell } from '@/components/forms/form-shell';
import {
  AddressFields,
  LocationFields,
  PlaceIdentityFields,
} from '@/components/forms/place-fields';
import { Field, Fieldset, Input, Select } from '@/components/ui/field';
import { IDLE_FORM_STATE } from '@/lib/forms';

import { createAttractionAction, updateAttractionAction } from './actions';

export function AttractionForm({
  attraction,
  categories,
}: {
  attraction?: Attraction;
  categories: Array<{ id: string; name: string }>;
}) {
  const isEdit = attraction !== undefined;

  const action = isEdit ? updateAttractionAction.bind(null, attraction.id) : createAttractionAction;
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);

  return (
    <FormShell
      action={formAction}
      state={state}
      cancelHref={isEdit ? `/attractions/${attraction.id}` : '/attractions'}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer l’attraction'}
    >
      <PlaceIdentityFields values={attraction} fields={state.fields} />
      <AddressFields values={attraction} fields={state.fields} />
      <LocationFields values={attraction} fields={state.fields} />

      <Fieldset title="Tarif et classement">
        <Field
          label="Prix d’entrée"
          name="entryFee"
          errors={state.fields?.entryFee}
          hint="Laisser vide ou à 0 pour une entrée gratuite."
        >
          <Input
            id="entryFee"
            name="entryFee"
            type="number"
            min={0}
            step="any"
            defaultValue={attraction?.entryFee ?? ''}
          />
        </Field>

        <Field label="Devise" name="currency" errors={state.fields?.currency}>
          <Select id="currency" name="currency" defaultValue={attraction?.currency ?? Currency.MRU}>
            <option value={Currency.MRU}>MRU — Ouguiya</option>
            <option value={Currency.USD}>USD — Dollar</option>
            <option value={Currency.EUR}>EUR — Euro</option>
          </Select>
        </Field>

        <div className="sm:col-span-2">
          <CategoryPicker
            categories={categories}
            selectedIds={attraction?.categoryIds ?? []}
            errors={state.fields?.categoryIds}
          />
        </div>
      </Fieldset>
    </FormShell>
  );
}
