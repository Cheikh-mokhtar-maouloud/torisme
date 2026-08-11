import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import type { User } from '@tourism/shared/types';

import { ButtonLink } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/primitives';
import { api, ApiRequestError } from '@/lib/api/client';
import { requireAdmin } from '@/lib/auth/admin';
import { formatDate } from '@/lib/format';

import { UserForm } from './user-form';

type PageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'Utilisateur — Administration' };

export default async function UserDetailPage({ params }: PageProps) {
  const { id } = await params;

  // L'administrateur courant est nécessaire pour désactiver les contrôles qui
  // le concerneraient lui-même — l'API les refuserait de toute façon, mais un
  // champ grisé vaut mieux qu'une erreur après soumission.
  const [currentAdmin, user] = await Promise.all([requireAdmin(), loadUser(id)]);

  return (
    <>
      <PageHeader
        title={user.fullName}
        description={`${user.email} · inscrit le ${formatDate(user.createdAt)}`}
        actions={
          <ButtonLink href="/users" variant="ghost">
            ← Liste
          </ButtonLink>
        }
      />
      <UserForm user={user} isSelf={currentAdmin.id === user.id} />
    </>
  );
}

async function loadUser(id: string): Promise<User> {
  try {
    return await api.get<User>(`/api/users/${id}`);
  } catch (error) {
    if (error instanceof ApiRequestError && (error.status === 404 || error.status === 422)) {
      notFound();
    }
    throw error;
  }
}
