module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Types autorisés — cohérents avec le versioning sémantique
    'type-enum': [
      2,
      'always',
      [
        'feat',     // Nouvelle fonctionnalité (ex: feat: ajout notification anime)
        'fix',      // Correction de bug (ex: fix: crash du serveur websocket)
        'docs',     // Documentation (ex: docs: mise à jour du readme)
        'chore',    // Maintenance, scripts, tooling (ex: chore: config pre-commit)
        'refactor', // Modification sans impact fonctionnel
        'test',     // Ajout/modif de tests
        'ci',       // Modification des pipelines CI/CD
        'perf',     // Amélioration de performance
        'build',    // Dépendances, paquets npm
      ],
    ],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case']],
    'header-max-length': [2, 'always', 100],
  },
};
