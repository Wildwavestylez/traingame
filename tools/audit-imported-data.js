const fs = require("fs");

const read = name => JSON.parse(fs.readFileSync("data/" + name, "utf8"));

const stations = read("stations.json").stations;
const routes = read("routes.json").routes;
const sections = read("track-sections.json").trackSections;
const services = read("legacy-services.json").services;
const trainTypes = read("train-types.json").trainTypes;

const stationIds = new Set(stations.map(s => s.id));
const routeIds = new Set(routes.map(r => r.id));
const trainTypeIds = new Set(trainTypes.map(t => t.id));

const issues = [];
const check = (condition, message) => {
  if (!condition) issues.push(message);
};

check(stationIds.size === stations.length, "Duplicate station IDs");
check(routeIds.size === routes.length, "Duplicate route IDs");
check(trainTypeIds.size === trainTypes.length, "Duplicate train type IDs");

for (const station of stations) {
  for (const routeId of station.routeIds) {
    check(routeIds.has(routeId), "Station references missing route: " + station.id + " -> " + routeId);
  }
}

for (const route of routes) {
  check(route.stopStationIds.length === route.metadata.legacyStopCount, "Stop count mismatch: " + route.name);
  check(new Set(route.stationIds).size === route.stationIds.length, "Duplicate stationIds: " + route.name);
  check(new Set(route.stationIds).size === new Set(route.stopStationIds).size, "Station set mismatch: " + route.name);

  for (const stationId of route.stationIds) {
    check(stationIds.has(stationId), "Route references missing station: " + route.name + " -> " + stationId);
  }
  for (const stationId of route.stopStationIds) {
    check(stationIds.has(stationId), "Route stop references missing station: " + route.name + " -> " + stationId);
  }
}

for (const section of sections) {
  check(routeIds.has(section.routeId), "Section references missing route: " + section.id);
  check(stationIds.has(section.fromStationId), "Section references missing origin: " + section.id);
  check(stationIds.has(section.toStationId), "Section references missing destination: " + section.id);
  check(section.fromStationId !== section.toStationId, "Zero-length section: " + section.id);
}

for (const service of services) {
  check(routeIds.has(service.routeId), "Service references missing route: " + service.id);
}

for (const train of trainTypes) {
  check(Number.isFinite(train.maxSpeedKmh) && train.maxSpeedKmh > 0, "Invalid train speed: " + train.name);
}

const t679 = trainTypes.find(t => t.name === "T679");
check(t679 && t679.maxSpeedKmh === 100, "T679 correction failed");

if (issues.length) {
  console.error(JSON.stringify({ ok: false, issueCount: issues.length, issues }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  stations: stations.length,
  routes: routes.length,
  trackSections: sections.length,
  services: services.length,
  trainTypes: trainTypes.length,
  zeroLengthSections: sections.filter(s => s.fromStationId === s.toStationId).length
}, null, 2));
