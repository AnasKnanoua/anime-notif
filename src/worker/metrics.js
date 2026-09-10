// src/worker/metrics.js
const http = require('http');
const client = require('@prometheus-io/client');

client.collectDefaultMetrics();

const scrapeCyclesTotal = new client.Counter({
  name: 'scrape_cycles_total',
  help: 'Nombre total de cycles de scraping',
  labelNames: ['status'],
});

const episodesNotifiedTotal = new client.Counter({
  name: 'episodes_notified_total',
  help: "Nombre total d'épisodes notifiés",
});

const scrapeErrorsTotal = new client.Counter({
  name: 'scrape_errors_total',
  help: "Nombre total d'erreurs de scraping",
  labelNames: ['anime'],
});

const scrapeCycleDuration = new client.Histogram({
  name: 'scrape_cycle_duration_seconds',
  help: "Durée d'un cycle de scraping",
  buckets: [1, 5, 10, 30, 60, 120, 300],
});

const animesTracked = new client.Gauge({
  name: 'animes_tracked_total',
  help: "Nombre d'animes suivis",
});

function startMetricsServer(port = 9091) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('Content-Type', client.register.contentType);
      res.end(await client.register.metrics());
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  });
  server.listen(port, () => {
    console.log(JSON.stringify({ level: 'info', msg: 'metrics server started', port }));
  });
  return server;
}

module.exports = {
  scrapeCyclesTotal,
  episodesNotifiedTotal,
  scrapeErrorsTotal,
  scrapeCycleDuration,
  animesTracked,
  startMetricsServer,
};
