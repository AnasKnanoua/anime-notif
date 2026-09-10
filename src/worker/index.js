// src/worker/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée du worker Anime Notif.
//
// Orchestre la boucle : lire les abonnements → scraper chaque anime →
// notifier si nouvel épisode → mettre à jour l'état → dormir → recommencer.
//
// Ce fichier remplace entièrement ton workflow n8n.
// ─────────────────────────────────────────────────────────────────────────────
const {
  scrapeCyclesTotal,
  episodesNotifiedTotal,
  scrapeErrorsTotal,
  scrapeCycleDuration,
  animesTracked,
  startMetricsServer,
} = require('./metrics');
const fs = require('fs');
const config = require('./config');
const { readSubscriptions, writeSubscriptions } = require('./state');
const { getLatestEpisode } = require('./scraper');
const { notifyNewEpisode } = require('./notifier');

// ─── Garde contre les cycles concurrents ────────────────────────────────────
let running = false;

/**
 * Attend un certain nombre de millisecondes.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Écrit le fichier heartbeat. Docker le vérifie via HEALTHCHECK :
 * si ce fichier n'a pas été touché depuis plus d'une heure,
 * le conteneur est déclaré "unhealthy" et autoheal le redémarre.
 */
function touchHeartbeat() {
  try {
    fs.writeFileSync('/tmp/.heartbeat', '');
  } catch {
    /* non bloquant */
  }
}

/**
 * Envoie un ping à Uptime Kuma (monitor push) pour signaler
 * que le worker est vivant et que le cycle s'est terminé.
 *
 * Utilise config.uptimeKumaPushUrl qui lit process.env.UPTIME_KUMA_PUSH_URL.
 * Si la variable est absente, la fonction ne fait rien.
 */
async function pingUptimeKuma() {
  if (!config.uptimeKumaPushUrl) return;
  try {
    await fetch(`${config.uptimeKumaPushUrl}?status=up&msg=OK`, {
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    /* non bloquant — Uptime Kuma est un bonus, pas une dépendance */
  }
}
/**
 * Exécute un cycle complet de vérification.
 */
async function runCycle() {
  if (running) {
    console.log(
      JSON.stringify({
        level: 'warn',
        msg: 'cycle précédent encore en cours, on saute celui-ci',
      }),
    );
    return;
  }
  const endTimer = scrapeCycleDuration.startTimer();

  running = true;
  const cycleStart = Date.now();
  let checked = 0;
  let notified = 0;

  try {
    // ── Lire l'état ─────────────────────────────────────────────────────
    let subs;
    try {
      subs = readSubscriptions(config.subscriptionsPath);
      animesTracked.set(subs.length);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'impossible de lire subscriptions.json',
          error: err.message,
        }),
      );
      return;
    }

    let changed = false;

    // ── Vérifier chaque anime ───────────────────────────────────────────
    for (const sub of subs) {
      checked++;

      const result = await getLatestEpisode(sub.anime_url, {
        userAgent: config.userAgent,
      });

      if (!result) {
        scrapeErrorsTotal.inc({ anime: sub.anime_name });
        console.log(
          JSON.stringify({
            level: 'warn',
            msg: 'scraping échoué, on passe',
            anime: sub.anime_name,
          }),
        );
        continue;
      }

      const lastKnown = sub.last_episode || 0;

      if (result.episodeNumber <= lastKnown) {
        console.log(
          JSON.stringify({
            level: 'info',
            msg: 'à jour',
            anime: sub.anime_name,
            episode: lastKnown,
          }),
        );
        continue;
      }

      // ── Nouveaux épisodes détectés ────────────────────────────────────
      let lastSuccessful = lastKnown;

      for (let ep = lastKnown + 1; ep <= result.episodeNumber; ep++) {
        const success = await notifyNewEpisode(
          sub.discord_webhook,
          {
            animeName: sub.anime_name,
            episodeNumber: ep,
            episodeUrl: result.episodeUrl,
            imageUrl: result.imageUrl,
          },
          config.userAgent,
        );

        if (success) {
          lastSuccessful = ep;
          notified++;
          episodesNotifiedTotal.inc();
          console.log(
            JSON.stringify({
              level: 'info',
              msg: 'notification envoyée',
              anime: sub.anime_name,
              episode: ep,
            }),
          );
        } else {
          console.error(
            JSON.stringify({
              level: 'error',
              msg: 'notification échouée, on arrête pour cet anime',
              anime: sub.anime_name,
              episode: ep,
            }),
          );
          break;
        }

        if (ep < result.episodeNumber) {
          await sleep(2_000);
        }
      }

      if (lastSuccessful > lastKnown) {
        sub.last_episode = lastSuccessful;
        changed = true;
      }

      // ── Pause entre les animes (politesse de scraping) ────────────────
      await sleep(2_000);
    }

    // ── Sauvegarder si quelque chose a changé ───────────────────────────
    if (changed) {
      writeSubscriptions(config.subscriptionsPath, subs);
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'état sauvegardé',
        }),
      );
    }

    // ── Résumé du cycle ─────────────────────────────────────────────────
    const durationMs = Date.now() - cycleStart;
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'cycle terminé',
        checked,
        notified,
        duration_ms: durationMs,
      }),
    );
  } catch (err) {
    scrapeCyclesTotal.inc({ status: 'error' });
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'erreur inattendue dans le cycle',
        error: err.message,
        stack: err.stack,
      }),
    );
  } finally {
    running = false;
    touchHeartbeat();
    await pingUptimeKuma();
    endTimer();
    scrapeCyclesTotal.inc({ status: 'success' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Démarrage
// ═══════════════════════════════════════════════════════════════════════════════

const INTERVAL_MS = config.intervalMinutes * 60 * 1000;

console.log(
  JSON.stringify({
    level: 'info',
    msg: 'worker démarré',
    interval_minutes: config.intervalMinutes,
    subscriptions_path: config.subscriptionsPath,
  }),
);
startMetricsServer(9091);
// Premier cycle immédiat
runCycle();

// Puis répétition régulière
const timer = setInterval(runCycle, INTERVAL_MS);

// ═══════════════════════════════════════════════════════════════════════════════
// Arrêt gracieux
// ═══════════════════════════════════════════════════════════════════════════════

function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', msg: 'arrêt demandé', signal }));
  clearInterval(timer);

  if (!running) {
    console.log(JSON.stringify({ level: 'info', msg: 'aucun cycle en cours, arrêt immédiat' }));
    process.exit(0);
  }

  console.log(JSON.stringify({ level: 'info', msg: "cycle en cours, on attend qu'il finisse..." }));
  const check = setInterval(() => {
    if (!running) {
      clearInterval(check);
      console.log(JSON.stringify({ level: 'info', msg: 'cycle terminé, arrêt propre' }));
      process.exit(0);
    }
  }, 500);

  setTimeout(() => {
    console.error(JSON.stringify({ level: 'error', msg: 'arrêt forcé après timeout' }));
    process.exit(1);
  }, 60_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
