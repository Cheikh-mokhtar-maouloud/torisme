import Link from 'next/link';

import type { PaginationMeta } from '@tourism/shared/types';

import { cn } from '@/lib/cn';

/**
 * Pagination par liens plutôt que par état client.
 *
 * La page courante vit dans l'URL : le résultat est partageable, le bouton
 * « précédent » du navigateur fonctionne, et la liste reste rendue côté serveur
 * sans avoir à transporter les données jusqu'au client.
 */
export function Pagination({
  meta,
  basePath,
  params,
}: {
  meta: PaginationMeta;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (meta.totalPages <= 1) {
    return (
      <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
        {meta.total} résultat{meta.total > 1 ? 's' : ''}
      </p>
    );
  }

  const hrefForPage = (page: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    search.set('page', String(page));
    return `${basePath}?${search.toString()}`;
  };

  const first = (meta.page - 1) * meta.limit + 1;
  const last = Math.min(meta.page * meta.limit, meta.total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3"
    >
      <p className="text-xs text-slate-500">
        {first}–{last} sur {meta.total}
      </p>

      <div className="flex items-center gap-1">
        <PageLink
          href={hrefForPage(meta.page - 1)}
          disabled={meta.page <= 1}
          label="Page précédente"
        >
          Précédent
        </PageLink>
        <span className="px-2 text-xs text-slate-500">
          {meta.page} / {meta.totalPages}
        </span>
        <PageLink
          href={hrefForPage(meta.page + 1)}
          disabled={!meta.hasNextPage}
          label="Page suivante"
        >
          Suivant
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = cn(
    'rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 ring-slate-300 ring-inset',
    disabled ? 'cursor-not-allowed text-slate-300' : 'text-slate-700 hover:bg-slate-50',
  );

  // Un lien désactivé devient un `span` : garder un `<a>` non cliquable le
  // laisserait dans l'ordre de tabulation sans rien faire.
  if (disabled) {
    return (
      <span aria-disabled className={className}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} aria-label={label} className={className}>
      {children}
    </Link>
  );
}
