# Anime Notif

![CI](https://github.com/AnasKnanoua/anime-notif/actions/workflows/ci.yml/badge.svg)

> Notifications Discord automatiques à la sortie d'un nouvel épisode d'anime.

Anime Notif surveille les pages d'animes de [voir-anime.to](https://voir-anime.to)
et envoie un message Discord dès qu'un nouvel épisode VOSTFR est publié. Une
interface web protégée par mot de passe permet de gérer la liste des animes
suivis sans toucher au serveur.

## Sommaire

- [Architecture](#architecture)
- [Stack technique](#stack-technique)
- [Démarrage rapide](#démarrage-rapide)
- [Configuration](#configuration)
- [Développement](#développement)
- [Déploiement](#déploiement)
- [Staging](#staging)
- [Exploitation](#exploitation)
- [Observabilité](#observabilité)

## Architecture

```mermaid
graph LR
    U([Utilisateur]) -->|HTTPS| DNS[DuckDNS]
    DNS --> CADDY[Caddy<br/>reverse proxy + TLS]
    CADDY --> WEB[web<br/>Express]
    WEB -->|lit / écrit| SUBS[(subscriptions.json)]

    WORKER[worker<br/>scraper cron 30 min] -->|lit / écrit| SUBS
    WORKER -->|scrape| VA[voir-anime.to]
    WORKER -->|notifie| DC([Discord])

    subgraph VPS Oracle · Docker
        CADDY
        WEB
        SUBS
        WORKER
        MON[monitoring<br/>Prometheus · Grafana · Loki]
    end

    WEB -.métriques.-> MON
    WORKER -.métriques.-> MON
    UK[Uptime Kuma] -->|/health| WEB
    UK -->|alertes| DC
```

**Deux services applicatifs indépendants** communiquant via `subscriptions.json` :

| Service  | Rôle                                                  | Port interne     |
| -------- | ----------------------------------------------------- | ---------------- |
| `web`    | API Express + interface de gestion des abonnements    | 3000             |
| `worker` | Scraper d'épisodes et envoi des notifications Discord | 9091 (métriques) |

**Infrastructure** :

| Service             | Rôle                                             |
| ------------------- | ------------------------------------------------ |
| `caddy`             | Reverse proxy, HTTPS automatique (Let's Encrypt) |
| `cloudflared`       | _(optionnel)_ tunnel Cloudflare si domaine dédié |
| `uptime-kuma`       | Surveillance externe + alertes Discord           |
| `autoheal`          | Redémarre les conteneurs déclarés `unhealthy`    |
| `prometheus`        | Collecte des métriques                           |
| `grafana`           | Dashboards                                       |
| `loki` + `promtail` | Centralisation des logs                          |
| `alertmanager`      | Routage des alertes Prometheus vers Discord      |

**État applicatif** — `subscriptions.json` est l'unique source de vérité : liste
des animes suivis, webhook de destination et dernier épisode connu. Il est monté
en volume et n'est jamais versionné.

## Stack technique

- **Runtime** : Node.js 22 (Express pour le web, module `http` natif pour le worker)
- **Conteneurisation** : Docker + Docker Compose
- **Reverse proxy** : Caddy (HTTPS auto via DuckDNS)
- **Observabilité** : Prometheus, Grafana, Loki, Alertmanager, Uptime Kuma
- **CI/CD** : GitHub Actions (lint, tests, scan Trivy, build GHCR, test d'intégration)
- **Qualité** : ESLint, Prettier, Vitest, pre-commit (gitleaks, hadolint, commitlint)
- **Hébergement** : VPS Oracle Cloud (ARM, Ubuntu/Oracle Linux)

## Démarrage rapide

### Prérequis

- Docker et Docker Compose
- Un webhook Discord ([comment en créer un](https://support.discord.com/hc/fr/articles/228383668))

### Installation

```bash
git clone git@github.com:AnasKnanoua/anime-notif.git
cd anime-notif

cp .env.example .env                                   # puis renseigner les valeurs
mkdir -p data
cp subscriptions.example.json data/subscriptions.json  # état initial

cd deploy
docker compose up -d
```

L'interface est disponible en local sur `http://localhost:3001` (le port hôte
mappé vers le port interne 3000).

## Configuration

Toute la configuration passe par des variables d'environnement, décrites dans
[`.env.example`](.env.example). Le fichier `.env` contient des secrets et
**n'est jamais versionné**.

| Fichier                           | Contenu                                            | Versionné |
| --------------------------------- | -------------------------------------------------- | --------- |
| `.env`                            | Secrets et configuration de production             | ❌        |
| `.env.staging`                    | Configuration de staging (webhook Discord de test) | ❌        |
| `.env.example`                    | Documentation des variables, sans valeurs          | ✅        |
| `data/subscriptions.json`         | État de production                                 | ❌        |
| `data-staging/subscriptions.json` | État de staging                                    | ❌        |
| `subscriptions.example.json`      | Format attendu                                     | ✅        |

Générer le hash du mot de passe de l'interface web :

```bash
docker run --rm node:22-alpine sh -c \
  "npm i -g bcryptjs >/dev/null 2>&1 && bcryptjs 'TonMotDePasse'"
```

Placer le résultat dans `ANIME_WEB_PASSWORD_HASH` du `.env`.

### Permissions du dossier data

Le conteneur tourne avec l'utilisateur `node` (UID 1000) et l'utilisateur du VPS
est souvent UID 1001. Pour que les deux puissent écrire :

```bash
sudo chown -R 1000:1001 data/
sudo chmod -R g+rw data/
```

## Développement

Le code s'écrit sur la machine de développement, jamais directement sur le VPS.

```bash
npm install          # installe les dépendances
npm run lint         # ESLint
npm run format       # Prettier (écrit les corrections)
npm run format:check # Prettier (vérifie sans écrire)
npm test             # Vitest
npm run test:coverage
```

Les hooks pre-commit vérifient automatiquement secrets, lint, format et messages
de commit avant chaque commit :

```bash
pip install pre-commit
pre-commit install
pre-commit install --hook-type commit-msg
```

Workflow : brancher, coder, commiter (Conventional Commits), pousser, ouvrir une
PR. La CI GitHub vérifie tout avant que le merge soit possible.

## Déploiement

Sur le VPS, le déploiement se fait via un script qui vérifie la santé du service
après déploiement et revient automatiquement en arrière en cas d'échec :

```bash
cd ~/anime-notif
./scripts/deploy.sh
```

Rollback manuel vers un commit précédent si nécessaire :

```bash
git checkout <hash-du-commit>
cd deploy && docker compose up -d --build
```

## Staging

Un environnement de staging léger (web + worker uniquement) permet de tester une
modification avant la production. Il est lancé **à la demande** pour économiser
les ressources, pas en continu.

```bash
cd ~/anime-notif/deploy

# Lancer
docker compose -f docker-compose.staging.yml up -d --build

# Tester (via tunnel SSH → http://localhost:4001)
curl -s localhost:4001/health | python3 -m json.tool

# Arrêter une fois validé
docker compose -f docker-compose.staging.yml down
```

Le staging utilise `.env.staging` (avec un webhook Discord de test pour ne pas
polluer le vrai salon) et `data-staging/` comme état séparé.

## Exploitation

```bash
cd deploy
docker compose ps                     # état des services
docker compose logs -f web            # logs d'un service en continu
docker compose logs --tail 30 worker  # derniers logs
docker compose restart web            # redémarrage
```

Diagnostic rapide en cas de problème :

```bash
docker compose ps                     # qu'est-ce qui tourne ?
docker compose logs --tail 50 <svc>   # pourquoi c'est tombé ?
df -h / && free -h && uptime          # la machine va-t-elle bien ?
```

Les procédures détaillées de résolution d'incident sont dans
[`docs/runbooks/`](docs/runbooks/).

## Observabilité

Les interfaces de monitoring ne sont pas exposées à Internet. Y accéder via
tunnel SSH depuis la machine de développement :

```bash
ssh -L 3003:localhost:3003 -L 9090:localhost:9090 anas@<IP_VPS>
```

- Grafana : `http://localhost:3003` (dashboards, 4 signaux dorés, error budgets)
- Prometheus : `http://localhost:9090` (métriques brutes, cibles, règles d'alerte)
- Uptime Kuma : `http://localhost:3002` (surveillance externe)

## Documentation

- [Architecture Decision Records](docs/adr/) — les décisions techniques et leur justification
- [Runbooks](docs/runbooks/) — procédures de résolution d'incidents
- [Disaster Recovery](docs/runbooks/disaster-recovery.md) — reconstruction depuis zéro

## Licence

Usage personnel.
