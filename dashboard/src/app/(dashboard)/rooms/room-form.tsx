'use client';

import { useActionState } from 'react';

import { ContentStatus, Currency } from '@tourism/shared/constants';
import type { Hotel, Room } from '@tourism/shared/types';

import { FormShell } from '@/components/forms/form-shell';
import { Field, Fieldset, Input, Select, Textarea } from '@/components/ui/field';
import { IDLE_FORM_STATE } from '@/lib/forms';

import { createRoomAction, updateRoomAction } from './actions';

export function RoomForm({
  room,
  hotels,
  defaultHotelId,
}: {
  room?: Room;
  /** Hôtels sélectionnables. Chargés côté serveur : la liste n'est pas paginée ici. */
  hotels: Pick<Hotel, 'id' | 'name'>[];
  defaultHotelId?: string;
}) {
  const isEdit = room !== undefined;

  const action = isEdit ? updateRoomAction.bind(null, room.id, room.hotelId) : createRoomAction;
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);

  return (
    <FormShell
      action={formAction}
      state={state}
      cancelHref={isEdit ? `/rooms/${room.id}` : '/rooms'}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer la chambre'}
    >
      <Fieldset title="Rattachement">
        <div className="sm:col-span-2">
          <Field
            label="Hôtel"
            name="hotelId"
            errors={state.fields?.hotelId}
            hint={
              isEdit
                ? 'Non modifiable : déplacer une chambre invaliderait ses réservations.'
                : undefined
            }
            required
          >
            <Select
              id="hotelId"
              name="hotelId"
              defaultValue={room?.hotelId ?? defaultHotelId ?? ''}
              disabled={isEdit}
              required
              invalid={Boolean(state.fields?.hotelId)}
            >
              <option value="" disabled>
                Sélectionner un hôtel…
              </option>
              {hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Fieldset>

      <Fieldset title="Identité">
        <div className="sm:col-span-2">
          <Field label="Nom" name="name" errors={state.fields?.name} required>
            <Input
              id="name"
              name="name"
              defaultValue={room?.name ?? ''}
              required
              invalid={Boolean(state.fields?.name)}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Description" name="description" errors={state.fields?.description} required>
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={room?.description ?? ''}
              required
              invalid={Boolean(state.fields?.description)}
            />
          </Field>
        </div>

        <Field label="Statut" name="status" errors={state.fields?.status} required>
          <Select id="status" name="status" defaultValue={room?.status ?? ContentStatus.DRAFT}>
            <option value={ContentStatus.DRAFT}>Brouillon — non réservable</option>
            <option value={ContentStatus.PUBLISHED}>Publié — réservable</option>
            <option value={ContentStatus.ARCHIVED}>Archivé</option>
          </Select>
        </Field>
      </Fieldset>

      <Fieldset title="Capacité et tarif">
        <Field
          label="Capacité (personnes)"
          name="capacity"
          errors={state.fields?.capacity}
          required
        >
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            max={20}
            defaultValue={room?.capacity ?? 2}
            required
          />
        </Field>

        <Field label="Nombre de lits" name="bedCount" errors={state.fields?.bedCount} required>
          <Input
            id="bedCount"
            name="bedCount"
            type="number"
            min={1}
            max={10}
            defaultValue={room?.bedCount ?? 1}
            required
          />
        </Field>

        <Field
          label="Prix par nuit"
          name="pricePerNight"
          errors={state.fields?.pricePerNight}
          required
        >
          <Input
            id="pricePerNight"
            name="pricePerNight"
            type="number"
            min={1}
            step="any"
            defaultValue={room?.pricePerNight ?? ''}
            required
          />
        </Field>

        <Field label="Devise" name="currency" errors={state.fields?.currency} required>
          <Select id="currency" name="currency" defaultValue={room?.currency ?? Currency.MRU}>
            <option value={Currency.MRU}>MRU — Ouguiya</option>
            <option value={Currency.USD}>USD — Dollar</option>
            <option value={Currency.EUR}>EUR — Euro</option>
          </Select>
        </Field>

        <Field
          label="Nombre d’unités"
          name="totalUnits"
          errors={state.fields?.totalUnits}
          hint="Combien de chambres identiques de ce type existent physiquement."
          required
        >
          <Input
            id="totalUnits"
            name="totalUnits"
            type="number"
            min={1}
            max={500}
            defaultValue={room?.totalUnits ?? 1}
            required
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Équipements"
            name="amenities"
            errors={state.fields?.amenities}
            hint="Séparés par des virgules : wifi, climatisation, télévision…"
          >
            <Input
              id="amenities"
              name="amenities"
              defaultValue={room?.amenities?.join(', ') ?? ''}
            />
          </Field>
        </div>
      </Fieldset>
    </FormShell>
  );
}
