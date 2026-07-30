// vi.stubGlobal remplace le fetch global par un faux, qu'on contrôle.
// Aucune requête réseau ne part — le test est instantané et déterministe.
let lastFetchArgs;

beforeEach(() => {
  lastFetchArgs = null;
  vi.stubGlobal('fetch', async (url, options) => {
    lastFetchArgs = { url, options };
    return { ok: true, status: 200 };
  });
});

const { notifyNewEpisode } = require('../../src/worker/notifier');

describe('notifyNewEpisode', () => {
  it('envoie un embed avec le bon titre', async () => {
    const result = await notifyNewEpisode(
      'https://discord.com/api/webhooks/fake/fake',
      {
        animeName: 'Mushoku Tensei',
        episodeNumber: 7,
        episodeUrl: 'https://voir-anime.to/anime/mushoku-tensei-3/ep-07-vostfr/',
        imageUrl: null, // pas d'image = embed simple JSON
      },
      'TestAgent/1.0',
    );

    expect(result).toBe(true);
    expect(lastFetchArgs.url).toBe('https://discord.com/api/webhooks/fake/fake');

    // Vérifie le contenu de l'embed
    const body = JSON.parse(lastFetchArgs.options.body);
    expect(body.embeds[0].title).toContain('Mushoku Tensei');
    expect(body.embeds[0].title).toContain('7');
    expect(body.embeds[0].color).toBe(0x6c63ff);
  });

  it('retourne false si Discord renvoie une erreur', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));

    const result = await notifyNewEpisode(
      'https://discord.com/api/webhooks/fake/fake',
      {
        animeName: 'Test',
        episodeNumber: 1,
        episodeUrl: 'https://example.com',
        imageUrl: null,
      },
      'TestAgent/1.0',
    );

    expect(result).toBe(false);
  });

  it('gère le rate limit 429 en réessayant', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: () => '0.1' }, // retry_after très court pour le test
          json: async () => ({ retry_after: 0.1 }),
        };
      }
      return { ok: true, status: 200 };
    });

    const result = await notifyNewEpisode(
      'https://discord.com/api/webhooks/fake/fake',
      {
        animeName: 'Test',
        episodeNumber: 1,
        episodeUrl: 'https://example.com',
        imageUrl: null,
      },
      'TestAgent/1.0',
    );

    expect(callCount).toBe(2); // 1ère tentative (429) + 1 retry
    expect(result).toBe(true); // la 2ème réussit
  });
});
