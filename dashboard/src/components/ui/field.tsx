import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/cn';

const CONTROL =
  'block w-full rounded-md bg-white px-3 py-2 text-sm text-slate-900 ' +
  'ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 ' +
  'focus:ring-2 focus:ring-brand-600 focus:outline-none ' +
  'disabled:bg-slate-50 disabled:text-slate-500';

const CONTROL_INVALID = 'ring-red-400 focus:ring-red-500';

/**
 * Enveloppe un contrôle de formulaire : libellé, aide et erreurs de validation.
 *
 * Les erreurs affichées viennent du champ `fields` renvoyé par l'API. Le
 * dashboard ne réimplémente pas les règles de validation : les afficher deux
 * fois, c'est les voir diverger dès la première évolution du schéma.
 */
export function Field({
  label,
  name,
  hint,
  errors,
  required,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  errors?: string[] | undefined;
  required?: boolean;
  children: ReactNode;
}) {
  const errorId = `${name}-error`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && !errors?.length && <p className="text-xs text-slate-500">{hint}</p>}
      {errors?.map((message) => (
        <p key={message} id={errorId} className="text-xs text-red-600">
          {message}
        </p>
      ))}
    </div>
  );
}

export function Input({
  className,
  invalid,
  ...props
}: ComponentProps<'input'> & { invalid?: boolean }) {
  return <input className={cn(CONTROL, invalid && CONTROL_INVALID, className)} {...props} />;
}

export function Textarea({
  className,
  invalid,
  ...props
}: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return <textarea className={cn(CONTROL, invalid && CONTROL_INVALID, className)} {...props} />;
}

export function Select({
  className,
  invalid,
  ...props
}: ComponentProps<'select'> & { invalid?: boolean }) {
  return (
    <select className={cn(CONTROL, invalid && CONTROL_INVALID, 'pr-8', className)} {...props} />
  );
}

export function Checkbox({ label, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
        {...props}
      />
      {label}
    </label>
  );
}

/** Section titrée d'un formulaire long, pour éviter le mur de champs. */
export function Fieldset({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="border-t border-slate-200 pt-6 first:border-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
