#!/usr/bin/env bash
#
# Sauvegarde de la base MongoDB.
#
# Usage :
#   ./scripts/backup.sh
#
# À placer en tâche planifiée sur le serveur :
#   0 3 * * * cd /opt/tourism && ./scripts/backup.sh >> /var/log/tourism-backup.log 2>&1
#
# `set -euo pipefail` n'est pas décoratif : sans `-e`, un `mongodump` en échec
# laisserait le script continuer, supprimer les anciennes archives selon la
# politique de rétention, et signaler un succès. On perdrait alors les
# sauvegardes valides pour en garder une vide.
set -euo pipefail

# Git Bash (Windows) réécrit les arguments qui ressemblent à des chemins Unix :
# « /backups/x.gz » devient « C:/Program Files/Git/backups/x.gz » **à
# l'intérieur** de la commande docker, et l'archive s'écrit à côté. Sans effet
# sur un serveur Linux, où la variable est simplement ignorée.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Erreur : .env introuvable. Copiez .env.example et renseignez-le." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a && source .env && set +a

: "${MONGO_ROOT_USER:?MONGO_ROOT_USER manquant}"
: "${MONGO_ROOT_PASSWORD:?MONGO_ROOT_PASSWORD manquant}"

DB_NAME="${MONGO_DB_NAME:-tourism}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
ARCHIVE="/backups/${DB_NAME}-${STAMP}.gz"

echo "[$(date -Iseconds)] Sauvegarde de « ${DB_NAME} »…"

# `--archive` avec `--gzip` produit un fichier unique compressé plutôt qu'une
# arborescence. C'est ce format que `mongorestore` relit tel quel, sans étape de
# décompression intermédiaire qui pourrait échouer faute d'espace disque.
docker compose exec -T mongo mongodump \
  --username="${MONGO_ROOT_USER}" \
  --password="${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase=admin \
  --db="${DB_NAME}" \
  --archive="${ARCHIVE}" \
  --gzip \
  --quiet

LOCAL_ARCHIVE="backups/${DB_NAME}-${STAMP}.gz"

# Contrôle de taille. Un `mongodump` peut renvoyer 0 tout en produisant une
# archive vide — base inexistante, nom mal orthographié. Une sauvegarde vide qui
# se déclare réussie est pire que pas de sauvegarde : on ne découvre son
# inutilité qu'au moment de restaurer.
if [[ ! -s "${LOCAL_ARCHIVE}" ]]; then
  echo "Erreur : l'archive est vide ou absente (${LOCAL_ARCHIVE})." >&2
  exit 1
fi

SIZE="$(du -h "${LOCAL_ARCHIVE}" | cut -f1)"
echo "[$(date -Iseconds)] Archive écrite : ${LOCAL_ARCHIVE} (${SIZE})"

# Rétention. Appliquée **après** le contrôle de taille : supprimer les anciennes
# avant de s'être assuré que la nouvelle est valide reviendrait à détruire les
# seules sauvegardes utilisables.
DELETED="$(find backups -name "${DB_NAME}-*.gz" -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)"
if [[ "${DELETED}" -gt 0 ]]; then
  echo "[$(date -Iseconds)] ${DELETED} archive(s) de plus de ${RETENTION_DAYS} jours supprimée(s)."
fi

echo "[$(date -Iseconds)] Terminé."
echo
echo "Rappel : une sauvegarde qui n'a jamais été restaurée n'est pas une"
echo "sauvegarde. Vérifiez-la avec ./scripts/restore.sh --dry-run"
