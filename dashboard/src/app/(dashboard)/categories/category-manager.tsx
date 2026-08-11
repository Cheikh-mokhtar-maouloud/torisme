'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import type { Category } from '@tourism/shared/types';

import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Alert, Badge, Card, EmptyState } from '@/components/ui/primitives';
import { IDLE_FORM_STATE } from '@/lib/forms';

import { createCategoryAction, deleteCategoryAction, toggleCategoryAction } from './actions';
import { PLACE_TYPE_OPTIONS } from './labels';

/**
 * Les catégories sont des entités courtes : formulaire de création et liste
 * cohabitent sur un seul écran, sans page dédiée par catégorie.
 */
export function CategoryManager({ categories }: { categories: Category[] }) {
  const [state, formAction] = useActionState(createCategoryAction, IDLE_FORM_STATE);

  const grouped = PLACE_TYPE_OPTIONS.map((type) => ({
    ...type,
    items: categories.filter((category) => category.appliesTo === type.value),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-slate-900">Nouvelle catégorie</h2>
        <form action={formAction} className="mt-4 space-y-4">
          {state.status === 'error' && state.message && <Alert>{state.message}</Alert>}
          {state.status === 'idle' && state.message && <Alert tone="info">{state.message}</Alert>}

          <Field label="Nom" name="name" errors={state.fields?.name} required>
            <Input id="name" name="name" required invalid={Boolean(state.fields?.name)} />
          </Field>

          <Field label="S’applique à" name="appliesTo" errors={state.fields?.appliesTo} required>
            <Select id="appliesTo" name="appliesTo" defaultValue={PLACE_TYPE_OPTIONS[1]?.value}>
              {PLACE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Slug"
            name="slug"
            errors={state.fields?.slug}
            hint="Optionnel : dérivé du nom s’il est laissé vide."
          >
            <Input id="slug" name="slug" placeholder="cuisine-traditionnelle" />
          </Field>

          <CreateButton />
        </form>
      </Card>

      <Card>
        {grouped.length === 0 ? (
          <EmptyState
            title="Aucune catégorie"
            description="Les catégories servent à filtrer les restaurants et les attractions dans l’application."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {grouped.map((group) => (
              <section key={group.value} className="p-4">
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {group.label}
                </h3>
                <ul className="divide-y divide-slate-100">
                  {group.items.map((category) => (
                    <li
                      key={category.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{category.name}</p>
                        <p className="font-mono text-xs text-slate-500">{category.slug}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge tone={category.isActive ? 'success' : 'neutral'}>
                          {category.isActive ? 'Active' : 'Inactive'}
                        </Badge>

                        <form action={toggleCategoryAction}>
                          <input type="hidden" name="id" value={category.id} />
                          <input
                            type="hidden"
                            name="isActive"
                            value={category.isActive ? 'false' : 'true'}
                          />
                          <Button type="submit" variant="secondary" size="sm">
                            {category.isActive ? 'Désactiver' : 'Activer'}
                          </Button>
                        </form>

                        <form
                          action={deleteCategoryAction}
                          onSubmit={(event) => {
                            if (
                              !window.confirm(
                                `Supprimer la catégorie « ${category.name} » ? L’opération échoue si des fiches l’utilisent.`,
                              )
                            ) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input type="hidden" name="id" value={category.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Supprimer
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? 'Création…' : 'Créer la catégorie'}
    </Button>
  );
}
