import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Règles recommandées par ESLint (détecte les vrais bugs)
  js.configs.recommended,

  // Désactive les règles de style gérées par Prettier
  prettier,

  {
    // S'applique à tout le JS du projet
    files: ['src/**/*.js', 'tests/**/*.js'],

    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,    // process, require, __dirname, etc.
      },
    },

    rules: {
      // --- Bugs silencieux que JS laisse passer ---
      'eqeqeq': 'error',              // interdit == et != (utilise === et !==)
                                        // "0" == 0 est true en JS — source de bugs vicieux
      'no-var': 'error',               // interdit var (utilise const ou let)
                                        // var a un scoping bizarre qui cause des bugs
      'prefer-const': 'error',         // si une variable n'est jamais réassignée, const
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',       // _err, _req = volontairement ignoré
      }],

      // --- Clarté ---
      'no-console': 'off',            // on logue en JSON structuré, c'est voulu
      'curly': ['error', 'multi-line'], // accolades obligatoires sur les blocs multi-lignes
                                        // évite le bug du "else" qui ne s'applique pas où tu crois
    },
  },

  // Ignorer les dossiers non pertinents
  { ignores: ['node_modules/', 'data/', 'coverage/'] },
];
