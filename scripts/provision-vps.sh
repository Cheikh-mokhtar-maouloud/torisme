#!/usr/bin/env bash
#
# Préparation d'un serveur Ubuntu 24.04 pour la plateforme.
#
# À exécuter **une seule fois**, en root, sur un serveur neuf :
#   curl -fsSL https://…/provision-vps.sh | bash -s -- admin@exemple.mr
#
# ─────────────────────────────────────────────────────────────────────────────
# NON VÉRIFIÉ. Contrairement au reste de la Phase 15, ce script n'a pas pu être
# exécuté : il modifie le pare-feu et la configuration SSH d'une vraie machine.
# Relisez-le avant de le lancer, et gardez une session SSH **ouverte** pendant
# son exécution — si la nouvelle configuration vous verrouille dehors, seule une
# session déjà établie permettra de revenir en arrière.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ADMIN_EMAIL="${1:-}"
APP_DIR="/opt/tourism"
APP_USER="tourism"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ce script doit être exécuté en root." >&2
  exit 1
fi

if [[ -z "${ADMIN_EMAIL}" ]]; then
  echo "Usage : $0 <email-administrateur>" >&2
  echo "L'adresse sert aux avis d'expiration de certificat Let's Encrypt." >&2
  exit 2
fi

echo "== Mise à jour du système =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

echo "== Paquets de base =="
apt-get install -y -qq ca-certificates curl gnupg ufw fail2ban unattended-upgrades

echo "== Mises à jour de sécurité automatiques =="
# Un serveur qu'on oublie de mettre à jour est la cause la plus banale de
# compromission. Seul le dépôt de sécurité est automatisé : appliquer aussi les
# mises à jour ordinaires ferait redémarrer des services sans surveillance.
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
  "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::Automatic-Reboot "false";
EOF
systemctl enable --now unattended-upgrades

echo "== Docker =="
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "== Rotation des journaux Docker =="
# Sans plafond, les journaux JSON d'un conteneur bavard remplissent le disque et
# emportent tout le serveur avec eux. C'est une panne fréquente et parfaitement
# évitable.
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
EOF
systemctl restart docker

echo "== Utilisateur applicatif =="
# La pile ne tourne pas en root. Le groupe `docker` équivaut certes à un accès
# root sur la machine, mais l'utilisateur dédié limite la casse de tout ce qui
# ne passe pas par Docker, et rend les journaux d'audit lisibles.
id -u "${APP_USER}" &>/dev/null || useradd -m -s /bin/bash "${APP_USER}"
usermod -aG docker "${APP_USER}"
mkdir -p "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

echo "== Pare-feu =="
# Politique par défaut : tout refuser en entrée. Autoriser d'abord SSH, ensuite
# seulement activer — l'ordre inverse coupe la session en cours.
ufw --force reset > /dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (redirection et ACME)'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# Ni 27017 ni 6379 ne sont ouverts, et ce n'est pas un oubli : MongoDB et Redis
# ne publient aucun port, ils ne sont joignables que par le réseau Docker.
#
# Attention : Docker écrit ses propres règles dans iptables et **contourne ufw**
# pour les ports publiés. Ici seul Nginx publie 80 et 443, donc l'exposition
# reste celle qu'on attend. Publier un port « pour déboguer » l'ouvrirait à
# Internet sans que ufw n'y change rien.

echo "== fail2ban =="
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 3600
findtime = 600
EOF
systemctl enable --now fail2ban

echo "== Durcissement SSH =="
# Authentification par clé uniquement. À ne faire qu'une fois une clé installée
# et testée : sans clé fonctionnelle, cette ligne vous verrouille dehors
# définitivement.
if [[ -s "/home/${APP_USER}/.ssh/authorized_keys" ]] || [[ -s /root/.ssh/authorized_keys ]]; then
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  systemctl reload ssh
  echo "   Authentification par mot de passe désactivée."
else
  echo "   AUCUNE clé SSH trouvée : l'authentification par mot de passe reste active."
  echo "   Installez une clé, testez-la, puis désactivez le mot de passe à la main."
fi

echo
echo "== Terminé =="
cat <<EOF

Étapes suivantes, à faire à la main :

  1. Déposer le dépôt dans ${APP_DIR} et renseigner ${APP_DIR}/.env
     (voir .env.example ; générer chaque secret séparément).

  2. Faire pointer les enregistrements DNS A vers ce serveur, pour les trois
     sous-domaines : api, admin, ws.

  3. Obtenir les certificats. Nginx doit déjà écouter sur le port 80 pour que
     le défi ACME aboutisse :

       docker compose up -d nginx
       docker run --rm \\
         -v ${APP_DIR}/docker/nginx/certs:/etc/letsencrypt \\
         -v certbot-www:/var/www/certbot \\
         certbot/certbot certonly --webroot -w /var/www/certbot \\
         --email ${ADMIN_EMAIL} --agree-tos --no-eff-email \\
         -d api.exemple.mr -d admin.exemple.mr -d ws.exemple.mr

  4. Démarrer la pile :  docker compose up -d --build

  5. Créer le premier administrateur :
       docker compose exec backend node backend/dist-ops/create-admin.js

  6. Vérifier :  npm run verify:deployment https://api… https://admin…

  7. Planifier sauvegarde et renouvellement :
       0 3 * * * cd ${APP_DIR} && ./scripts/backup.sh >> /var/log/tourism-backup.log 2>&1
       0 4 * * 1 cd ${APP_DIR} && docker compose run --rm certbot renew --quiet && docker compose exec nginx nginx -s reload

  Le renouvellement est hebdomadaire alors que les certificats durent trois
  mois : Let's Encrypt ne renouvelle qu'à trente jours de l'échéance, et cette
  marge laisse plusieurs tentatives avant l'expiration.

EOF
