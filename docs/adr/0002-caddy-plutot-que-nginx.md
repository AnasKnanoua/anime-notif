# ADR 0002 — Caddy plutôt que Nginx pour le reverse proxy

**Statut :** accepté
**Date :** 2026-09

## Contexte

Il faut un reverse proxy avec HTTPS pour exposer l'interface web. Nginx est le
standard historique, mais nécessite de configurer Let's Encrypt manuellement
(certbot, renouvellement).

## Décision

Utiliser Caddy, qui gère le certificat TLS automatiquement (obtention et
renouvellement) sans configuration.

## Conséquences

**Positif :**

- HTTPS automatique, zéro configuration TLS
- Configuration minimale (3 lignes de Caddyfile)

**Négatif :**

- Moins de contrôle fin que Nginx sur des cas complexes
- Écosystème plus petit que Nginx

## Alternatives considérées

- Nginx + certbot : plus de contrôle mais configuration TLS manuelle
- Cloudflare Tunnel : envisagé, sera adopté quand un domaine dédié sera disponible
