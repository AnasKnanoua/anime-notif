const express = require('express');
const fs = require('fs');
const bcrypt = require('bcryptjs'); // ◄ Ajout de bcrypt pour la sécurité
const app = express();
const packageJson = require('../../package.json');

app.use(express.json());
app.use(express.static('public'));

const SUBS_PATH = process.env.SUBSCRIPTIONS_PATH;

// 🔒 Sécurisation des secrets via l'environnement
const PASSWORD_HASH = process.env.ANIME_WEB_PASSWORD_HASH;
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL; // ◄ Le webhook est maintenant caché ici
const PORT = process.env.PORT || 3000;

// Vérification de sécurité au démarrage du serveur
if (!PASSWORD_HASH || !DISCORD_WEBHOOK) {
  console.error("❌ FATAL : Variables d'environnement manquantes ! Vérifie ANIME_WEB_PASSWORD_HASH et DISCORD_WEBHOOK_URL.");
  process.exit(1);
}

// 🛡️ Middleware de mot de passe sécurisé (Anti-Timing Attack + Bcrypt)
app.use('/api', (req, res, next) => {
  const passwordSaisi = req.headers['x-password'] || '';

  // bcrypt.compareSync vérifie de manière sécurisée si le mot de passe en clair
  // correspond à l'empreinte (hash) stockée dans ton .env
  if (!bcrypt.compareSync(passwordSaisi, PASSWORD_HASH)) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  next();
});

/**
 * Sonde de santé.
 * Vérifie les dépendances critiques au fonctionnement du service —
 * ici, l'accès en lecture au fichier d'état.
 * Renvoie 200 si le service peut traiter du trafic, 503 sinon.
 */
app.get('/health', (req, res) => {
  const checks = {};
  let healthy = true;

  try {
    fs.accessSync(SUBS_PATH, fs.constants.R_OK);
    checks.subscriptions_file = 'ok';
  } catch (err) {
    checks.subscriptions_file = `unreachable: ${err.code}`;
    healthy = false;
  }

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    version: packageJson.version,
    uptime_seconds: Math.floor(process.uptime()),
    checks,
  });
});

const server = app.listen(PORT, () => {
  console.log(JSON.stringify({
    level: 'info', msg: 'server started', port: PORT,
  }));
});

/** Arrêt propre : on cesse d'accepter, on laisse finir, on quitte. */
function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', msg: 'shutdown initiated', signal }));
  server.close(() => {
    console.log(JSON.stringify({ level: 'info', msg: 'shutdown complete' }));
    process.exit(0);
  });
  // Filet : si des connexions traînent, on force au bout de 10 s
  setTimeout(() => {
    console.error(JSON.stringify({ level: 'error', msg: 'forced shutdown' }));
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

function readSubs() {
  if (!fs.existsSync(SUBS_PATH)) return [];
  return JSON.parse(fs.readFileSync(SUBS_PATH, 'utf8'));
}

function writeSubs(data) {
  fs.writeFileSync(SUBS_PATH, JSON.stringify(data, null, 2));
}

app.get('/api/subscriptions', (req, res) => {
  res.json(readSubs());
});

app.post('/api/subscribe', (req, res) => {
  const { anime_name, anime_url } = req.body;
  if (!anime_name || !anime_url) return res.status(400).json({ error: 'Champs manquants' });
  if (!anime_url.startsWith('https://voir-anime.to/anime/')) return res.status(400).json({ error: 'URL invalide' });
  const subs = readSubs();
  if (subs.find(s => s.anime_url === anime_url)) return res.status(409).json({ error: 'Déjà abonné' });

  // Utilisation de la variable masquée
  subs.push({ anime_name, anime_url, discord_webhook: DISCORD_WEBHOOK, last_episode: 0 });
  writeSubs(subs);
  res.json({ success: true });
});

app.delete('/api/unsubscribe', (req, res) => {
  const { anime_url } = req.body;
  writeSubs(readSubs().filter(s => s.anime_url !== anime_url));
  res.json({ success: true });
});

app.listen(3000, () => console.log('Anime Tracker running on port 3000'));
