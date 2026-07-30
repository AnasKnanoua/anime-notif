// src/worker/scraper.js
// ─────────────────────────────────────────────────────────────────────────────
// Scrape une page anime sur voir-anime.to et retourne les épisodes trouvés.
//
// Reproduit exactement la logique de ton workflow n8n :
// 1. Requête GET sur la page de l'anime
// 2. Regex pour trouver tous les liens d'épisodes VOSTFR
// 3. Extraction de l'image de couverture (og:image)
// 4. Retourne le numéro max + l'URL de l'épisode + l'image
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse le HTML d'une page anime et extrait les épisodes.
 * Fonction pure : pas de réseau, pas d'effet de bord — testable isolément.
 *
 * @param {string} html — contenu HTML de la page
 * @param {string} animeUrl — URL de l'anime (pour construire le slug)
 * @returns {{ episodeNumber: number, episodeUrl: string, imageUrl: string|null } | null}
 */
function parseAnimePage(html, animeUrl) {
  const baseSlug = animeUrl.replace('https://voir-anime.to/anime/', '').replace(/\/$/, '');

  const escapedSlug = baseSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const regex = new RegExp(
    `href="(https://voir-anime\\.to/anime/${escapedSlug}/[^"]*-(\\d+)-vostfr[^"]*)"`,
    'g',
  );

  const episodes = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    episodes.push({ url: match[1], num: parseInt(match[2], 10) });
  }

  if (episodes.length === 0) return null;

  const maxEp = Math.max(...episodes.map((e) => e.num));
  const maxEpData = episodes.find((e) => e.num === maxEp);

  const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  const imageUrl = imgMatch ? imgMatch[1] : null;

  return {
    episodeNumber: maxEp,
    episodeUrl: maxEpData.url,
    imageUrl,
  };
}

/**
 * Scrape la page d'un anime et retourne les informations du dernier épisode.
 *
 * @param {string} animeUrl — ex: "https://voir-anime.to/anime/mushoku-tensei-3/"
 * @param {object} options — { userAgent: string }
 * @returns {Promise<{episodeNumber: number, episodeUrl: string, imageUrl: string|null} | null>}
 *   null si la page est inaccessible ou qu'aucun épisode n'est trouvé.
 *   Ne lance JAMAIS d'exception — une erreur réseau n'est pas une raison
 *   de crasher le worker entier, on passe simplement à l'anime suivant.
 */
async function getLatestEpisode(animeUrl, options = {}) {
  try {
    const response = await fetch(animeUrl, {
      headers: {
        'User-Agent': options.userAgent || 'AnimeNotif/1.0',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.log(
        JSON.stringify({
          level: 'warn',
          msg: 'page inaccessible',
          url: animeUrl,
          status: response.status,
        }),
      );
      return null;
    }

    const html = await response.text();

    const result = parseAnimePage(html, animeUrl);
    if (!result) {
      console.log(
        JSON.stringify({
          level: 'warn',
          msg: 'aucun épisode trouvé sur la page',
          url: animeUrl,
        }),
      );
      return null;
    }
    return result;
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'erreur scraping',
        url: animeUrl,
        error: err.message,
      }),
    );
    return null;
  }
}

module.exports = { getLatestEpisode, parseAnimePage };
