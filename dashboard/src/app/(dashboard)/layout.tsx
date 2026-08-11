import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Sidebar } from '@/components/layout/sidebar';
import { requireAdmin } from '@/lib/auth/admin';

import { logoutAction } from '../login/actions';

/**
 * Layout de la zone protégée.
 *
 * `requireAdmin()` revalide la session auprès du backend à chaque rendu : un
 * compte désactivé perd l'accès immédiatement, sans attendre l'expiration du
 * jeton. Le middleware ne fait qu'un test de présence du cookie en amont.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-slate-200 bg-white lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="grid size-8 place-items-center rounded-md bg-brand-600 text-sm font-bold text-white">
            TP
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">Tourism Platform</p>
            <p className="text-[11px] text-slate-500">Administration</p>
          </div>
        </div>
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-slate-900">{admin.fullName}</p>
            <p className="text-xs text-slate-500">{admin.email}</p>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary" size="sm">
              Déconnexion
            </Button>
          </form>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
