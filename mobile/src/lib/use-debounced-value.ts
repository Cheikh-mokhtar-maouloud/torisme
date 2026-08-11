import { useEffect, useState } from 'react';

/**
 * Retarde la propagation d'une valeur qui change vite.
 *
 * Appliqué à un champ de recherche, il évite une requête par frappe : un mot de
 * huit lettres déclencherait autrement huit allers-retours, dont sept seraient
 * périmés avant d'aboutir — et autant de données consommées sur un forfait
 * mobile.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    // Chaque changement annule le compte à rebours précédent : seule la dernière
    // valeur d'une rafale de saisie est propagée.
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
