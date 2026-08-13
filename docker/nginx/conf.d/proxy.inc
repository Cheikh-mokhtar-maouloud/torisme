# En-têtes transmis aux services applicatifs.

proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;

# `X-Forwarded-For` est **réécrit**, pas complété.
#
# `$proxy_add_x_forwarded_for` conserverait la valeur envoyée par le client et y
# ajouterait la sienne. Or l'application ne lit que le premier élément pour
# identifier l'appelant : un client pourrait alors forger cet en-tête et changer
# d'identité à chaque requête, ce qui annulerait la limitation de débit.
# Nginx étant ici la bordure, sa vision de l'adresse fait autorité.
proxy_set_header X-Forwarded-For   $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;

proxy_connect_timeout 5s;

# Les délais de lecture et d'écriture sont fixés **par hôte virtuel**, pas ici.
# Une connexion Socket.IO reste ouverte sans échanger pendant de longues
# périodes, là où une requête API doit renoncer vite ; les déclarer dans ce
# fichier commun les rendrait en double dans le bloc temps réel — et Nginx
# refuse de démarrer sur une directive dupliquée.

# Réponse renvoyée au fil de sa production, sans être accumulée sur disque.
proxy_buffering off;
proxy_request_buffering off;
