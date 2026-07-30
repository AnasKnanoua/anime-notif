// src/worker/notifier.js
// ─────────────────────────────────────────────────────────────────────────────
// Envoi de notifications Discord via webhook.
//
// Deux modes, comme dans ton workflow n8n :
// 1. Avec image de couverture (téléchargée puis attachée en multipart)
// 2. Sans image (embed simple, fallback si l'image est indisponible)
//
// Gère le rate limit Discord (code 429) : si Discord dit "trop vite",
// on attend le temps demandé et on réessaie une fois.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Télécharge une image et retourne son contenu en Buffer.
 * @param {string} imageUrl
 * @param {string} userAgent
 * @returns {Promise<{buffer: Buffer, extension: string} | null>}
 */
async function downloadImage(imageUrl, userAgent) {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': userAgent,
        // Referer nécessaire : certains CDN bloquent les requêtes sans referer.
        // Ton workflow n8n l'incluait aussi.
        Referer: 'https://voir-anime.to/',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());

    // Extension depuis l'URL (comme dans ton workflow : .split('.').pop())
    const extension = imageUrl.split('.').pop().split('?')[0] || 'jpg';

    return { buffer, extension };
  } catch {
    return null;
  }
}

/**
 * Construit le corps multipart pour envoyer une image en pièce jointe
 * dans un embed Discord. C'est exactement ce que faisait ta fonction
 * postDiscord() dans le workflow n8n.
 *
 * Discord impose le multipart quand on veut attacher un fichier local
 * (pas hébergé sur un CDN public) dans un embed.
 */
function buildMultipartBody(embed, imageBuffer, imageExt) {
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);

  const embedJson = JSON.stringify(embed);

  const parts = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="payload_json"\r\n`,
    `Content-Type: application/json\r\n\r\n`,
    embedJson,
    `\r\n--${boundary}\r\n`,
    `Content-Disposition: form-data; name="files[0]"; filename="cover.${imageExt}"\r\n`,
    `Content-Type: image/${imageExt}\r\n\r\n`,
  ];

  const before = Buffer.from(parts.join(''));
  const after = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    body: Buffer.concat([before, imageBuffer, after]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * Attend un certain nombre de millisecondes.
 * Utilisé pour respecter le rate limit Discord.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Envoie une requête vers un webhook Discord, avec gestion du retry sur 429.
 * @param {string} webhookUrl
 * @param {object} options — { body, contentType }
 * @returns {Promise<boolean>} — true si envoyé avec succès
 */
async function sendToDiscord(webhookUrl, { body, contentType }) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok || res.status === 204) return true;

      if (res.status === 429) {
        // Discord nous dit d'attendre — on respecte, puis on réessaie UNE fois.
        // retry_after est en secondes (parfois fractionnaire).
        const data = await res.json().catch(() => ({}));
        const waitMs = (data.retry_after || 5) * 1000;
        console.log(
          JSON.stringify({
            level: 'warn',
            msg: 'discord rate limited, attente avant retry',
            wait_ms: waitMs,
            attempt,
          }),
        );
        await sleep(waitMs);
        continue;
      }

      // Autre erreur HTTP (400, 401, 404...) — pas la peine de réessayer.
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'discord webhook error',
          status: res.status,
          statusText: res.statusText,
        }),
      );
      return false;
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'discord request failed',
          error: err.message,
          attempt,
        }),
      );
      return false;
    }
  }
  return false;
}

/**
 * Envoie une notification de nouvel épisode.
 * Tente d'abord avec l'image de couverture (comme ton workflow n8n),
 * puis tombe en fallback sans image si le téléchargement échoue.
 *
 * @param {string} webhookUrl
 * @param {object} episode — { animeName, episodeNumber, episodeUrl, imageUrl }
 * @param {string} userAgent
 * @returns {Promise<boolean>}
 */
async function notifyNewEpisode(webhookUrl, episode, userAgent) {
  // ── Construire l'embed (identique à ton workflow n8n) ─────────────────
  const embed = {
    embeds: [
      {
        title: `🎌 ${episode.animeName} — Épisode ${episode.episodeNumber} disponible !`,
        url: episode.episodeUrl,
        color: 0x6c63ff, // même couleur que ton workflow
        fields: [{ name: '🔗 Regarder', value: episode.episodeUrl }],
        footer: { text: 'Anime Notif' },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  // ── Tenter avec image ─────────────────────────────────────────────────
  if (episode.imageUrl) {
    const image = await downloadImage(episode.imageUrl, userAgent);

    if (image) {
      // Ajouter la référence à l'image attachée dans l'embed
      embed.embeds[0].image = { url: `attachment://cover.${image.extension}` };

      const { body, contentType } = buildMultipartBody(embed, image.buffer, image.extension);
      const sent = await sendToDiscord(webhookUrl, { body, contentType });

      if (sent) return true;
      // Si l'envoi multipart échoue, on tente sans image (fallback)
    }
  }

  // ── Fallback sans image ───────────────────────────────────────────────
  // Supprime la référence à l'image attachée si elle avait été ajoutée
  delete embed.embeds[0].image;

  const body = JSON.stringify(embed);
  return sendToDiscord(webhookUrl, {
    body,
    contentType: 'application/json',
  });
}

module.exports = { notifyNewEpisode };
