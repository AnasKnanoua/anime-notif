# Disaster Recovery — reconstruire depuis zéro

## Scénario

Le VPS est perdu (reclaim Oracle, corruption, suppression accidentelle).

## Ce qui est sauvegardé où

| Élément                          | Emplacement                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| Code                             | GitHub (repo anime-notif)                                                             |
| Secrets                          | .env.enc.env dans le repo (chiffré SOPS) + clé age dans gestionnaire de mots de passe |
| État (subscriptions, Grafana...) | ~/backups/*.tar.gz.age (chiffré) sur le Dell                                          |

## Procédure de reconstruction

1. Créer un nouveau VPS (Oracle ou DigitalOcean)
2. Le configurer avec Ansible :
   `ansible-playbook -i <nouvelle-ip>, infra/ansible/setup.yml --ask-become-pass`
3. Cloner le repo : `git clone git@github.com:AnasKnanoua/anime-notif.git`
4. Déchiffrer les secrets : `sops --decrypt .env.enc.env > .env`
5. Restaurer l'état : `./scripts/restore.sh <dernier-backup>`
6. Lancer la stack : `cd deploy && docker compose up -d`
7. Vérifier : `curl localhost:3001/health`

## Temps estimé de reconstruction

~30 minutes avec Ansible + les backups.
