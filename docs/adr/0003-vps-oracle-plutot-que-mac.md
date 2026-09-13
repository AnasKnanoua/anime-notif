# ADR 0003 — VPS Oracle Cloud plutôt qu'un Mac auto-hébergé

**Statut :** accepté
**Date :** 2026-09

## Contexte

Le service tournait initialement sur un Mac personnel (Colima, Tailscale,
launchd). Ce Mac devait être cédé, et un Mac de bureau n'est pas un serveur
fiable (sommeil, redémarrages, pas d'IP publique).

## Décision

Migrer vers un VPS Oracle Cloud Free Tier (ARM, always free).

## Conséquences

**Positif :**

- Disponibilité 24/7, datacenter avec redondance
- IP publique fixe, plus besoin de Tailscale/tunnel temporaire
- Docker natif Linux (plus de Colima)
- Gratuit à vie

**Négatif :**

- Oracle peut reclaim les instances free tier inactives (mitigé par un cron keepalive)
- Architecture ARM (compatibilité à vérifier, OK pour ce projet)
