// src/worker/scraper.js
// ─────────────────────────────────────────────────────────────────────────────
// Scrape une page anime sur VoirAnime (voiranime.cx) et retourne les épisodes trouvés.
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
  // On extrait le slug depuis le CHEMIN de l'URL, sans dépendre du domaine.
  // "https://voiranime.cx/anime/mushoku-tensei-3/" → "mushoku-tensei-3"
  // Si le site change encore de domaine, cette fonction n'a pas à bouger.
  const pathname = new URL(animeUrl).pathname; // "/anime/mushoku-tensei-3/"
  const baseSlug = pathname.replace(/^\/anime\//, '').replace(/\/$/, '');

  const escapedSlug = baseSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Le domaine est libre ([^"/]+) et optionnel : on accepte aussi bien
  //   href="https://voiranime.cx/anime/<slug>/<slug>-03-vostfr/"
  // que des liens relatifs
  //   href="/anime/<slug>/<slug>-03-vostfr/"
  const regex = new RegExp(
    `href="((?:https?://[^"/]+)?/anime/${escapedSlug}/[^"]*-(\\d+)-vostfr[^"]*)"`,
    'g',
  );

  const origin = new URL(animeUrl).origin; // "https://voiranime.cx"

  const episodes = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    // Un lien relatif est transformé en URL absolue pour Discord.
    const url = match[1].startsWith('/') ? origin + match[1] : match[1];
    episodes.push({ url, num: parseInt(match[2], 10) });
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
 * @param {string} animeUrl — ex: "https://voiranime.cx/anime/mushoku-tensei-3/"
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
