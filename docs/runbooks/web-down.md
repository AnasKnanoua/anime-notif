# WebDown — anime-web est indisponible

**Sévérité :** critical
**Alerte Prometheus :** `WebDown`
**Impact utilisateur :** l'interface web est inaccessible ; ton ami ne peut plus ajouter d'anime.

---

## Symptôme

Prometheus ne parvient plus à scraper `anime-web` depuis plus d'une minute.
Uptime Kuma signale le monitor `Anime Notif — Web` en `Down`.

## Diagnostic

Se connecter au VPS, puis dans l'ordre :

```bash
ssh OracleVPS
cd ~/anime-notif/deploy

# 1. État des conteneurs — le web est-il Up ? Exited ? Restarting ?
docker compose ps

# 2. Pourquoi il est tombé — lire les derniers logs
docker compose logs --tail 40 web
```

Chercher dans les logs :

| Message                                                     | Cause probable                             |
| ----------------------------------------------------------- | ------------------------------------------ |
| `FATAL: ANIME_WEB_PASSWORD_HASH manquant`                   | `.env` incomplet ou absent                 |
| `EACCES` / `permission denied`                              | Problème de permissions sur `/data`        |
| `OOMKilled` (dans `docker compose ps`, colonne STATUS)      | Limite mémoire dépassée                    |
| `Cannot find module`                                        | Dépendance manquante, image mal construite |
| Rien, conteneur `Up (healthy)` mais Prometheus le voit down | Problème réseau Docker interne             |

Si le conteneur est `Up` mais injoignable, tester depuis l'intérieur :

```bash
docker compose exec web curl -s localhost:3000/health
```

## Résolution

| Cause                                   | Action                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Conteneur crashé                        | `docker compose up -d web`                                                                                                  |
| `.env` manquant/incomplet               | Vérifier `.env` contre `.env.example`, puis `docker compose up -d web`                                                      |
| `subscriptions.json` corrompu ou absent | `cp ../subscriptions.example.json ../data/subscriptions.json` puis corriger les permissions (voir ci-dessous) et redémarrer |
| Mauvaises permissions sur `/data`       | `sudo chown -R 1000:1001 ../data && sudo chmod -R g+rw ../data`                                                             |
| OOMKilled                               | Augmenter `deploy.resources.limits.memory` dans le compose, rebuild                                                         |
| Image cassée                            | `docker compose up -d --build web`                                                                                          |
| Docker lui-même arrêté                  | `sudo systemctl status docker` puis `sudo systemctl start docker`                                                           |

## Vérification

```bash
docker compose ps                    # STATUS = Up (healthy)
curl -s localhost:3001/health | python3 -m json.tool   # status = healthy
curl -s https://anime-notif.duckdns.org/health         # la chaîne complète répond
```

Attendre ~2 minutes que l'alerte Prometheus repasse en `resolved` et vérifier
la notification Discord de résolution.

## Escalade

Si le problème persiste après 15 minutes, vérifier l'infrastructure sous-jacente :

```bash
df -h /                              # disque plein ?
free -h                              # mémoire saturée ?
sudo systemctl status docker         # démon Docker actif ?
docker system df                     # Docker consomme trop ?
```

Si le disque est plein : `docker system prune -a` (attention, supprime les images non utilisées).
