'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

/**
 * Navigation principale.
 *
 * Les modules dont l'API n'existe pas encore sont affichés désactivés plutôt
 * qu'omis : la portée du produit reste lisible, et un lien mort ne renvoie pas
 * l'administrateur sur une page vide.
 */
interface NavItem {
  href: string;
  label: string;
  phase?: number;
}

const SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Général',
    items: [{ href: '/', label: 'Tableau de bord' }],
  },
  {
    title: 'Hébergement',
    items: [
      { href: '/hotels', label: 'Hôtels' },
      { href: '/rooms', label: 'Chambres' },
    ],
  },
  {
    title: 'Découverte',
    items: [
      { href: '/restaurants', label: 'Restaurants' },
      { href: '/attractions', label: 'Attractions' },
      { href: '/excursions', label: 'Excursions' },
      { href: '/categories', label: 'Catégories' },
    ],
  },
  {
    title: 'Activité',
    items: [
      { href: '/bookings', label: 'Réservations' },
      { href: '/reviews', label: 'Avis', phase: 10 },
      { href: '/notifications', label: 'Notifications', phase: 11 },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/users', label: 'Utilisateurs' },
      { href: '/settings', label: 'Paramètres' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigation principale" className="space-y-6 p-4">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                {item.phase ? (
                  <span
                    title={`Disponible en Phase ${item.phase}`}
                    className="flex cursor-not-allowed items-center justify-between rounded-md px-2 py-1.5 text-sm text-slate-400"
                  >
                    {item.label}
                    <span className="text-[10px] font-medium">P{item.phase}</span>
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-2 py-1.5 text-sm transition-colors',
                      isActive(pathname, item.href)
                        ? 'bg-brand-50 font-medium text-brand-900'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * L'accueil ne doit correspondre qu'à la racine exacte, sinon il resterait
 * actif sur toutes les pages. Les autres entrées couvrent aussi leurs
 * sous-routes (`/hotels/123` garde « Hôtels » actif).
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
