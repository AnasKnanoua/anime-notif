# Postmortem — [Titre court de l'incident]

> Un postmortem est **blameless** : on ne cherche pas un coupable, on cherche
> le garde-fou manquant. Un humain qui se trompe révèle un système qui
> permettait l'erreur. Rempli après tout incident sérieux (SLO violé, ou
> indisponibilité de plus de 30 minutes).

**Date :** AAAA-MM-JJ
**Durée de l'incident :** XX minutes
**Sévérité :** critical / warning
**SLO impacté :** disponibilité web (99,5%) / fiabilité scraping (99%)
**Error budget consommé :** XX %
**Rédigé par :** Anas

---

## Résumé

_2-3 phrases : qu'est-ce qui s'est passé, quel a été l'impact concret pour
l'utilisateur, comment ça a été résolu._

## Chronologie

_Heure locale (Europe/Paris). Reconstituer depuis les logs, Discord, Grafana._

| Heure | Événement                                        |
| ----- | ------------------------------------------------ |
| HH:MM | Alerte `X` déclenchée / premier symptôme observé |
| HH:MM | Début du diagnostic                              |
| HH:MM | Cause racine identifiée                          |
| HH:MM | Correctif appliqué                               |
| HH:MM | Service restauré                                 |
| HH:MM | Alerte `resolved`                                |

## Cause racine

_Remonter jusqu'à la cause systémique, pas l'action humaine._
_Mauvais : « j'ai supprimé le mauvais fichier »._
_Bon : « rien n'empêchait la suppression du fichier d'état, et il n'existait
pas de sauvegarde pour le restaurer »._

## Impact

- Utilisateurs affectés : _(toi seul ? ton ami aussi ? le scraping ?)_
- Durée d'indisponibilité réelle :
- Épisodes potentiellement manqués :
- Données perdues : _(oui/non — quoi)_

## Ce qui a bien fonctionné

- _Ex : l'alerte Discord est arrivée en moins de 2 minutes._
- _Ex : le runbook couvrait exactement ce scénario._

## Ce qui a mal fonctionné

- _Ex : le runbook ne mentionnait pas la commande de correction des permissions._
- _Ex : l'alerte s'est déclenchée mais le message n'indiquait pas la cause._

## Actions correctives

_Chaque action doit être concrète, assignée, datée. Créer une issue GitHub pour chacune._

| Action                                                                   | Échéance | Issue |
| ------------------------------------------------------------------------ | -------- | ----- |
| _Ex : ajouter une sauvegarde automatique de subscriptions.json_          | J+7      | #XX   |
| _Ex : mettre à jour le runbook web-down avec la commande de permissions_ | J+1      | #XX   |
| _Ex : ajouter une alerte plus précoce sur ce symptôme_                   | J+3      | #XX   |

## Leçons apprises

_Ce que cet incident t'a appris de nouveau sur ton système et comment il
change ta façon de le concevoir._
