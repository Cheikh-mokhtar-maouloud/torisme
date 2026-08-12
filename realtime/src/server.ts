import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

import { jwtVerify } from 'jose';
import Redis from 'ioredis';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';

import { SOCKET_EVENTS, SOCKET_ROOMS, realtimeChannel } from '@tourism/shared/constants';

import { loadConfig } from './config.js';

const config = loadConfig();

const ISSUER = 'tourism-platform';
const AUDIENCE = 'tourism-clients';
const secretKey = new TextEncoder().encode(config.JWT_SECRET);

function log(level: 'info' | 'warn' | 'error', message: string, context?: object): void {
  console.log(JSON.stringify({ level, time: new Date().toISOString(), message, ...context }));
}

/* -------------------------------------------------------------------------- */
/* Serveur HTTP : santé et publication                                         */
/* -------------------------------------------------------------------------- */

const publishSchema = z.object({
  event: z.enum(Object.values(SOCKET_EVENTS) as [string, ...string[]]),
  /** Destinataire : un compte précis, ou l'ensemble des administrateurs. */
  target: z.union([
    z.object({ kind: z.literal('user'), userId: z.string().min(1) }),
    z.object({ kind: z.literal('admins') }),
  ]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

type PublishPayload = z.infer<typeof publishSchema>;

/**
 * Comparaison à temps constant du secret de publication.
 *
 * Une égalité `===` sur une chaîne s'interrompt au premier caractère différent :
 * la durée de comparaison révèle alors combien de caractères sont corrects, ce
 * qui permet de reconstituer le secret octet par octet.
 */
function isAuthorizedPublisher(header: string | undefined): boolean {
  if (!header) return false;

  const provided = Buffer.from(header);
  const expected = Buffer.from(config.REALTIME_PUBLISH_SECRET);

  // `timingSafeEqual` exige des longueurs égales ; les comparer d'abord ne
  // fuite rien d'exploitable, la longueur du secret n'étant pas secrète.
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}

const httpServer = createServer((request: IncomingMessage, response: ServerResponse) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        status: 'ok',
        service: 'tourism-realtime',
        environment: config.APP_ENV,
        connections: io.engine.clientsCount,
        uptimeSeconds: Math.round(process.uptime()),
      }),
    );
    return;
  }

  if (request.method === 'POST' && request.url === '/emit') {
    handlePublish(request, response);
    return;
  }

  response.writeHead(404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ error: 'Not found' }));
});

/**
 * Publication d'un événement par le backend.
 *
 * Second recours depuis la Phase 13 : le transport principal est désormais
 * Redis pub/sub, qui atteint toutes les instances de ce service. Cette route
 * reste en place pour les déploiements sans Redis, et parce qu'elle ne coûte
 * rien tant qu'elle n'est pas appelée.
 */
function handlePublish(request: IncomingMessage, response: ServerResponse): void {
  if (!isAuthorizedPublisher(request.headers['x-publish-secret'] as string | undefined)) {
    log('warn', 'publication refusée : secret invalide');
    response.writeHead(401, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  let raw = '';
  // Borne de taille : un événement temps réel transporte quelques identifiants,
  // pas un document. Sans limite, une requête pourrait saturer la mémoire.
  const MAX_BODY_BYTES = 16 * 1024;

  request.on('data', (chunk: Buffer) => {
    raw += chunk.toString('utf8');
    if (raw.length > MAX_BODY_BYTES) request.destroy();
  });

  request.on('end', () => {
    const parsed = publishSchema.safeParse(safeJsonParse(raw));

    if (!parsed.success) {
      response.writeHead(422, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Invalid payload' }));
      return;
    }

    const room = dispatch(parsed.data);

    response.writeHead(202, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ emitted: true, room }));
  });
}

/**
 * Diffuse un événement validé vers sa salle.
 *
 * Point d'entrée unique des deux transports — HTTP et Redis pub/sub. Dupliquer
 * ce calcul ferait diverger le routage entre les deux voies, et un événement
 * pourrait alors atteindre la bonne salle par un chemin et la mauvaise par
 * l'autre.
 */
function dispatch({ event, target, payload }: PublishPayload): string {
  const room = target.kind === 'user' ? SOCKET_ROOMS.user(target.userId) : SOCKET_ROOMS.admins;

  io.to(room).emit(event, payload);
  log('info', 'événement diffusé', { event, room });

  return room;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Socket.IO                                                                   */
/* -------------------------------------------------------------------------- */

const io = new Server(httpServer, {
  cors: {
    // L'application mobile n'envoie pas d'origine ; le dashboard, si.
    origin: config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS : true,
    credentials: true,
  },
  // Le service ne conserve aucun état : une reconnexion repart d'une poignée de
  // main complète, ce qui reste correct derrière plusieurs instances.
  transports: ['websocket', 'polling'],
});

interface SocketData {
  userId: string;
  role: string;
}

/**
 * Authentification à la connexion.
 *
 * Le jeton d'accès est vérifié **cryptographiquement**, sans accès à la base :
 * ce service n'a pas de connexion MongoDB, et n'en a pas besoin. Un compte
 * désactivé garde donc son canal ouvert jusqu'à l'expiration du jeton
 * (15 minutes) — acceptable, puisqu'il ne reçoit que des événements le
 * concernant, et que toute action réelle repasse par l'API qui, elle, revérifie.
 */
io.use(async (socket: Socket, next) => {
  const token =
    (socket.handshake.auth as { token?: string } | undefined)?.token ??
    extractBearer(socket.handshake.headers.authorization);

  if (!token) {
    next(new Error('Jeton manquant'));
    return;
  }

  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });

    if (typeof payload.sub !== 'string') {
      next(new Error('Jeton invalide'));
      return;
    }

    (socket.data as SocketData) = {
      userId: payload.sub,
      role: typeof payload.role === 'string' ? payload.role : 'USER',
    };

    next();
  } catch {
    next(new Error('Jeton invalide ou expiré'));
  }
});

io.on('connection', (socket: Socket) => {
  const { userId, role } = socket.data as SocketData;

  /*
   * Le client ne choisit **jamais** sa salle : elle est dérivée du jeton. Laisser
   * un `join` piloté par le client permettrait d'écouter le canal de n'importe
   * qui en connaissant son identifiant.
   */
  void socket.join(SOCKET_ROOMS.user(userId));
  if (role === 'ADMIN') void socket.join(SOCKET_ROOMS.admins);

  log('info', 'client connecté', { userId, role, connections: io.engine.clientsCount });

  socket.on('disconnect', (reason) => {
    log('info', 'client déconnecté', { userId, reason });
  });
});

function extractBearer(header: string | undefined): string | undefined {
  if (!header?.toLowerCase().startsWith('bearer ')) return undefined;
  return header.slice(7).trim() || undefined;
}

/* -------------------------------------------------------------------------- */
/* Abonnement Redis                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Réception des événements publiés par le backend.
 *
 * Ce transport remplace l'appel HTTP `/emit` et lève sa limite de fond : avec
 * HTTP, le backend ne pouvait joindre qu'une seule adresse, donc une seule
 * instance temps réel, et les clients connectés aux autres n'auraient rien
 * reçu. Un message pub/sub atteint toutes les instances abonnées — c'est la
 * condition de la mise à l'échelle horizontale.
 *
 * `/emit` est conservé : il sert de second recours quand Redis est absent, et
 * il n'a aucun coût tant qu'il n'est pas appelé.
 *
 * **Une connexion dédiée est obligatoire.** Un client Redis passé en mode
 * abonné n'accepte plus aucune autre commande ; réutiliser une connexion
 * partagée la rendrait inutilisable pour tout le reste.
 */
let subscriber: Redis | undefined;

if (config.REDIS_URL) {
  const channel = realtimeChannel(config.REDIS_KEY_PREFIX);

  subscriber = new Redis(config.REDIS_URL, {
    // Ici, à l'inverse du cache du backend, la connexion doit **tenir** : un
    // abonné qui renonce cesse silencieusement de recevoir les événements.
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => Math.min(times * 500, 10_000),
  });

  subscriber.on('error', (error: Error) => {
    log('warn', 'connexion redis dégradée', { errorMessage: error.message });
  });

  subscriber.on('message', (_channel: string, raw: string) => {
    const parsed = publishSchema.safeParse(safeJsonParse(raw));

    /*
     * Un message mal formé est ignoré, pas propagé. Le canal est interne, mais
     * un message d'une version antérieure du backend resté en vol pendant un
     * déploiement suffirait sinon à faire tomber le service — et avec lui,
     * toutes les connexions clientes ouvertes.
     */
    if (!parsed.success) {
      log('warn', 'message redis ignoré : charge utile invalide');
      return;
    }

    dispatch(parsed.data);
  });

  void subscriber
    .subscribe(channel)
    .then(() => log('info', 'abonné au canal redis', { channel }))
    .catch((error: Error) =>
      log('error', 'abonnement redis impossible', { channel, errorMessage: error.message }),
    );
}

/* -------------------------------------------------------------------------- */

httpServer.listen(config.PORT, () => {
  log('info', 'service temps réel démarré', {
    port: config.PORT,
    environment: config.APP_ENV,
    transport: config.REDIS_URL ? 'redis+http' : 'http',
  });
});

// Arrêt propre : les clients reçoivent une déconnexion explicite et se
// reconnectent, au lieu d'attendre l'expiration d'un socket mort.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log('info', 'arrêt en cours', { signal });
    void subscriber?.quit().catch(() => subscriber?.disconnect());
    io.close(() => httpServer.close(() => process.exit(0)));
  });
}
