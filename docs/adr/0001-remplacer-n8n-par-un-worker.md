# ADR 0001 — Remplacer n8n par un worker Node.js

**Statut :** accepté
**Date :** 2026-07

## Contexte

Le scraping d'épisodes vivait dans un workflow n8n (120 lignes de JS dans un
nœud Code). Cette logique n'était ni versionnable, ni testable, ni déployable
proprement — elle vivait dans une base SQLite.

## Décision

Extraire la logique dans un worker Node.js autonome, découpé en modules
(scraper, notifier, state, config), versionné dans Git.

## Conséquences

**Positif :**

- Code versionné, testable (16 tests unitaires), déployable via CI/CD
- Métriques Prometheus exposables
- Gestion fine des erreurs (rate limit Discord, écriture atomique)

**Négatif :**

- Plus de dépendance à n8n pour ce projet (mais n8n reste dispo pour d'autres usages)
- Il faut maintenir le code soi-même
