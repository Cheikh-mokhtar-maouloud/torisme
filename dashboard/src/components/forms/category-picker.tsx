import { Field } from '@/components/ui/field';

/**
 * Sélection multiple de catégories, en cases à cocher plutôt qu'en
 * `<select multiple>` : ce dernier impose de maintenir Ctrl enfoncé, geste que
 * la plupart des utilisateurs ne connaissent pas, et masque les options
 * non sélectionnées.
 *
 * Toutes les cases partagent le nom `categoryIds` : le navigateur envoie une
 * entrée par case cochée, que `FormData.getAll` relit sous forme de tableau.
 */
export function CategoryPicker({
  categories,
  selectedIds = [],
  errors,
}: {
  categories: Array<{ id: string; name: string }>;
  selectedIds?: string[];
  errors?: string[] | undefined;
}) {
  if (categories.length === 0) {
    return (
      <Field label="Catégories" name="categoryIds">
        <p className="text-sm text-slate-500">
          Aucune catégorie disponible pour ce type de lieu. Créez-en depuis la section « Catégories
          ».
        </p>
      </Field>
    );
  }

  return (
    <Field label="Catégories" name="categoryIds" errors={errors}>
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
        {categories.map((category) => (
          <label key={category.id} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="categoryIds"
              value={category.id}
              defaultChecked={selectedIds.includes(category.id)}
              className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
            />
            {category.name}
          </label>
        ))}
      </div>
    </Field>
  );
}
