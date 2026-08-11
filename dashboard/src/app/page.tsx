import { DEFAULT_CURRENCY, SUPPORTED_COUNTRIES } from '@tourism/shared/constants';

/**
 * Page d'accueil provisoire (Phase 1).
 *
 * Elle sert de vérification de bout en bout : si elle s'affiche, le workspace
 * partagé `@tourism/shared` est bien résolu et transpilé par Next, et Tailwind
 * est actif. Elle sera remplacée par le vrai dashboard en Phase 3.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-sm font-medium tracking-wide text-teal-700 uppercase">Phase 1</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Tourism Platform — Administration
        </h1>
        <p className="mt-3 text-slate-600">
          Fondation en place. Le dashboard sera construit en Phase 3.
        </p>
      </div>

      <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white text-sm">
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">API backend</dt>
          <dd className="font-mono text-slate-900">
            {process.env.NEXT_PUBLIC_API_URL ?? 'non configurée'}
          </dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">Devise par défaut</dt>
          <dd className="font-mono text-slate-900">{DEFAULT_CURRENCY}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">Pays couverts</dt>
          <dd className="font-mono text-slate-900">
            {SUPPORTED_COUNTRIES.map((country) => country.name).join(', ')}
          </dd>
        </div>
      </dl>
    </main>
  );
}
