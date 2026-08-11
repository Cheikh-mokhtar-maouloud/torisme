import { ContentStatus } from '@tourism/shared/constants';
import type { Address, GeoPoint } from '@tourism/shared/types';

import { Field, Fieldset, Input, Select, Textarea } from '@/components/ui/field';

/**
 * Champs communs aux hôtels, restaurants et attractions.
 *
 * Ces trois entités partagent la même base « lieu » côté API ; leur formulaire
 * partage donc la même base côté dashboard, sinon les trois écrans divergent
 * dès la première évolution du modèle.
 */

interface PlaceValues {
  name?: string;
  description?: string;
  address?: Address;
  location?: GeoPoint;
  status?: string;
}

export function PlaceIdentityFields({
  values,
  fields,
}: {
  values?: PlaceValues;
  fields?: Record<string, string[]>;
}) {
  return (
    <Fieldset title="Identité">
      <div className="sm:col-span-2">
        <Field label="Nom" name="name" errors={fields?.name} required>
          <Input
            id="name"
            name="name"
            defaultValue={values?.name ?? ''}
            required
            invalid={Boolean(fields?.name)}
          />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Field
          label="Description"
          name="description"
          errors={fields?.description}
          hint="10 caractères minimum. Affichée sur la fiche dans l’application mobile."
          required
        >
          <Textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={values?.description ?? ''}
            required
            invalid={Boolean(fields?.description)}
          />
        </Field>
      </div>

      <Field label="Statut" name="status" errors={fields?.status} required>
        <Select id="status" name="status" defaultValue={values?.status ?? ContentStatus.DRAFT}>
          <option value={ContentStatus.DRAFT}>Brouillon — invisible côté mobile</option>
          <option value={ContentStatus.PUBLISHED}>Publié — visible par tous</option>
          <option value={ContentStatus.ARCHIVED}>Archivé</option>
        </Select>
      </Field>
    </Fieldset>
  );
}

export function AddressFields({
  values,
  fields,
}: {
  values?: PlaceValues;
  fields?: Record<string, string[]>;
}) {
  return (
    <Fieldset title="Adresse">
      <div className="sm:col-span-2">
        <Field label="Adresse" name="line1" errors={fields?.['address.line1']}>
          <Input id="line1" name="line1" defaultValue={values?.address?.line1 ?? ''} />
        </Field>
      </div>

      <Field label="Ville" name="city" errors={fields?.['address.city']} required>
        <Input
          id="city"
          name="city"
          defaultValue={values?.address?.city ?? ''}
          required
          invalid={Boolean(fields?.['address.city'])}
        />
      </Field>

      <Field label="Région" name="region" errors={fields?.['address.region']}>
        <Input id="region" name="region" defaultValue={values?.address?.region ?? ''} />
      </Field>

      <Field label="Pays" name="country" errors={fields?.['address.country']} required>
        <Input
          id="country"
          name="country"
          defaultValue={values?.address?.country ?? 'Mauritanie'}
          required
        />
      </Field>

      <Field
        label="Code pays"
        name="countryCode"
        errors={fields?.['address.countryCode']}
        hint="Code ISO à deux lettres (MR, SN, MA…)."
        required
      >
        <Input
          id="countryCode"
          name="countryCode"
          maxLength={2}
          defaultValue={values?.address?.countryCode ?? 'MR'}
          required
          className="uppercase"
        />
      </Field>
    </Fieldset>
  );
}

/**
 * Coordonnées saisies en `latitude` / `longitude`, l'ordre naturel pour un
 * humain qui les copie depuis une carte. La conversion vers l'ordre GeoJSON
 * `[longitude, latitude]` est faite au moment de construire la requête, à un
 * seul endroit — c'est l'inversion la plus fréquente sur ce type de projet.
 */
export function LocationFields({
  values,
  fields,
  legend = 'Localisation',
}: {
  values?: PlaceValues;
  fields?: Record<string, string[]>;
  legend?: string;
}) {
  const [longitude, latitude] = values?.location?.coordinates ?? [];

  return (
    <Fieldset
      title={legend}
      description="Coordonnées GPS du lieu, telles qu’affichées sur la carte de l’application."
    >
      <Field
        label="Latitude"
        name="latitude"
        errors={fields?.['location.coordinates.1'] ?? fields?.location}
        hint="Entre -90 et 90. Exemple : 18.0735"
        required
      >
        <Input
          id="latitude"
          name="latitude"
          type="number"
          step="any"
          min={-90}
          max={90}
          defaultValue={latitude ?? ''}
          required
        />
      </Field>

      <Field
        label="Longitude"
        name="longitude"
        errors={fields?.['location.coordinates.0']}
        hint="Entre -180 et 180. Exemple : -15.9582"
        required
      >
        <Input
          id="longitude"
          name="longitude"
          type="number"
          step="any"
          min={-180}
          max={180}
          defaultValue={longitude ?? ''}
          required
        />
      </Field>
    </Fieldset>
  );
}
