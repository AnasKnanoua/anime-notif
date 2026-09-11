# NoScrapeCycles — le worker tourne mais ne scrape plus

**Sévérité :** critical
**Alerte Prometheus :** `NoScrapeCycles`
**Impact utilisateur :** aucun nouvel épisode détecté depuis 45+ minutes, alors
que le worker semble vivant.

---

## Symptôme

Le conteneur worker est `Up (healthy)`, Prometheus le scrape correctement, mais
aucun cycle de scraping ne s'est terminé avec succès depuis plus de 45 minutes.
C'est plus subtil qu'un crash : le processus tourne mais est bloqué ou échoue en boucle.

## Diagnostic

```bash
ssh OracleVPS
cd ~/anime-notif/deploy
docker compose logs --tail 60 worker
```

Trois cas à distinguer :

**Cas 1 — voir-anime.to est indisponible.**
Logs remplis de `"page inaccessible"` ou `"scraping échoué"`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://voir-anime.to/
# 200 = site up (le problème est ailleurs)
# 5xx, 000, ou timeout = site down
```

Si le site est down : **rien à faire**, le worker réessaiera au prochain cycle.
L'alerte se résoudra seule quand le site reviendra.

**Cas 2 — le site a changé sa structure HTML.**
Logs `"aucun épisode trouvé sur la page"` sur des animes qui marchaient avant.

```bash
# Tester manuellement l'extraction sur un anime connu
curl -s "https://voir-anime.to/anime/mushoku-tensei-3/" | grep -o 'href="[^"]*vostfr[^"]*"' | head -3
```

Si aucun résultat, la regex dans `src/worker/scraper.js` ne correspond plus au
HTML du site → il faut adapter la regex (modification de code, PR, redéploiement).

**Cas 3 — le worker est bloqué (deadlock, cycle infini).**
Aucun log récent du tout, ou dernier `"cycle terminé"` très ancien.

## Résolution

| Cas                            | Action                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Site down (cas 1)              | Attendre. Aucune action.                                                                                                    |
| Structure HTML changée (cas 2) | Adapter la regex dans `scraper.js` sur le Dell → PR → merge → `git pull` + `docker compose up -d --build worker` sur le VPS |
| Worker bloqué (cas 3)          | `docker compose restart worker`                                                                                             |

## Vérification

```bash
docker compose restart worker
docker compose logs -f worker
# Attendre "cycle terminé" avec "checked" > 0 et pas que des warnings
```

## Prévention

Le guard `running` dans `index.js` empêche déjà les cycles concurrents.
Si le cas 3 se reproduit souvent, envisager d'ajouter un timeout global sur
un cycle complet (au-delà duquel le worker s'auto-termine et laisse
`restart: unless-stopped` le relancer proprement).
