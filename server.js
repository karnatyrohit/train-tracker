const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const protobuf = require('protobufjs');

const appDir = __dirname;
const apiKey = process.env.SWIFTLY_API_KEY || (() => {
  try {
    return require('fs').readFileSync(path.join(appDir, '.env'), 'utf8').split(/\r?\n/).find((line) => line.startsWith('SWIFTLY_API_KEY='))?.slice(16).trim();
  } catch { return undefined; }
})();
if (!apiKey) throw new Error('Set SWIFTLY_API_KEY in train-tracker/.env before starting the server.');
const allowedOrigin = process.env.ALLOWED_ORIGIN || '';

const feedType = protobuf.load(path.join(appDir, 'test.proto')).then((root) => root.lookupType('transit_realtime.FeedMessage'));
const feedUrl = (kind) => `https://api.goswift.ly/real-time/nctd/gtfs-rt-${kind}`;

async function getFeed(kind) {
  const response = await fetch(feedUrl(kind), { headers: { Authorization: apiKey } });
  if (!response.ok) throw new Error(`Swiftly returned ${response.status}`);
  const type = await feedType;
  return type.toObject(type.decode(new Uint8Array(await response.arrayBuffer())), { defaults: true });
}

async function getVehicles() {
  const feed = await getFeed('vehicle-positions');
  return feed.entity.map((entity) => entity.vehicle).filter((vehicle) => vehicle?.position && ['398', '399'].includes(vehicle.trip?.routeId)).map((vehicle) => ({
    id: vehicle.vehicle?.id || vehicle.vehicle?.label || 'Train',
    label: vehicle.vehicle?.label || vehicle.vehicle?.id || 'Train',
    routeId: vehicle.trip.routeId,
    latitude: vehicle.position.latitude,
    longitude: vehicle.position.longitude,
    bearing: vehicle.position.bearing,
    speedMph: Math.round((vehicle.position.speed || 0) * 2.23694),
    updatedAt: Number(vehicle.timestamp?.low || 0) * 1000
  }));
}

async function getPredictions(stopIds) {
  const requestedStops = new Set(stopIds);
  const now = Date.now() - 30000;
  const feed = await getFeed('trip-updates');
  return feed.entity.flatMap((entity) => {
    const update = entity.tripUpdate;
    if (!update || !['398', '399'].includes(update.trip?.routeId)) return [];
    return update.stopTimeUpdate.map((stop) => {
      const timestamp = Number(stop.arrival?.time?.low || stop.departure?.time?.low || 0) * 1000;
      return {
        stopId: stop.stopId,
        routeId: update.trip.routeId,
        directionId: update.trip.directionId,
        timestamp,
        vehicle: update.vehicle?.id || 'Train'
      };
    }).filter((prediction) => requestedStops.has(prediction.stopId) && prediction.timestamp >= now);
  }).sort((a, b) => a.timestamp - b.timestamp);
}

http.createServer(async (request, response) => {
  if (allowedOrigin && request.headers.origin === allowedOrigin) {
    response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/api/vehicles') {
      const vehicles = await getVehicles();
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ vehicles, fetchedAt: new Date().toISOString() }));
      return;
    }
    if (url.pathname === '/api/predictions') {
      const stopIds = (url.searchParams.get('stopIds') || '').split(',').filter((id) => /^\d+$/.test(id));
      if (!stopIds.length) { response.writeHead(400).end('A valid stopIds value is required.'); return; }
      const predictions = await getPredictions(stopIds);
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ predictions, fetchedAt: new Date().toISOString() }));
      return;
    }
    const staticFiles = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/config.js': ['config.js', 'application/javascript'], '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'], '/sw.js': ['sw.js', 'application/javascript'], '/icon.svg': ['icon.svg', 'image/svg+xml'] };
    if (staticFiles[url.pathname]) {
      const [file, contentType] = staticFiles[url.pathname];
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(await fs.readFile(path.join(appDir, file)));
      return;
    }
    response.writeHead(404).end('Not found');
  } catch (error) {
    response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Unable to load live NCTD data.' }));
    console.error(error.message);
  }
}).listen(3000, () => console.log('NCTD tracker running at http://localhost:3000'));





