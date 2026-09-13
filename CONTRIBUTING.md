# Contribuer à Anime Notif

## Workflow

1. Créer une branche depuis `main` : `git checkout -b feat/ma-fonctionnalite`
2. Développer, en respectant les Conventional Commits
3. Vérifier avant de committer : `make check`
4. Pousser et ouvrir une Pull Request
5. La CI doit être verte pour merger

## Conventions de commit

Format : `type: description`

Types : `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`

Exemples :

- `feat: ajout du support des animes VF`
- `fix: correction du rate limit Discord`

## Standards de code

- ESLint et Prettier (lancés par pre-commit et la CI)
- Tests pour toute nouvelle logique métier
- Pas de secret dans le code (gitleaks vérifie)
