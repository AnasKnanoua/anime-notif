const { parseAnimePage } = require('../../src/worker/scraper');

// HTML simulé — reproduit la structure réelle de voir-anime.to
// sans dépendre du site. Si le site change, tu mets à jour CE HTML,
// pas tes tests.
const FAKE_HTML = `
<html>
<head>
  <meta property="og:image" content="https://voir-anime.to/wp-content/uploads/mushoku.jpg"/>
</head>
<body>
  <div class="episodes">
    <a href="https://voir-anime.to/anime/mushoku-tensei-3/mushoku-tensei-3-01-vostfr/">Ep 1</a>
    <a href="https://voir-anime.to/anime/mushoku-tensei-3/mushoku-tensei-3-02-vostfr/">Ep 2</a>
    <a href="https://voir-anime.to/anime/mushoku-tensei-3/mushoku-tensei-3-03-vostfr/">Ep 3</a>
  </div>
</body>
</html>
`;

const ANIME_URL = 'https://voir-anime.to/anime/mushoku-tensei-3/';

describe('parseAnimePage', () => {
  it('trouve le dernier épisode dans le HTML', () => {
    const result = parseAnimePage(FAKE_HTML, ANIME_URL);

    expect(result).not.toBeNull();
    expect(result.episodeNumber).toBe(3);
  });

  it("retourne l'URL de l'épisode le plus récent", () => {
    const result = parseAnimePage(FAKE_HTML, ANIME_URL);

    expect(result.episodeUrl).toContain('mushoku-tensei-3-03-vostfr');
  });

  it("extrait l'image og:image", () => {
    const result = parseAnimePage(FAKE_HTML, ANIME_URL);

    expect(result.imageUrl).toBe('https://voir-anime.to/wp-content/uploads/mushoku.jpg');
  });

  it('retourne null si aucun épisode trouvé', () => {
    const htmlSansEpisode = '<html><body><p>Page vide</p></body></html>';

    const result = parseAnimePage(htmlSansEpisode, ANIME_URL);

    expect(result).toBeNull();
  });

  it('retourne imageUrl null si pas de meta og:image', () => {
    const htmlSansImage = `
      <body>
        <a href="https://voir-anime.to/anime/mushoku-tensei-3/mushoku-tensei-3-05-vostfr/">Ep 5</a>
      </body>
    `;

    const result = parseAnimePage(htmlSansImage, ANIME_URL);

    expect(result.episodeNumber).toBe(5);
    expect(result.imageUrl).toBeNull();
  });

  it("gère les numéros d'épisodes à deux chiffres", () => {
    const html = `
      <a href="https://voir-anime.to/anime/mushoku-tensei-3/mushoku-tensei-3-12-vostfr/">Ep 12</a>
      <a href="https://voir-anime.to/anime/mushoku-tensei-3/mushoku-tensei-3-09-vostfr/">Ep 9</a>
    `;

    const result = parseAnimePage(html, ANIME_URL);

    expect(result.episodeNumber).toBe(12);
  });

  it("ignore les liens d'un autre anime sur la même page", () => {
    const html = `
      <a href="https://voir-anime.to/anime/mushoku-tensei-3/mushoku-tensei-3-02-vostfr/">Ep 2</a>
      <a href="https://voir-anime.to/anime/rezero-s4/rezero-s4-99-vostfr/">ReZero 99</a>
    `;

    const result = parseAnimePage(html, ANIME_URL);

    // Doit trouver 2 (Mushoku), PAS 99 (ReZero)
    expect(result.episodeNumber).toBe(2);
  });
});
