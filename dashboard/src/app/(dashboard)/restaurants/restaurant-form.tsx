'use client';

import { useActionState } from 'react';

import type { Restaurant } from '@tourism/shared/types';

import { CategoryPicker } from '@/components/forms/category-picker';
import { FormShell } from '@/components/forms/form-shell';
import {
  AddressFields,
  LocationFields,
  PlaceIdentityFields,
} from '@/components/forms/place-fields';
import { Field, Fieldset, Input, Select } from '@/components/ui/field';
import { IDLE_FORM_STATE } from '@/lib/forms';

import { createRestaurantAction, updateRestaurantAction } from './actions';

const PRICE_RANGES = [
  { value: '1', label: '€ — économique' },
  { value: '2', label: '€€ — modéré' },
  { value: '3', label: '€€€ — élevé' },
  { value: '4', label: '€€€€ — haut de gamme' },
];

export function RestaurantForm({
  restaurant,
  categories,
}: {
  restaurant?: Restaurant;
  categories: Array<{ id: string; name: string }>;
}) {
  const isEdit = restaurant !== undefined;

  const action = isEdit ? updateRestaurantAction.bind(null, restaurant.id) : createRestaurantAction;
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);

  return (
    <FormShell
      action={formAction}
      state={state}
      cancelHref={isEdit ? `/restaurants/${restaurant.id}` : '/restaurants'}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer le restaurant'}
    >
      <PlaceIdentityFields values={restaurant} fields={state.fields} />
      <AddressFields values={restaurant} fields={state.fields} />
      <LocationFields values={restaurant} fields={state.fields} />

      <Fieldset title="Caractéristiques">
        <Field label="Gamme de prix" name="priceRange" errors={state.fields?.priceRange}>
          <Select
            id="priceRange"
            name="priceRange"
            defaultValue={String(restaurant?.priceRange ?? 2)}
          >
            {PRICE_RANGES.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Téléphone" name="phone" errors={state.fields?.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={restaurant?.phone ?? ''} />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Types de cuisine"
            name="cuisineTypes"
            errors={state.fields?.cuisineTypes}
            hint="Séparés par des virgules : mauritanienne, fruits de mer…"
          >
            <Input
              id="cuisineTypes"
              name="cuisineTypes"
              defaultValue={restaurant?.cuisineTypes?.join(', ') ?? ''}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field
            label="Lien du menu"
            name="menuUrl"
            errors={state.fields?.menuUrl}
            hint="URL complète, commençant par https://"
          >
            <Input
              id="menuUrl"
              name="menuUrl"
              type="url"
              defaultValue={restaurant?.menuUrl ?? ''}
              invalid={Boolean(state.fields?.menuUrl)}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <CategoryPicker
            categories={categories}
            selectedIds={restaurant?.categoryIds ?? []}
            errors={state.fields?.categoryIds}
          />
        </div>
      </Fieldset>
    </FormShell>
  );
}
