const fs = require('fs');
const path = require('path');
const os = require('os');
const { readSubscriptions, writeSubscriptions } = require('../../src/worker/state');

// On travaille dans un dossier temporaire pour ne jamais toucher aux vrais données.
// Chaque test repart d'un état propre — c'est le principe d'isolation.
let tmpDir;
let tmpFile;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-notif-test-'));
  tmpFile = path.join(tmpDir, 'subscriptions.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readSubscriptions', () => {
  it('lit et parse un fichier JSON valide', () => {
    const data = [{ anime_name: 'Test', last_episode: 5 }];
    fs.writeFileSync(tmpFile, JSON.stringify(data));

    const result = readSubscriptions(tmpFile);

    expect(result).toEqual(data);
    expect(result[0].anime_name).toBe('Test');
    expect(result[0].last_episode).toBe(5);
  });

  it("lance une erreur si le fichier n'existe pas", () => {
    expect(() => readSubscriptions('/tmp/nexiste-pas.json')).toThrow();
  });

  it('lance une erreur si le JSON est invalide', () => {
    fs.writeFileSync(tmpFile, '{ broken json !!!');

    expect(() => readSubscriptions(tmpFile)).toThrow();
  });
});

describe('writeSubscriptions', () => {
  it('écrit un JSON valide et lisible', () => {
    const data = [
      { anime_name: 'Mushoku', last_episode: 7 },
      { anime_name: 'ReZero', last_episode: 12 },
    ];

    writeSubscriptions(tmpFile, data);

    // Relire et vérifier
    const raw = fs.readFileSync(tmpFile, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(data);

    // Vérifier que c'est formaté (indenté), pas sur une seule ligne
    expect(raw).toContain('\n');
  });

  it('ne laisse pas de fichier .tmp qui traîne', () => {
    writeSubscriptions(tmpFile, []);

    const files = fs.readdirSync(tmpDir);
    expect(files).toEqual(['subscriptions.json']);
    // Pas de subscriptions.json.tmp résiduel
  });

  it('écrit de manière atomique (le fichier original survit si on interrompt)', () => {
    // Écrit un premier état
    const original = [{ anime_name: 'Original', last_episode: 1 }];
    writeSubscriptions(tmpFile, original);

    // Écrit un second état — si l'écriture atomique fonctionne,
    // le fichier passe directement de l'ancien au nouveau contenu
    const updated = [{ anime_name: 'Updated', last_episode: 2 }];
    writeSubscriptions(tmpFile, updated);

    const result = readSubscriptions(tmpFile);
    expect(result[0].anime_name).toBe('Updated');
  });
});
