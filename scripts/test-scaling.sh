#!/usr/bin/env bash
#
# Vérification de la mise à l'échelle — Phase 16.
#
# Usage :
#   bash scripts/test-scaling.sh
#
# Ce script ne mesure pas la performance : il vérifie que **plusieurs instances
# se comportent comme une seule**. C'est la propriété que toutes les phases
# précédentes ont promise sans jamais la démontrer — « le backend reste sans
# état » n'était qu'une intention tant qu'une seule instance tournait.
set -uo pipefail

cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1
export NODE_TLS_REJECT_UNAUTHORIZED=0

API="${API_URL:-https://localhost}"
REPLICAS="${REPLICAS:-3}"

PASS=0
FAIL=0

step() { printf '%-52s ' "$1"; }
ok()   { PASS=$((PASS + 1)); echo "OK    $*"; }
ko()   { FAIL=$((FAIL + 1)); echo "ÉCHEC $*"; }

api() { curl -sk "$@"; }

# Compte les requêtes servies par chaque conteneur d'un service, sur une fenêtre
# récente. Les journaux applicatifs font foi : l'en-tête d'une réponse ne dit pas
# quelle instance l'a produite, et en ajouter un exposerait la topologie interne.
served_by() {
  local service="$1" pattern="$2" window="$3"
  for container in $(docker compose ps --format '{{.Name}}' | grep "${service}"); do
    printf '%s=%s ' "${container##*-}" "$(docker logs --since "${window}" "${container}" 2>&1 | grep -c "${pattern}")"
  done
}

echo
echo "Instances en service"
echo

docker compose up -d --scale backend="${REPLICAS}" --scale realtime=2 --no-recreate > /dev/null 2>&1
sleep 20

BACKENDS="$(docker compose ps --format '{{.Name}}' | grep -c 'backend')"
REALTIMES="$(docker compose ps --format '{{.Name}}' | grep -c 'realtime')"

step "Le backend tourne en ${REPLICAS} instances"
if [[ "${BACKENDS}" -eq "${REPLICAS}" ]]; then ok; else ko "${BACKENDS} trouvée(s)"; fi

step "Le temps réel tourne en 2 instances"
if [[ "${REALTIMES}" -eq 2 ]]; then ok; else ko "${REALTIMES} trouvée(s)"; fi

step "Toutes sont déclarées saines"
UNHEALTHY="$(docker compose ps --format '{{.Name}} {{.Status}}' | grep -cE 'unhealthy|Restarting')"
if [[ "${UNHEALTHY}" -eq 0 ]]; then ok; else ko "${UNHEALTHY} instance(s) en défaut"; fi

echo
echo "Répartition de charge"
echo

for _ in $(seq 1 60); do api "${API}/api/hotels" > /dev/null; done
sleep 2

DISTRIBUTION="$(served_by backend '"path":"/api/hotels"' 45s)"
USED="$(echo "${DISTRIBUTION}" | tr ' ' '\n' | grep -v '=0$' | grep -c '=')"

step "Les requêtes se répartissent sur les instances"
if [[ "${USED}" -ge 2 ]]; then ok "${DISTRIBUTION}"; else ko "une seule instance sert : ${DISTRIBUTION}"; fi

echo
echo "Absence d'état en mémoire"
echo

# La démonstration décisive : une session ouverte sur une instance doit être
# utilisable par les autres. Si un jeton n'était valable que là où il a été émis,
# un utilisateur serait déconnecté au hasard des requêtes — la panne classique
# d'une application qu'on met à l'échelle sans l'avoir prévu.
TOKEN="$(api -X POST -H 'Content-Type: application/json' \
  -d '{"email":"admin@tourism.mr","password":"Admin123!"}' \
  "${API}/api/auth/login" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.token' 2>/dev/null)"

step "Une session est ouverte"
if [[ -n "${TOKEN}" && "${TOKEN}" != "undefined" ]]; then ok; else ko "connexion impossible"; fi

FAILURES=0
for _ in $(seq 1 30); do
  CODE="$(api -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${TOKEN}" "${API}/api/auth/me")"
  [[ "${CODE}" != "200" ]] && FAILURES=$((FAILURES + 1))
done

step "Le jeton est accepté par toutes les instances"
if [[ "${FAILURES}" -eq 0 ]]; then ok; else ko "${FAILURES}/30 refus"; fi

sleep 2
ME_DISTRIBUTION="$(served_by backend '"path":"/api/auth/me"' 30s)"
ME_USED="$(echo "${ME_DISTRIBUTION}" | tr ' ' '\n' | grep -v '=0$' | grep -c '=')"

step "Ces requêtes ont bien traversé plusieurs instances"
if [[ "${ME_USED}" -ge 2 ]]; then ok "${ME_DISTRIBUTION}"; else ko "une seule instance : ${ME_DISTRIBUTION}"; fi

echo
echo "Compteurs partagés"
echo

# La limitation de débit doit compter **globalement**. Un compteur en mémoire de
# processus verrait chaque instance appliquer son propre quota : la limite
# effective serait multipliée par le nombre d'instances, c'est-à-dire abolie au
# moment précis où l'on met à l'échelle pour absorber une montée en charge.
docker compose exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning --scan --pattern "tourism:ratelimit:*" | xargs -r redis-cli -a "$REDIS_PASSWORD" --no-auth-warning del' > /dev/null 2>&1

# La rafale est **parallèle**, et c'est essentiel : en séquentiel, 340 requêtes
# s'étalent sur plus d'une minute et la fenêtre se réinitialise avant d'être
# atteinte. Le test passerait alors sans rien avoir vérifié.
BURST=340
for _ in $(seq 1 "${BURST}"); do
  api -o /dev/null -w '%{http_code}\n' "${API}/api/categories" &
done > /tmp/burst.txt 2>&1
wait

ALLOWED="$(grep -c '^200$' /tmp/burst.txt)"
REFUSED="$(grep -c '^429$' /tmp/burst.txt)"

step "Le quota est commun à toutes les instances"
# Le quota de lecture est de 300 par minute. Un compteur local en laisserait
# passer 300 **par instance**, soit 900 — la limite serait abolie au moment
# précis où l'on met à l'échelle pour absorber une montée en charge.
if [[ "${REFUSED}" -gt 0 && "${ALLOWED}" -le 320 ]]; then
  ok "${ALLOWED} servies, ${REFUSED} refusées (quota 300/min)"
else
  ko "${ALLOWED} servies, ${REFUSED} refusées — un compteur local en laisserait passer ~900"
fi

# Le cache doit l'être aussi : une entrée écrite par une instance doit servir aux
# autres, sinon le taux de succès s'effondre à mesure qu'on ajoute des instances.
CACHE_KEYS="$(docker compose exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning --scan --pattern "tourism:cache:*" | wc -l' 2>/dev/null | tr -d '\r')"

step "Le cache est partagé"
if [[ "${CACHE_KEYS}" -gt 0 ]]; then ok "${CACHE_KEYS} entrée(s)"; else ko "aucune entrée en cache"; fi

echo
echo "Temps réel multi-instances"
echo

# Chaque instance doit recevoir la publication. C'est ce que le passage en
# pub/sub de la Phase 13 avait rendu possible : avec l'ancien transport HTTP, le
# backend ne joignait qu'une seule adresse, donc une seule instance, et les
# clients connectés aux autres n'auraient jamais rien reçu.
docker compose exec -T redis sh -c \
  'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning publish tourism:realtime:events "{\"event\":\"booking:updated\",\"target\":{\"kind\":\"admins\"},\"payload\":{}}"' \
  > /dev/null 2>&1

sleep 3
RT_DISTRIBUTION="$(served_by realtime 'événement diffusé' 20s)"
RT_RECEIVED="$(echo "${RT_DISTRIBUTION}" | tr ' ' '\n' | grep -v '=0$' | grep -c '=')"

step "Chaque instance reçoit la publication"
if [[ "${RT_RECEIVED}" -eq 2 ]]; then
  ok "${RT_DISTRIBUTION}"
else
  ko "seules ${RT_RECEIVED}/2 ont reçu : ${RT_DISTRIBUTION}"
fi

echo
echo "Redémarrage sans coupure"
echo

# Le quota est remis à zéro : la rafale précédente vient de le consommer, et sans
# cette purge ce test mesurerait la limitation de débit au lieu de la continuité
# de service — il échouerait en 429 sans qu'aucune instance n'ait failli.
docker compose exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning --scan --pattern "tourism:ratelimit:*" | xargs -r redis-cli -a "$REDIS_PASSWORD" --no-auth-warning del' > /dev/null 2>&1

# Une instance est arrêtée pendant que le trafic continue. Avec plusieurs
# instances derrière Nginx, aucune requête ne doit échouer : c'est la condition
# d'un déploiement sans interruption.
(
  for _ in $(seq 1 120); do
    api -o /dev/null -w '%{http_code}\n' "${API}/api/hotels"
    sleep 0.25
  done
) > /tmp/rolling.txt 2>&1 &
TRAFFIC_PID=$!

sleep 3
docker compose restart backend-1 > /dev/null 2>&1 || docker restart tourism-backend-1 > /dev/null 2>&1
wait "${TRAFFIC_PID}"

TOTAL="$(wc -l < /tmp/rolling.txt)"
ERRORS="$(grep -cvE '^200$' /tmp/rolling.txt)"

step "Le trafic survit à l'arrêt d'une instance"
if [[ "${ERRORS}" -eq 0 ]]; then
  ok "${TOTAL} requêtes, aucune erreur"
else
  ko "${ERRORS}/${TOTAL} en erreur — codes : $(sort -u /tmp/rolling.txt | tr '\n' ' ')"
fi

echo
echo "${PASS} réussis, ${FAIL} échoués"
echo
[[ "${FAIL}" -gt 0 ]] && exit 1
exit 0
