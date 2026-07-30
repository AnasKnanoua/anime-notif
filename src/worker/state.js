// src/worker/state.js
// ─────────────────────────────────────────────────────────────────────────────
// Lecture et écriture de subscriptions.json.
//
// L'écriture est ATOMIQUE : on écrit d'abord dans un fichier temporaire,
// puis on le renomme. rename() est une opération atomique sur un même
// filesystem. Si le processus crashe pendant l'écriture, le fichier
// original reste intact — sans ça, un crash te laisserait un JSON
// vide ou tronqué = tous tes abonnements perdus.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');

/**
 * Lit et parse le fichier d'abonnements.
 * @param {string} filePath — chemin absolu
 * @returns {Array} — tableau d'objets { anime_name, anime_url, discord_webhook, last_episode }
 */
function readSubscriptions(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Écrit le fichier d'abonnements de manière atomique.
 * @param {string} filePath — chemin absolu
 * @param {Array} data — le tableau mis à jour
 */
function writeSubscriptions(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

module.exports = { readSubscriptions, writeSubscriptions };
