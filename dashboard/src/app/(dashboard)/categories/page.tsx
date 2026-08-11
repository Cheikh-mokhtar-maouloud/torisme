import type { Metadata } from 'next';

import type { Category } from '@tourism/shared/types';

import { PageHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api/client';

import { CategoryManager } from './category-manager';

export const metadata: Metadata = { title: 'Catégories — Administration' };

export default async function CategoriesPage() {
  // Les catégories sont peu nombreuses par nature : la liste complète tient
  // largement sous la limite de 100 imposée par l'API.
  const { items } = await api.list<Category>('/api/categories?limit=100');

  return (
    <>
      <PageHeader
        title="Catégories"
        description="Filtres proposés dans l’application pour les restaurants et les attractions."
      />
      <CategoryManager categories={items} />
    </>
  );
}
