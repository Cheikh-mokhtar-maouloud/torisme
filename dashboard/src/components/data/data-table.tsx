import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Tableau de liste partagé par tous les modules.
 *
 * Les colonnes sont décrites par des données plutôt que par du JSX répété :
 * chaque module fournit ses accesseurs, la mise en page reste identique
 * partout. C'est ce qui évite six tableaux légèrement différents.
 */
export interface Column<T> {
  key: string;
  header: string;
  /** Contenu de la cellule. */
  cell: (row: T) => ReactNode;
  /** Masquée sous `sm` : réserver aux informations secondaires. */
  hideOnMobile?: boolean;
  align?: 'left' | 'right';
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  empty: ReactNode;
}) {
  if (rows.length === 0) return <>{empty}</>;

  return (
    // Le conteneur défile horizontalement : sur mobile, c'est le tableau qui
    // déborde, jamais la page.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-4 py-2.5 text-xs font-semibold tracking-wide text-slate-600 uppercase',
                  column.align === 'right' ? 'text-right' : 'text-left',
                  column.hideOnMobile && 'hidden sm:table-cell',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-4 py-3 align-middle text-slate-700',
                    column.align === 'right' ? 'text-right' : 'text-left',
                    column.hideOnMobile && 'hidden sm:table-cell',
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
