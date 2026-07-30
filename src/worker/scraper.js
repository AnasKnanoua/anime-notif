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
    // ── 1. Télécharger la page ──────────────────────────────────────────
    const response = await fetch(animeUrl, {
      headers: {
        'User-Agent': options.userAgent || 'AnimeNotif/1.0',
      },
      // Timeout : si le site ne répond pas en 15 secondes, on abandonne
      // plutôt que de bloquer le worker indéfiniment.
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.log(JSON.stringify({
        level: 'warn',
        msg: 'page inaccessible',
        url: animeUrl,
        status: response.status,
      }));
      return null;
    }

    const html = await response.text();

    // ── 2. Extraire les épisodes via regex ───────────────────────────────
    // Le slug est la partie après /anime/ dans l'URL.
    // Ex: "mushoku-tensei-3" depuis "https://voir-anime.to/anime/mushoku-tensei-3/"
    const baseSlug = animeUrl
      .replace('https://voir-anime.to/anime/', '')
      .replace(/\/$/, '');

    // On échappe les caractères spéciaux du slug pour l'utiliser dans la regex
    // (au cas où un nom d'anime contiendrait des caractères regex comme + ou .)
    const escapedSlug = baseSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Cette regex est identique à celle de ton workflow n8n.
    // Elle matche les liens du type :
    //   href="https://voir-anime.to/anime/mushoku-tensei-3/mushoku-tensei-3-02-vostfr/"
    // et capture :
    //   - groupe 1 : l'URL complète de l'épisode
    //   - groupe 2 : le numéro d'épisode (ici "02")
    const regex = new RegExp(
      `href="(https://voir-anime\\.to/anime/${escapedSlug}/[^"]*-(\\d+)-vostfr[^"]*)"`,
      'g'
    );

    const episodes = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      episodes.push({
        url: match[1],
        num: parseInt(match[2], 10),
      });
    }

    if (episodes.length === 0) {
      console.log(JSON.stringify({
        level: 'warn',
        msg: 'aucun épisode trouvé sur la page',
        url: animeUrl,
      }));
      return null;
    }

    // ── 3. Trouver l'épisode le plus récent ─────────────────────────────
    const maxEp = Math.max(...episodes.map(e => e.num));
    const maxEpData = episodes.find(e => e.num === maxEp);

    // ── 4. Extraire l'image de couverture (og:image) ────────────────────
    // Ton workflow n8n faisait exactement ça : chercher la balise meta og:image
    // pour l'attacher en embed Discord.
    const imgMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    return {
      episodeNumber: maxEp,
      episodeUrl: maxEpData.url,
      imageUrl,
    };

  } catch (err) {
    // Erreur réseau, timeout, ou parsing — on logue et on continue.
    // Le worker ne doit JAMAIS crasher à cause d'un seul anime.
    console.error(JSON.stringify({
      level: 'error',
      msg: 'erreur scraping',
      url: animeUrl,
      error: err.message,
    }));
    return null;
  }
}

module.exports = { getLatestEpisode };
