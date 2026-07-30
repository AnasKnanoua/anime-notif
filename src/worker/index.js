// src/worker/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Point d'entrée du worker Anime Notif.
//
// Orchestre la boucle : lire les abonnements → scraper chaque anime →
// notifier si nouvel épisode → mettre à jour l'état → dormir → recommencer.
//
// Ce fichier remplace entièrement ton workflow n8n.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const config = require('./config');
const { readSubscriptions, writeSubscriptions } = require('./state');
const { getLatestEpisode } = require('./scraper');
const { notifyNewEpisode } = require('./notifier');

// ─── Garde contre les cycles concurrents ────────────────────────────────────
// Si un cycle prend plus de 30 minutes (site très lent, beaucoup d'animes),
// setInterval déclencherait un second cycle. Deux cycles qui écrivent
// subscriptions.json simultanément = corruption. Ce flag l'empêche.
let running = false;

/**
 * Attend un certain nombre de millisecondes.
 * Utilisé pour espacer les requêtes (politesse envers le site).
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
 *
 * Pour chaque anime :
 * 1. Scrape la page pour trouver le dernier épisode
 * 2. Compare avec last_episode stocké
 * 3. Si nouveau(x) épisode(s) : notifie chacun via Discord
 * 4. Met à jour last_episode SEULEMENT si la notification a réussi
 *
 * Ce "seulement si réussi" est le pattern "at-least-once delivery" :
 * on préfère notifier deux fois (en cas de crash entre la notif et la
 * sauvegarde) plutôt que rater une notification.
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

  running = true;
  const cycleStart = Date.now();
  let checked = 0;
  let notified = 0;

  try {
    // ── Lire l'état ─────────────────────────────────────────────────────
    let subs;
    try {
      subs = readSubscriptions(config.subscriptionsPath);
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

      // Si le scraping échoue (site down, HTML changé), on passe au suivant
      // sans toucher à last_episode — on réessaiera au prochain cycle.
      if (!result) {
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
      // On notifie CHAQUE épisode manqué, pas seulement le dernier.
      // Exemple : si on passe de ep 5 à ep 8, on notifie 6, 7 et 8.
      // Ton workflow n8n ne notifiait que le max — on fait mieux ici.
      let lastSuccessful = lastKnown;

      for (let ep = lastKnown + 1; ep <= result.episodeNumber; ep++) {
        const success = await notifyNewEpisode(
          sub.discord_webhook,
          {
            animeName: sub.anime_name,
            episodeNumber: ep,
            episodeUrl: result.episodeUrl, // URL du dernier (on n'a pas les URLs individuelles)
            imageUrl: result.imageUrl,
          },
          config.userAgent,
        );

        if (success) {
          lastSuccessful = ep;
          notified++;
          console.log(
            JSON.stringify({
              level: 'info',
              msg: 'notification envoyée',
              anime: sub.anime_name,
              episode: ep,
            }),
          );
        } else {
          // Échec de notification — on arrête ici pour cet anime.
          // last_episode sera mis à jour jusqu'au dernier épisode
          // notifié avec succès, et on retentara le reste au prochain cycle.
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

        // Pause entre les notifications pour ne pas se faire rate-limit
        if (ep < result.episodeNumber) {
          await sleep(2_000);
        }
      }

      // Met à jour seulement jusqu'à ce qui a été effectivement notifié
      if (lastSuccessful > lastKnown) {
        sub.last_episode = lastSuccessful;
        changed = true;
      }

      // ── Pause entre les animes (politesse de scraping) ────────────────
      // 2 secondes entre chaque anime pour ne pas surcharger voir-anime.to.
      // Un scraper qui martèle un site finit par se faire bloquer.
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
    // Erreur inattendue — on logue mais on ne crashe PAS le worker.
    // Le prochain cycle réessaiera.
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
  }

  const PUSH_URL = process.env.UPTIME_KUMA_PUSH_URL;
  if (PUSH_URL) {
    try {
      await fetch(`${PUSH_URL}?status=up&msg=OK&ping=`, { signal: AbortSignal.timeout(5_000) });
    } catch {
      /* non bloquant */
    }
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

// Premier cycle immédiat — on ne veut pas attendre 30 min au démarrage
// pour savoir si le worker fonctionne.
runCycle();

// Puis répétition régulière
const timer = setInterval(runCycle, INTERVAL_MS);

// ═══════════════════════════════════════════════════════════════════════════════
// Arrêt gracieux
// ═══════════════════════════════════════════════════════════════════════════════
// Quand Docker envoie SIGTERM (docker stop / docker compose down), on :
// 1. Arrête le timer pour ne pas lancer de nouveau cycle
// 2. Si un cycle est en cours, on le laisse finir (données cohérentes)
// 3. On quitte proprement
//
// Sans ça, Docker attend 10s puis SIGKILL — le cycle en cours est
// interrompu brutalement et subscriptions.json pourrait être corrompu
// (même si l'écriture atomique limite le risque, c'est de la défense en profondeur).

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

  // Filet : si le cycle ne finit toujours pas après 60s, on force
  setTimeout(() => {
    console.error(JSON.stringify({ level: 'error', msg: 'arrêt forcé après timeout' }));
    process.exit(1);
  }, 60_000).unref(); // .unref() pour que ce timer ne maintienne pas Node vivant
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
