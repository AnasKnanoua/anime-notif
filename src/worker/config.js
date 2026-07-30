// src/worker/config.js
// ─────────────────────────────────────────────────────────────────────────────
// Charge et valide la configuration au démarrage.
// Si une variable obligatoire manque, le processus s'arrête immédiatement
// plutôt que de tourner dans un état bancal (principe "fail-fast").
// ─────────────────────────────────────────────────────────────────────────────

const required = ['DEFAULT_DISCORD_WEBHOOK'];
const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error(JSON.stringify({
    level: 'fatal',
    msg: 'Variables d\'environnement manquantes — voir .env.example',
    missing,
  }));
  process.exit(1);
}

module.exports = {
  // Chemin vers le fichier d'état, vu depuis l'intérieur du conteneur.
  // Le dossier data/ de l'hôte est monté en volume sur /data.
  subscriptionsPath: process.env.SUBSCRIPTIONS_PATH || '/data/subscriptions.json',

  // Webhook par défaut — utilisé aussi pour les alertes système (étape 3).
  defaultWebhook: process.env.DEFAULT_DISCORD_WEBHOOK,

  // Fréquence de scraping en minutes. 30 min = le même rythme que ton workflow n8n.
  intervalMinutes: parseInt(process.env.SCRAPE_INTERVAL_MINUTES || '30', 10),

  // Identifie poliment ton scraper auprès du site cible.
  // Un User-Agent réaliste évite les blocages par détection de bots simples.
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
           + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',

  // URL de push Uptime Kuma — optionnelle, le worker fonctionne sans.
  uptimeKumaPushUrl: process.env.UPTIME_KUMA_PUSH_URL || null,
};
