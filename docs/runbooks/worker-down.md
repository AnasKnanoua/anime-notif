# WorkerDown — le worker de scraping est indisponible

**Sévérité :** critical
**Alerte Prometheus :** `WorkerDown`
**Impact utilisateur :** aucun nouvel épisode n'est détecté ni notifié. Le site web
reste fonctionnel (les deux services sont indépendants).

---

## Symptôme

Prometheus ne parvient plus à scraper `worker:9091/metrics` depuis plus de 2 minutes.
Le monitor push `Anime Notif — Worker` dans Uptime Kuma ne reçoit plus de heartbeat.

## Diagnostic

```bash
ssh OracleVPS
cd ~/anime-notif/deploy

docker compose ps worker
docker compose logs --tail 40 worker
```

Chercher dans les logs :

| Message                                       | Cause probable                                      |
| --------------------------------------------- | --------------------------------------------------- |
| `FATAL: Variables d'environnement manquantes` | `.env` incomplet (`DEFAULT_DISCORD_WEBHOOK` absent) |
| `impossible de lire subscriptions.json`       | Fichier absent, corrompu, ou permissions            |
| `OOMKilled`                                   | Limite mémoire dépassée                             |
| Dernier log ancien de plus de 30 min          | Worker bloqué (voir runbook `no-scrape-cycles.md`)  |

## Résolution

| Cause                          | Action                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| Conteneur crashé               | `docker compose up -d worker`                                                          |
| `.env` incomplet               | Corriger `.env`, puis `docker compose up -d worker`                                    |
| `subscriptions.json` illisible | Corriger permissions : `sudo chown -R 1000:1001 ../data && sudo chmod -R g+rw ../data` |
| Image cassée                   | `docker compose up -d --build worker`                                                  |

## Vérification

```bash
docker compose ps worker             # STATUS = Up (healthy)

# Le worker relance un cycle immédiatement au démarrage — le suivre
docker compose logs -f worker
# Attendre la ligne "cycle terminé"

# Vérifier que les métriques sont exposées
docker compose exec worker sh -c 'wget -qO- http://localhost:9091/metrics 2>&1 | head -5' || \
  echo "wget absent, ignorer ce test"
```

Attendre ~2 minutes que l'alerte repasse en `resolved`.

## Note

Le worker est conçu pour ne jamais crasher sur une erreur de scraping isolée
(site down, HTML changé) : il logue un `warn` et passe à l'anime suivant.
Un `WorkerDown` signifie donc un vrai problème du processus lui-même, pas une
simple erreur de scraping. Pour « le worker tourne mais ne scrape plus »,
voir `no-scrape-cycles.md`.
