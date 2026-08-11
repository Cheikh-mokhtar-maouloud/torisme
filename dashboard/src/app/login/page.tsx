import type { Metadata } from 'next';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Connexion — Administration' };

const NOTICES: Record<string, string> = {
  expired: 'Votre session a expiré. Reconnectez-vous.',
  forbidden: 'Ce compte n’a pas accès à l’administration.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const notice = error ? NOTICES[error] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold tracking-widest text-brand-700 uppercase">
            Tourism Platform
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Administration</h1>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm {...(notice ? { notice } : {})} />
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Accès réservé aux administrateurs de la plateforme.
        </p>
      </div>
    </main>
  );
}
