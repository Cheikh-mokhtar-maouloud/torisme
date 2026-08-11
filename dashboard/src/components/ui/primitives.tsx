import type { ReactNode } from 'react';

import { ContentStatus, ExcursionStatus } from '@tourism/shared/constants';

import { cn } from '@/lib/cn';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-slate-200 bg-white shadow-sm', className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-brand-100 text-brand-900',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

const CONTENT_STATUS_LABELS: Record<string, { label: string; tone: Tone }> = {
  [ContentStatus.PUBLISHED]: { label: 'Publié', tone: 'success' },
  [ContentStatus.DRAFT]: { label: 'Brouillon', tone: 'warning' },
  [ContentStatus.ARCHIVED]: { label: 'Archivé', tone: 'neutral' },
};

const EXCURSION_STATUS_LABELS: Record<string, { label: string; tone: Tone }> = {
  [ExcursionStatus.SCHEDULED]: { label: 'Programmée', tone: 'success' },
  [ExcursionStatus.FULL]: { label: 'Complète', tone: 'warning' },
  [ExcursionStatus.CANCELLED]: { label: 'Annulée', tone: 'danger' },
  [ExcursionStatus.COMPLETED]: { label: 'Terminée', tone: 'neutral' },
};

export function StatusBadge({ status }: { status: string }) {
  const entry = CONTENT_STATUS_LABELS[status] ??
    EXCURSION_STATUS_LABELS[status] ?? { label: status, tone: 'neutral' as Tone };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}

/** Message d'erreur d'un formulaire, distinct des erreurs par champ. */
export function Alert({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'info';
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-md px-3 py-2 text-sm',
        tone === 'danger' ? 'bg-red-50 text-red-800' : 'bg-brand-50 text-brand-900',
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
