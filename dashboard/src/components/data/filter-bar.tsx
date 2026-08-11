import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';

/**
 * Barre de recherche et de filtres.
 *
 * C'est un formulaire GET : la soumission écrit les critères dans l'URL, que la
 * page serveur relit. Aucun état React, aucune synchronisation manuelle entre
 * l'URL et les champs — l'URL *est* l'état.
 */
export interface FilterOption {
  name: string;
  label: string;
  value: string | undefined;
  options: Array<{ value: string; label: string }>;
}

export function FilterBar({
  basePath,
  search,
  searchPlaceholder = 'Rechercher…',
  filters = [],
}: {
  basePath: string;
  search: string | undefined;
  searchPlaceholder?: string;
  filters?: FilterOption[];
}) {
  const hasActiveFilter = Boolean(search) || filters.some((filter) => filter.value);

  return (
    <form
      action={basePath}
      method="get"
      className="flex flex-wrap items-end gap-2 border-b border-slate-200 px-4 py-3"
    >
      <div className="min-w-52 flex-1">
        <label htmlFor="search" className="sr-only">
          Rechercher
        </label>
        <Input
          id="search"
          name="search"
          type="search"
          defaultValue={search ?? ''}
          placeholder={searchPlaceholder}
        />
      </div>

      {filters.map((filter) => (
        <div key={filter.name} className="w-44">
          <label htmlFor={filter.name} className="sr-only">
            {filter.label}
          </label>
          <Select id={filter.name} name={filter.name} defaultValue={filter.value ?? ''}>
            <option value="">{filter.label} : tous</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ))}

      <Button type="submit" variant="secondary">
        Filtrer
      </Button>

      {hasActiveFilter && (
        <a
          href={basePath}
          className="px-2 py-2 text-sm text-slate-500 underline-offset-2 hover:underline"
        >
          Réinitialiser
        </a>
      )}
    </form>
  );
}
