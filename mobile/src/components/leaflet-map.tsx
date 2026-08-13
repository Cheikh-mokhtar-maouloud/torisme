import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { MapMarker } from '@tourism/shared/types';

import { MARKER_COLORS } from './map-marker-card';

/**
 * Carte OpenStreetMap rendue par Leaflet dans une WebView.
 *
 * Elle remplace Google Maps pour une raison simple : le SDK Google exige une
 * clé d'API, facturée et liée à un compte de facturation, sans laquelle il
 * n'affiche **aucune tuile** — c'est exactement ce qui se produisait.
 * OpenStreetMap n'en demande aucune.
 *
 * Le compromis est réel et vaut d'être connu :
 *
 * - les gestes passent par une page web, donc légèrement moins fluides qu'une
 *   vue native sur un appareil d'entrée de gamme ;
 * - les tuiles publiques d'OpenStreetMap sont destinées à un usage modéré. Pour
 *   une mise en production, il faudra un fournisseur de tuiles (MapTiler,
 *   Stadia, Thunderforest…) — l'adresse se change en une ligne, plus bas.
 *
 * En échange : aucune clé, aucun compte, aucun quota, et la carte fonctionne
 * immédiatement dans Expo Go, sans compilation native.
 */

export interface LeafletMapHandle {
  /** Recentre la vue. Utilisé par le bouton « ma position ». */
  centerOn: (latitude: number, longitude: number, zoom?: number) => void;
}

interface LeafletMapProps {
  markers: MapMarker[];
  initialCenter: { latitude: number; longitude: number; zoom: number };
  onMarkerPress: (marker: MapMarker) => void;
  onBoundsChange: (bounds: { swLat: number; swLng: number; neLat: number; neLng: number }) => void;
  /** Appelé lorsqu'on touche la carte hors d'un marqueur. */
  onMapPress: () => void;
}

/**
 * Page HTML de la carte.
 *
 * Construite une seule fois et **sans les marqueurs** : ceux-ci sont injectés
 * ensuite. Les inclure dans le HTML obligerait à recharger toute la page à
 * chaque déplacement de la carte, ce qui remettrait la vue à zéro et rendrait
 * la navigation impossible.
 */
function buildHtml(center: { latitude: number; longitude: number; zoom: number }): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #f4f4f5; }
    /* La pastille du marqueur reprend exactement les couleurs de type de
       l'application : la légende des filtres reste vraie. */
    .pin {
      width: 18px; height: 18px; border-radius: 50%;
      border: 3px solid #ffffff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: true })
      .setView([${center.latitude}, ${center.longitude}], ${center.zoom});

    // Fournisseur de tuiles. À remplacer pour la production : les serveurs
    // publics d'OpenStreetMap sont prévus pour un usage modéré et peuvent
    // limiter le débit d'une application qui les solliciterait massivement.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      // L'attribution est une **obligation** de la licence ODbL, pas une
      // politesse : la retirer rendrait l'usage des tuiles illicite.
      attribution: '© OpenStreetMap'
    }).addTo(map);

    var layer = L.layerGroup().addTo(map);

    function send(payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }

    function reportBounds() {
      var b = map.getBounds();
      send({
        type: 'bounds',
        swLat: b.getSouth(), swLng: b.getWest(),
        neLat: b.getNorth(), neLng: b.getEast()
      });
    }

    map.on('moveend', reportBounds);
    map.on('click', function () { send({ type: 'mapPress' }); });

    // Remplace tous les marqueurs. Appelé depuis React Native à chaque
    // changement de données.
    window.setMarkers = function (markers) {
      layer.clearLayers();
      markers.forEach(function (m) {
        var icon = L.divIcon({
          className: '',
          html: '<div class="pin" style="background:' + m.color + '"></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        });
        L.marker([m.latitude, m.longitude], { icon: icon })
          .addTo(layer)
          .on('click', function (event) {
            // Sans cela, le clic atteint aussi la carte et referme la fiche
            // aussitôt ouverte.
            L.DomEvent.stopPropagation(event);
            send({ type: 'marker', id: m.id, markerType: m.type });
          });
      });
    };

    window.centerOn = function (lat, lng, zoom) {
      map.setView([lat, lng], zoom || map.getZoom(), { animate: true });
    };

    // Premier envoi : l'application a besoin du cadre visible pour charger les
    // marqueurs, avant tout déplacement de l'utilisateur.
    reportBounds();
  </script>
</body>
</html>`;
}

export const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(function LeafletMap(
  { markers, initialCenter, onMarkerPress, onBoundsChange, onMapPress },
  ref,
) {
  const webRef = useRef<WebView>(null);

  // Le HTML ne dépend que du centre initial : le recalculer à chaque rendu
  // rechargerait la page et perdrait la position de l'utilisateur.
  const html = useMemo(() => buildHtml(initialCenter), [initialCenter]);

  useImperativeHandle(ref, () => ({
    centerOn(latitude, longitude, zoom) {
      webRef.current?.injectJavaScript(
        `window.centerOn(${latitude}, ${longitude}, ${zoom ?? 'undefined'}); true;`,
      );
    },
  }));

  const payload = useMemo(
    () =>
      markers.map((marker) => ({
        id: marker.id,
        type: marker.type,
        latitude: marker.latitude,
        longitude: marker.longitude,
        color: MARKER_COLORS[marker.type],
      })),
    [markers],
  );

  /*
   * Les marqueurs sont réinjectés à chaque changement de données.
   *
   * Ils changent en permanence — le cadre visible détermine ce qui est chargé —
   * et se contenter de l'injection au chargement de la page figerait la carte
   * sur les premiers résultats. Le déplacement rechargerait bien les données,
   * mais rien ne s'afficherait.
   *
   * `isReady` évite d'appeler `setMarkers` avant que la page ne l'ait défini :
   * l'injection serait alors silencieusement perdue.
   */
  const isReady = useRef(false);

  useEffect(() => {
    if (!isReady.current) return;
    webRef.current?.injectJavaScript(`window.setMarkers(${JSON.stringify(payload)}); true;`);
  }, [payload]);

  const handleMessage = (event: WebViewMessageEvent) => {
    let message: Record<string, unknown>;

    try {
      message = JSON.parse(event.nativeEvent.data) as Record<string, unknown>;
    } catch {
      // Un message illisible est ignoré. La page est la nôtre, mais une erreur
      // de sérialisation ne doit pas faire tomber l'écran de carte.
      return;
    }

    if (message.type === 'bounds') {
      onBoundsChange({
        swLat: Number(message.swLat),
        swLng: Number(message.swLng),
        neLat: Number(message.neLat),
        neLng: Number(message.neLng),
      });
      return;
    }

    if (message.type === 'mapPress') {
      onMapPress();
      return;
    }

    if (message.type === 'marker') {
      const found = markers.find(
        (marker) => marker.id === message.id && marker.type === message.markerType,
      );
      if (found) onMarkerPress(found);
    }
  };

  return (
    <WebView
      ref={webRef}
      style={StyleSheet.absoluteFill}
      source={{ html }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      // Sans cela, Android affiche un fond blanc pendant le chargement des
      // tuiles, plus brutal qu'un gris neutre.
      androidLayerType="hardware"
      // Première injection, une fois la page prête : `setMarkers` n'existe pas
      // avant que le script de la page ne se soit exécuté.
      onLoadEnd={() => {
        isReady.current = true;
        webRef.current?.injectJavaScript(`window.setMarkers(${JSON.stringify(payload)}); true;`);
      }}
      onMessage={handleMessage}
    />
  );
});
