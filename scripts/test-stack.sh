#!/usr/bin/env bash
#
# Exécute les suites de tests **contre la pile conteneurisée**.
#
# Usage :
#   bash scripts/test-stack.sh
#
# Deux niveaux de vérification, délibérément séparés.
#
# 1. **Les applications**, jointes par le réseau interne de Docker
#    (`http://backend:3000`). C'est ce que voit le dashboard et le worker en
#    production, et cela prouve que les images fonctionnent.
# 2. **La bordure Nginx**, jointe en HTTPS depuis l'hôte. C'est ce que voit un
#    client réel : TLS, routage par nom d'hôte, redirection, WebSocket.
#
# Les mélanger masquerait la moitié des pannes possibles : une image cassée
# derrière un Nginx correct, ou l'inverse.
set -uo pipefail

cd "$(dirname "$0")/.."

PASS=0
FAIL=0

step() { printf '%-46s ' "$1"; }
ok()   { PASS=$((PASS + 1)); echo "OK    $*"; }
ko()   { FAIL=$((FAIL + 1)); echo "ÉCHEC $*"; }

# --- 1. Les applications, depuis le réseau interne ---------------------------
#
# Un conteneur jetable est attaché au réseau de la pile. Publier les ports des
# applications pour les tester depuis l'hôte reviendrait à tester une topologie
# qui n'existe pas en production — et à ouvrir ces ports.
echo
echo "Applications (réseau interne)"
echo

run_in_network() {
  docker compose run --rm --no-deps --entrypoint sh backend -c "$1" 2>&1
}

step "Le backend répond"
if run_in_network "wget -qO- http://backend:3000/api/health" | grep -q '"status":"ok"'; then
  ok
else
  ko "le conteneur backend ne répond pas"
fi

step "MongoDB et Redis sont joints"
DEPS="$(run_in_network "wget -qO- 'http://backend:3000/api/health?deep=true'")"
if echo "${DEPS}" | grep -q '"state":"connected"' && echo "${DEPS}" | grep -q '"reachable":true'; then
  ok
else
  ko "${DEPS:0:160}"
fi

step "Le dashboard rend sa page de connexion"
if run_in_network "wget -qO- http://dashboard:3000/login" | grep -qi "connexion"; then
  ok
else
  ko "le dashboard ne rend pas"
fi

step "Le service temps réel répond"
if run_in_network "wget -qO- http://realtime:4100/health" | grep -q '"status":"ok"'; then
  ok
else
  ko "realtime injoignable"
fi

# Une publication d'hôte se reconnaît à la flèche : « 0.0.0.0:80->80/tcp ». Un
# port sans flèche — « 27017/tcp » — n'est qu'exposé au réseau interne.
#
# `docker compose port` ne convient pas ici : il renvoie « :0 » avec un code de
# sortie 0 lorsque rien n'est publié, et un test fondé sur ce code déclarerait
# une publication qui n'existe pas.
published_ports() {
  docker compose ps --format '{{.Service}} {{.Ports}}' | awk -v s="$1" '$1 == s' | grep -o -- '->' || true
}

step "MongoDB n'est pas publié sur l'hôte"
# Une base MongoDB joignable depuis Internet est la faille la plus banale et la
# plus coûteuse de ce type de déploiement.
if [[ -z "$(published_ports mongo)" ]]; then ok; else ko "27017 est publié"; fi

step "Redis n'est pas publié sur l'hôte"
if [[ -z "$(published_ports redis)" ]]; then ok; else ko "6379 est publié"; fi

step "Seul Nginx publie des ports"
NON_EDGE="$(for svc in backend dashboard realtime worker mongo redis; do
  [[ -n "$(published_ports "$svc")" ]] && echo "$svc"
done)"
if [[ -z "${NON_EDGE}" ]]; then ok; else ko "publient aussi : ${NON_EDGE//$'
'/ }"; fi

# --- 2. La bordure Nginx, en HTTPS -------------------------------------------
#
# `--resolve` fait pointer le nom vers 127.0.0.1 sans toucher au fichier hosts :
# la requête porte le bon SNI et le bon en-tête Host, donc Nginx choisit le bon
# hôte virtuel. `-k` accepte le certificat auto-signé du poste — jamais en
# production.
echo
echo "Bordure Nginx (HTTPS)"
echo

# shellcheck disable=SC1091
set -a && source .env && set +a

curl_edge() {
  curl -sk --resolve "$1:443:127.0.0.1" --resolve "$1:80:127.0.0.1" "${@:2}"
}

step "L'API répond en HTTPS"
if curl_edge "${API_DOMAIN}" "https://${API_DOMAIN}/api/health" | grep -q '"status":"ok"'; then
  ok
else
  ko "pas de réponse via Nginx"
fi

step "HTTP redirige vers HTTPS"
CODE="$(curl_edge "${API_DOMAIN}" -o /dev/null -w '%{http_code}' "http://${API_DOMAIN}/api/health")"
if [[ "${CODE}" == "301" ]]; then
  ok
else
  ko "code ${CODE}, attendu 301"
fi

step "Le défi ACME reste accessible en clair"
# Rediriger ce chemin ferait échouer chaque renouvellement, et le certificat
# expirerait au bout de trois mois sans que personne n'ait rien changé.
CODE="$(curl_edge "${API_DOMAIN}" -o /dev/null -w '%{http_code}' "http://${API_DOMAIN}/.well-known/acme-challenge/test")"
if [[ "${CODE}" == "404" ]]; then
  ok
else
  ko "code ${CODE}, attendu 404 (et non une redirection 301)"
fi

step "Le routage par nom d'hôte distingue les services"
API_BODY="$(curl_edge "${API_DOMAIN}" "https://${API_DOMAIN}/api/health")"
DASH_BODY="$(curl_edge "${DASHBOARD_DOMAIN}" "https://${DASHBOARD_DOMAIN}/login")"
if echo "${API_BODY}" | grep -q 'tourism-backend' && echo "${DASH_BODY}" | grep -qi 'connexion'; then
  ok
else
  ko "les deux domaines ne mènent pas aux bons services"
fi

step "Les routes internes ne sont pas exposées"
# Le worker joint le backend par le réseau Docker : ces routes n'ont aucune
# raison d'être publiées, même protégées par un secret.
CODE="$(curl_edge "${API_DOMAIN}" -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -d '{}' \
  "https://${API_DOMAIN}/api/internal/maintenance")"
if [[ "${CODE}" == "404" ]]; then
  ok
else
  ko "code ${CODE}, attendu 404"
fi

step "Le dashboard conserve sa propre CSP"
# Nginx ne doit ajouter aucun en-tête de sécurité : la CSP du dashboard porte un
# nonce régénéré à chaque réponse, qu'un `add_header` remplacerait — cassant la
# page au lieu de la protéger.
CSP="$(curl_edge "${DASHBOARD_DOMAIN}" -sI "https://${DASHBOARD_DOMAIN}/login" | grep -i '^content-security-policy' || true)"
if echo "${CSP}" | grep -q 'nonce-'; then
  ok
else
  ko "CSP absente ou sans nonce : ${CSP:0:100}"
fi

step "Nginx ne divulgue pas sa version"
if curl_edge "${API_DOMAIN}" -sI "https://${API_DOMAIN}/api/health" | grep -qi '^server: nginx/[0-9]'; then
  ko "la version exacte est annoncée"
else
  ok
fi

step "Le corps des requêtes est plafonné"
# Le plafond arrête l'envoi **avant** Node : un fichier de 2 Go est refusé sans
# consommer une once de mémoire applicative.
CODE="$(head -c 10000000 /dev/zero | curl_edge "${API_DOMAIN}" -o /dev/null -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' --data-binary @- "https://${API_DOMAIN}/api/hotels" 2>/dev/null)"
if [[ "${CODE}" == "413" ]]; then
  ok
else
  ko "code ${CODE}, attendu 413"
fi

# --- Résultat ----------------------------------------------------------------
echo
echo "${PASS} réussis, ${FAIL} échoués"
echo
[[ "${FAIL}" -gt 0 ]] && exit 1
exit 0
