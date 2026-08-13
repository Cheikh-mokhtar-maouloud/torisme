# Réglages TLS, communs à tous les hôtes virtuels.
#
# Regroupés dans un fichier inclus plutôt que recopiés : trois copies finissent
# par diverger, et c'est l'hôte oublié qui garde le protocole obsolète.

# TLS 1.2 minimum. TLS 1.0 et 1.1 sont dépréciés depuis 2021 ; les accepter pour
# d'anciens clients rouvrirait des faiblesses connues du protocole lui-même.
ssl_protocols TLSv1.2 TLSv1.3;

# L'ordre du serveur ne prime plus : en TLS 1.3 la négociation a changé, et
# laisser le client choisir parmi une liste déjà sûre évite de le forcer vers un
# algorithme plus lent sur son matériel.
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;

# Reprise de session : évite une poignée de main complète à chaque connexion.
# Sur un réseau mobile mauritanien, où la latence domine, c'est la différence la
# plus perceptible pour l'utilisateur.
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;

# Désactivé : les tickets partagent une clé de chiffrement à long terme, ce qui
# affaiblit la confidentialité persistante — une clé compromise permettrait de
# déchiffrer les sessions passées.
ssl_session_tickets off;

# Agrafage OCSP : c'est le serveur qui présente la preuve de non-révocation, au
# lieu de laisser chaque client interroger l'autorité de certification. Une
# requête de moins, et le navigateur cesse de divulguer à l'AC les sites visités.
ssl_stapling on;
ssl_stapling_verify on;

# Pas de directive `resolver` ici, volontairement.
#
# Ce fichier est inclus dans des blocs `server` ; un résolveur déclaré à ce
# niveau prendrait le pas sur celui du bloc `http` pour tout ce que contient
# l'hôte virtuel — y compris la résolution des upstreams. Un DNS public ne
# connaît pas « backend » : le service tomberait en 502 permanent, sans que rien
# dans le bloc concerné ne l'explique.
