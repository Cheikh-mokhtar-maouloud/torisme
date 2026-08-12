import type { Metadata } from 'next';

import { Card, PageHeader } from '@/components/ui/primitives';

import { BroadcastForm } from './broadcast-form';

export const metadata: Metadata = { title: 'Notifications — Administration' };

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Diffuser un message aux utilisateurs de l’application."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,32rem)_1fr] lg:items-start">
        <Card className="p-5">
          <BroadcastForm />
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Notifications automatiques</h2>
          <p className="mt-1 text-xs text-slate-500">
            Envoyées sans intervention, à chaque événement concerné.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li>Réservation confirmée — notification et email au client</li>
            <li>Réservation annulée — notification et email, avec le motif saisi</li>
            <li>Nouvelle demande — notification aux administrateurs</li>
            <li>Avis modéré — notification à son auteur</li>
            <li>Création de compte — email de bienvenue</li>
            <li>Mot de passe oublié — email contenant le lien de réinitialisation</li>
          </ul>

          <p className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-500">
            Les rappels d’excursion et les notifications push arrivent en Phase 13, avec la file
            d’attente qui permettra de les planifier et de réessayer les envois échoués.
          </p>
        </Card>
      </div>
    </>
  );
}
