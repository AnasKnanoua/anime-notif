# ─────────────────────────────────────────────────────────────────────────────
# Anime Notif — commandes de gestion
# Usage : make <commande>. Liste : make help
# ─────────────────────────────────────────────────────────────────────────────

# Charge les variables du .env si présent
-include .env
export

COMPOSE := docker compose -f deploy/docker-compose.yml
COMPOSE_STAGING := docker compose -f deploy/docker-compose.staging.yml

.DEFAULT_GOAL := help
.PHONY: help up down restart logs ps deploy backup staging-up staging-down \
        staging-logs lint test format check health

help: ## Affiche cette aide
	@grep -h -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
# ── Production ───────────────────────────────────────────────────────────────

up: ## Lance la stack de production
	$(COMPOSE) up -d

down: ## Arrête la stack de production
	$(COMPOSE) down

restart: ## Redémarre la stack de production
	$(COMPOSE) restart

logs: ## Affiche les logs en continu (make logs SVC=web pour un service)
	$(COMPOSE) logs -f $(SVC)

ps: ## Affiche l'état des conteneurs
	$(COMPOSE) ps

health: ## Vérifie la santé du service web
	@curl -s localhost:3001/health | python3 -m json.tool

deploy: ## Déploie la dernière version avec rollback automatique
	./scripts/deploy.sh

# ── Staging (à la demande) ───────────────────────────────────────────────────

staging-up: ## Lance le staging
	$(COMPOSE_STAGING) up -d --build

staging-down: ## Arrête le staging
	$(COMPOSE_STAGING) down

staging-logs: ## Logs du staging
	$(COMPOSE_STAGING) logs -f

# ── Sauvegardes ──────────────────────────────────────────────────────────────

backup: ## Lance une sauvegarde chiffrée
	./scripts/backup.sh

# ── Développement (sur le Dell) ──────────────────────────────────────────────

lint: ## Lance ESLint
	npm run lint

test: ## Lance les tests
	npm test

format: ## Formate le code avec Prettier
	npm run format

check: lint format test ## Lance lint + format + tests (avant de commit)
	@echo "✅ Tous les checks passent"
