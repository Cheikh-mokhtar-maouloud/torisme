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
  /** Place le repère de position, avec le rayon de précision du GPS. */
  setUserLocation: (latitude: number, longitude: number, accuracy?: number) => void;
  /** Trace un itinéraire. Le tableau est une suite de [latitude, longitude]. */
  setRoute: (coordinates: [number, number][]) => void;
  clearRoute: () => void;
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
    /* Repère en goutte, portant l'icône de sa catégorie.
       La couleur reprend celle des filtres et de l'accueil : la légende reste
       vraie sans avoir à être lue. L'icône ajoute ce que la couleur seule ne
       dit pas — sur une carte dense, distinguer quatre teintes demande de
       comparer, reconnaître une tasse ou un lit est immédiat. */
    .pin {
      width: 20px; height: 20px;
      border-radius: 50% 50% 50% 0;
      /* Pivotée de 45° : le coin non arrondi devient la pointe basse, qui
         désigne le lieu exact. Un disque, lui, ne montre que son centre. */
      transform: rotate(-45deg);
      border: 2px solid #ffffff;
      box-shadow: 0 2px 5px rgba(0,0,0,0.35);
      display: flex; align-items: center; justify-content: center;
    }
    /* L'icone est remise d'aplomb : sans cette contre-rotation elle
       apparaitrait penchee avec son repere.
       Sa taille est donnee en pourcentage du repere : changer la taille des
       marqueurs ne demande alors de toucher qu'une seule valeur. */
    .pin svg { transform: rotate(45deg); width: 56%; height: 56%; }
    /* Point de position : cercle plein bleu, cerné de blanc, comme le repère
       standard des applications de cartographie. La convention est assez
       établie pour qu'on la suive plutôt que d'inventer un symbole. */
    .me {
      width: 16px; height: 16px; border-radius: 50%;
      background: #2563eb; border: 3px solid #ffffff;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.2);
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
    // Calque distinct pour la position : effacer les marqueurs de lieux ne doit
    // pas effacer le repère de l'utilisateur.
    var layerMe = L.layerGroup().addTo(map);

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

    /*
     * Silhouettes des icônes, en SVG et non en police d'icônes.
     *
     * Une police devrait être chargée depuis le réseau : sur une connexion
     * lente, les repères resteraient vides ou porteraient un carré de
     * remplacement pendant plusieurs secondes. Les tracés ci-dessous sont dans
     * la page, donc dessinés au premier rendu.
     *
     * Ils reprennent les icônes des catégories de l'accueil — tasse, appareil
     * photo, boussole, lit — pour qu'un repère de la carte et une pastille de
     * l'accueil se reconnaissent l'un l'autre.
     */
    var GLYPHS = {
      HOTEL: '<path d="M3 7v10"/><path d="M3 12h18v5"/><path d="M7 12V9.5h4a2 2 0 0 1 2 2V12"/>',
      RESTAURANT: '<path d="M18 8h1a3 3 0 0 1 0 6h-1"/><path d="M3 8h15v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z"/><path d="M7 2v3"/><path d="M11 2v3"/><path d="M15 2v3"/>',
      ATTRACTION: '<path d="M22 18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.6-2.4h6.8L17 7h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.6"/>',
      EXCURSION: '<circle cx="12" cy="12" r="9"/><path d="M16 8l-2 6-6 2 2-6z"/>'
    };

    function glyphFor(type) {
      var paths = GLYPHS[type] || '';
      // Trait epais, et sans dimension fixe : la taille vient du CSS, en
      // pourcentage du repere. A onze pixels sur fond colore, un trait fin
      // disparait — d'ou 2.8 dans un carre de 24.
      // (Pas d'accent grave ici : ce bloc vit dans un litteral de gabarit.)
      return '<svg viewBox="0 0 24 24" fill="none" ' +
        'stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" ' +
        'stroke-linejoin="round">' + paths + '</svg>';
    }

    // Remplace tous les marqueurs. Appelé depuis React Native à chaque
    // changement de données.
    window.setMarkers = function (markers) {
      layer.clearLayers();
      markers.forEach(function (m) {
        var icon = L.divIcon({
          className: '',
          html: '<div class="pin" style="background:' + m.color + '">' + glyphFor(m.type) + '</div>',
          iconSize: [20, 20],
          // La pointe est en bas au centre : le repère doit désigner le lieu,
          // non le survoler. Ces valeurs suivent la taille fixée en CSS —
          // les désaccorder décale le repère de son lieu.
          iconAnchor: [10, 20]
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

    var meMarker = null;
    var meCircle = null;

    /*
     * Position de l'utilisateur.
     *
     * Leaflet ne dessine rien de lui-meme, contrairement au reglage
     * showsUserLocation de Google Maps : sans ce marqueur, recentrer la vue
     * deplacait bien la carte, mais aucun repere n'indiquait ou l'on se
     * trouvait.
     *
     * Attention en modifiant ce bloc : il vit dans un litteral de gabarit
     * JavaScript. Un accent grave y terminerait la chaine, et l'erreur qui en
     * resulte designe une ligne sans rapport.
     */
    window.setUserLocation = function (lat, lng, accuracy) {
      if (meMarker) { layerMe.removeLayer(meMarker); }
      if (meCircle) { layerMe.removeLayer(meCircle); }

      meMarker = L.marker([lat, lng], {
        icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
        // Au-dessus des lieux : c'est le repère que l'on cherche en premier.
        zIndexOffset: 1000
      }).addTo(layerMe);

      // Le cercle traduit la précision annoncée par le GPS. L'omettre laisserait
      // croire à une position exacte au mètre près, ce qu'elle n'est jamais.
      if (accuracy && accuracy > 0) {
        meCircle = L.circle([lat, lng], {
          radius: accuracy, color: '#2563eb', weight: 1,
          fillColor: '#2563eb', fillOpacity: 0.12
        }).addTo(layerMe);
      }
    };

    var routeLine = null;

    /** Trace l'itinéraire et cadre la vue pour le montrer en entier. */
    window.setRoute = function (coords) {
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
      if (!coords || coords.length === 0) return;

      routeLine = L.polyline(coords, {
        color: '#0d9488', weight: 5, opacity: 0.85, lineJoin: 'round'
      }).addTo(map);

      map.fitBounds(routeLine.getBounds(), { padding: [40, 120] });
    };

    window.clearRoute = function () {
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
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
    setUserLocation(latitude, longitude, accuracy) {
      webRef.current?.injectJavaScript(
        `window.setUserLocation(${latitude}, ${longitude}, ${accuracy ?? 0}); true;`,
      );
    },
    setRoute(coordinates) {
      webRef.current?.injectJavaScript(`window.setRoute(${JSON.stringify(coordinates)}); true;`);
    },
    clearRoute() {
      webRef.current?.injectJavaScript('window.clearRoute(); true;');
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
