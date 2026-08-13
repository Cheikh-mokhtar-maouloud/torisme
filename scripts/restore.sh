#!/usr/bin/env bash
#
# Restauration d'une sauvegarde MongoDB.
#
# Usage :
#   ./scripts/restore.sh backups/tourism-2026-08-13_03-00-00.gz
#   ./scripts/restore.sh --dry-run backups/…      # restaure dans une base jetable
#
# Le mode `--dry-run` existe parce qu'une sauvegarde jamais restaurée n'est pas
# une sauvegarde : c'est une hypothèse. Il rejoue l'archive dans une base
# temporaire, compte les documents, puis la supprime — sans jamais toucher à la
# production.
set -euo pipefail

# Git Bash (Windows) réécrit les arguments qui ressemblent à des chemins Unix :
# « /backups/x.gz » devient « C:/Program Files/Git/backups/x.gz » **à
# l'intérieur** de la commande docker, et l'archive s'écrit à côté. Sans effet
# sur un serveur Linux, où la variable est simplement ignorée.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  shift
fi

ARCHIVE="${1:-}"

if [[ -z "${ARCHIVE}" ]]; then
  echo "Usage : $0 [--dry-run] <archive>" >&2
  echo >&2
  echo "Archives disponibles :" >&2
  ls -1t backups/*.gz 2>/dev/null | head -10 >&2 || echo "  (aucune)" >&2
  exit 2
fi

if [[ ! -f "${ARCHIVE}" ]]; then
  echo "Erreur : ${ARCHIVE} introuvable." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a && source .env && set +a

: "${MONGO_ROOT_USER:?MONGO_ROOT_USER manquant}"
: "${MONGO_ROOT_PASSWORD:?MONGO_ROOT_PASSWORD manquant}"

DB_NAME="${MONGO_DB_NAME:-tourism}"
CONTAINER_ARCHIVE="/backups/$(basename "${ARCHIVE}")"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  TARGET="${DB_NAME}_verification_$(date +%s)"
  echo "Vérification dans une base jetable : ${TARGET}"
else
  TARGET="${DB_NAME}"

  # Confirmation explicite. `--drop` remplace les collections existantes :
  # restaurer par erreur une archive de la veille effacerait une journée de
  # réservations, et rien ne permettrait de revenir en arrière.
  echo
  echo "ATTENTION — restauration dans la base de PRODUCTION « ${DB_NAME} »."
  echo "Les collections présentes dans l'archive seront remplacées."
  echo
  read -r -p "Tapez le nom de la base pour confirmer : " CONFIRMATION
  if [[ "${CONFIRMATION}" != "${DB_NAME}" ]]; then
    echo "Annulé." >&2
    exit 1
  fi
fi

echo "[$(date -Iseconds)] Restauration de $(basename "${ARCHIVE}")…"

docker compose exec -T mongo mongorestore \
  --username="${MONGO_ROOT_USER}" \
  --password="${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase=admin \
  --archive="${CONTAINER_ARCHIVE}" \
  --gzip \
  --nsFrom="${DB_NAME}.*" \
  --nsTo="${TARGET}.*" \
  --drop \
  --quiet

# Comptage des documents restaurés. Un `mongorestore` peut réussir sans rien
# écrire — mauvais espace de noms, archive d'une autre base. Sans ce contrôle, la
# vérification confirmerait une sauvegarde inutilisable.
COUNTS="$(docker compose exec -T mongo mongosh \
  --quiet \
  --username="${MONGO_ROOT_USER}" \
  --password="${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase=admin \
  --eval "
    const db = db.getSiblingDB('${TARGET}');
    const names = db.getCollectionNames().sort();
    print(names.map((n) => n + '=' + db.getCollection(n).countDocuments()).join(' '));
  ")"

echo "[$(date -Iseconds)] Contenu : ${COUNTS}"

if [[ -z "${COUNTS// /}" ]]; then
  echo "Erreur : la restauration n'a produit aucune collection." >&2
  [[ "${DRY_RUN}" -eq 1 ]] && docker compose exec -T mongo mongosh --quiet \
    --username="${MONGO_ROOT_USER}" --password="${MONGO_ROOT_PASSWORD}" \
    --authenticationDatabase=admin --eval "db.getSiblingDB('${TARGET}').dropDatabase()" > /dev/null
  exit 1
fi

if [[ "${DRY_RUN}" -eq 1 ]]; then
  docker compose exec -T mongo mongosh --quiet \
    --username="${MONGO_ROOT_USER}" \
    --password="${MONGO_ROOT_PASSWORD}" \
    --authenticationDatabase=admin \
    --eval "db.getSiblingDB('${TARGET}').dropDatabase()" > /dev/null
  echo "[$(date -Iseconds)] Base de vérification supprimée. L'archive est exploitable."
else
  echo "[$(date -Iseconds)] Restauration terminée."
  echo "Redémarrez les applications : docker compose restart backend worker"
fi
