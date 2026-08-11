import type { Metadata } from 'next';

import { DEFAULT_CURRENCY, DEFAULT_LOCALE, SUPPORTED_COUNTRIES } from '@tourism/shared/constants';

import { Card, PageHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api/client';
import { requireAdmin } from '@/lib/auth/admin';
import { config } from '@/lib/config';

export const metadata: Metadata = { title: 'Paramètres — Administration' };

interface HealthResponse {
  status: string;
  environment: string;
  dependencies?: { mongodb?: { state: string; latencyMs: number } };
}

export default async function SettingsPage() {
  const admin = await requireAdmin();

  // La sonde profonde vérifie aussi MongoDB : c'est l'information utile ici,
  // là où la sonde superficielle ne dirait que « le processus répond ».
  let health: HealthResponse | undefined;
  try {
    health = await api.get<HealthResponse>('/api/health?deep=true');
  } catch {
    health = undefined;
  }

  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Configuration de la plateforme et état des services."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Compte connecté</h2>
          <dl className="divide-y divide-slate-100 text-sm">
            <Row label="Nom" value={admin.fullName} />
            <Row label="Email" value={admin.email} />
            <Row label="Rôle" value="Administrateur" />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">État des services</h2>
          <dl className="divide-y divide-slate-100 text-sm">
            <Row label="Backend API" value={health ? 'Disponible' : 'Injoignable'} />
            <Row label="Environnement" value={health?.environment ?? config.appEnv} />
            <Row label="Base de données" value={health?.dependencies?.mongodb?.state ?? '—'} />
            <Row
              label="Latence MongoDB"
              value={
                health?.dependencies?.mongodb ? `${health.dependencies.mongodb.latencyMs} ms` : '—'
              }
            />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Paramètres régionaux</h2>
          <dl className="divide-y divide-slate-100 text-sm">
            <Row label="Devise par défaut" value={DEFAULT_CURRENCY} />
            <Row label="Langue par défaut" value={DEFAULT_LOCALE} />
            <Row
              label="Pays couverts"
              value={SUPPORTED_COUNTRIES.map((country) => country.name).join(', ')}
            />
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Ces valeurs sont définies dans <code>shared/src/constants/config.ts</code>. Les rendre
            modifiables en base relève d’une phase ultérieure.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">À venir</h2>
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li>Phase 7 — téléversement et galeries photos</li>
            <li>Phase 8 — réservations et disponibilités</li>
            <li>Phase 10 — modération des avis</li>
            <li>Phase 11 — notifications et emails</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
