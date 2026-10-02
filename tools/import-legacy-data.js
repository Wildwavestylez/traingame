#!/usr/bin/env node
/**
 * Legacy data importer for TrainGame.
 *
 * IMPORTANT:
 * - Reads ONLY game.html.
 * - Never modifies game.html.
 * - Extracts the legacy `lines` and `trainTypes` array literals.
 * - Parses those isolated literals in a sandbox.
 * - Writes normalized static data into data/.
 * - Safe to run repeatedly: output is deterministic for the same source.
 *
 * Usage:
 *   node tools/import-legacy-data.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "game.html");
const OUT = path.join(ROOT, "data");

const T679_SPEED_KMH = 100;

function readSource() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error("Missing game.html");
  }
  return fs.readFileSync(SOURCE, "utf8");
}

function findArrayLiteral(source, declaration) {
  const marker = new RegExp(`\\bconst\\s+${declaration}\\s*=\\s*\\[`);
  const match = marker.exec(source);
  if (!match) throw new Error(`Could not find const ${declaration} = [...]`);

  const start = source.indexOf("[", match.index);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\\\") {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }

  throw new Error(`Unclosed array for ${declaration}`);
}

function parseIsolatedArray(literal, label) {
  // Only the extracted array expression is evaluated, in a context with no
  // access to require, process, filesystem, globals, or the page itself.
  try {
    return vm.runInNewContext("(" + literal + ")", Object.create(null), {
      timeout: 5000,
      displayErrors: true
    });
  } catch (error) {
    throw new Error(`Failed to parse isolated ${label} array: ${error.message}`);
  }
}

function stableId(prefix, value) {
  return prefix + "_" + String(value)
    .normalize("NFKD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function coordKey(lat, lon) {
  return Number(lat).toFixed(7) + "," + Number(lon).toFixed(7);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function main() {
  const source = readSource();

  const lines = parseIsolatedArray(
    findArrayLiteral(source, "lines"),
    "lines"
  );
  const trainTypes = parseIsolatedArray(
    findArrayLiteral(source, "trainTypes"),
    "trainTypes"
  );

  if (!Array.isArray(lines) || !Array.isArray(trainTypes)) {
    throw new Error("Legacy arrays did not parse as arrays.");
  }

  const stationsByCoord = new Map();
  const stations = [];
  const stationNameOccurrences = new Map();
  const routes = [];
  const trackSections = [];
  const legacyServices = [];
  const trainTypeOutput = [];
  const report = {
    source: {
      file: "game.html",
      lines: lines.length,
      trainTypes: trainTypes.length
    },
    stations: {
      unique: 0,
      sharedAcrossRoutes: 0,
      repeatedNamesAcrossCoordinates: 0
    },
    routes: {
      count: 0,
      empty: 0,
      categories: {}
    },
    trackSections: {
      count: 0
    },
    legacyServices: {
      count: 0,
      reverseTrue: 0,
      reverseFalse: 0,
      unresolvedRouteReferences: 0
    },
    trainTypes: {
      count: 0,
      correctedLegacyValues: [],
      duplicateNames: []
    },
    anomalies: [],
    notes: [
      "Station identity is primarily coordinate-based; station name alone is not identity.",
      "A physical station may belong to multiple routes.",
      "Route-level trains are preserved as legacy services and are not treated as vehicle types.",
      "Legacy trainTypes.location is not imported as a runtime vehicle position."
    ]
  };

  // ---- Routes, stations and track sections ----
  lines.forEach((line, routeIndex) => {
    const routeId = stableId("route", line.name || `route_${routeIndex + 1}`);
    const category = line.category ?? null;

    report.routes.categories[category] =
      (report.routes.categories[category] || 0) + 1;

    const route = {
      id: routeId,
      legacyIndex: routeIndex,
      name: line.name || `Unnamed route ${routeIndex + 1}`,
      color: line.color ?? null,
      category,
      stationIds: [],
      metadata: {
        legacyTrainCount: Array.isArray(line.trains) ? line.trains.length : 0
      }
    };

    const stops = Array.isArray(line.stops) ? line.stops : [];
    if (stops.length === 0) report.routes.empty++;

    stops.forEach((stop, stopIndex) => {
      const name = String(stop?.name ?? "").trim();
      const location = stop?.location;

      if (
        !name ||
        !Array.isArray(location) ||
        location.length < 2 ||
        !finiteNumber(Number(location[0])) ||
        !finiteNumber(Number(location[1]))
      ) {
        report.anomalies.push({
          type: "invalid_stop",
          routeId,
          routeIndex,
          stopIndex,
          value: stop
        });
        return;
      }

      const lat = Number(location[0]);
      const lon = Number(location[1]);
      const key = coordKey(lat, lon);

      let station = stationsByCoord.get(key);
      if (!station) {
        station = {
          id: stableId("station", name) + "_" + key.replace(",", "_").replace(".", "_").replace("-", "m"),
          name,
          latitude: lat,
          longitude: lon,
          routeIds: [],
          legacyNames: [name],
          metadata: {
            source: "game.html",
            coordinateKey: key
          }
        };
        stationsByCoord.set(key, station);
        stations.push(station);
      } else if (!station.legacyNames.includes(name)) {
        station.legacyNames.push(name);
      }

      if (!station.routeIds.includes(routeId)) station.routeIds.push(routeId);
      if (!route.stationIds.includes(station.id)) route.stationIds.push(station.id);

      const nameList = stationNameOccurrences.get(name) || new Set();
      nameList.add(key);
      stationNameOccurrences.set(name, nameList);
    });

    for (let i = 1; i < route.stationIds.length; i++) {
      const from = stations.find(s => s.id === route.stationIds[i - 1]);
      const to = stations.find(s => s.id === route.stationIds[i]);
      if (!from || !to) continue;

      trackSections.push({
        id: `${routeId}__${i}`,
        routeId,
        sequence: i - 1,
        fromStationId: from.id,
        toStationId: to.id,
        distanceKm: null,
        travelTimeMinutes: null,
        metadata: {
          distanceStatus: "not_calculated",
          source: "legacy_stop_order"
        }
      });
    }

    routes.push(route);

    const serviceEntries = Array.isArray(line.trains) ? line.trains : [];
    serviceEntries.forEach((train, serviceIndex) => {
      legacyServices.push({
        id: `${routeId}__service_${serviceIndex + 1}`,
        routeId,
        legacyRouteIndex: routeIndex,
        legacyServiceIndex: serviceIndex,
        name: train?.name ?? null,
        startingIndex: train?.startingIndex ?? null,
        reverse: Boolean(train?.reverse),
        image: train?.image ?? null,
        maxSpeed: train?.maxSpeed ?? null,
        metadata: {
          source: "game.html",
          semanticRole: "legacy_route_service"
        }
      });

      if (train?.reverse) report.legacyServices.reverseTrue++;
      else report.legacyServices.reverseFalse++;
    });
  });

  // ---- Vehicle/train types ----
  const seenTrainNames = new Set();

  trainTypes.forEach((train, index) => {
    const originalSpeed = Number(train?.speed);
    const name = String(train?.name ?? `Legacy train ${index + 1}`);

    if (seenTrainNames.has(name)) report.trainTypes.duplicateNames.push(name);
    seenTrainNames.add(name);

    let speed = originalSpeed;
    const anomalies = [];

    if (name === "T679") {
      speed = T679_SPEED_KMH;
      anomalies.push({
        type: "legacy_speed_correction",
        original: originalSpeed,
        corrected: speed,
        reason: "Legacy value is clearly implausible; imported as a normal 100 km/h maximum speed."
      });
      report.trainTypes.correctedLegacyValues.push({
        name,
        field: "speed",
        original: originalSpeed,
        corrected: speed
      });
    }

    if (!finiteNumber(originalSpeed) || originalSpeed <= 0) {
      anomalies.push({
        type: "invalid_speed",
        original: train?.speed ?? null
      });
    }

    trainTypeOutput.push({
      id: stableId("train_type", name) + "_" + index,
      name,
      purchasePrice: train?.price ?? null,
      maxSpeedKmh: speed,
      image: train?.image ?? null,
      legacy: {
        index,
        originalSpeed,
        originalLocation: Array.isArray(train?.location) ? train.location : null
      },
      anomalies
    });
  });

  // ---- Final report statistics ----
  report.stations.unique = stations.length;
  report.stations.sharedAcrossRoutes =
    stations.filter(s => s.routeIds.length > 1).length;
  report.stations.repeatedNamesAcrossCoordinates =
    [...stationNameOccurrences.values()].filter(set => set.size > 1).length;
  report.trackSections.count = trackSections.length;
  report.legacyServices.count = legacyServices.length;
  report.trainTypes.count = trainTypeOutput.length;

  const stationNameCollisions = {};
  for (const [name, coords] of stationNameOccurrences.entries()) {
    if (coords.size > 1) stationNameCollisions[name] = [...coords];
  }

  report.stationNameCollisions = stationNameCollisions;

  writeJson(path.join(OUT, "stations.json"), {
    version: 1,
    source: "game.html",
    identityRule: "coordinate",
    stations
  });

  writeJson(path.join(OUT, "routes.json"), {
    version: 1,
    source: "game.html",
    routes
  });

  writeJson(path.join(OUT, "track-sections.json"), {
    version: 1,
    source: "game.html",
    trackSections
  });

  writeJson(path.join(OUT, "train-types.json"), {
    version: 1,
    source: "game.html",
    trainTypes: trainTypeOutput
  });

  writeJson(path.join(OUT, "legacy-services.json"), {
    version: 1,
    source: "game.html",
    services: legacyServices
  });

  writeJson(path.join(OUT, "migration-report.json"), {
    version: 1,
    ...report
  });

  console.log(JSON.stringify({
    ok: true,
    source: "game.html",
    routes: routes.length,
    stations: stations.length,
    trackSections: trackSections.length,
    legacyServices: legacyServices.length,
    trainTypes: trainTypeOutput.length,
    sharedStations: report.stations.sharedAcrossRoutes,
    stationNameCollisions: report.stations.repeatedNamesAcrossCoordinates,
    t679: report.trainTypes.correctedLegacyValues
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error("IMPORT FAILED:", error.message);
  process.exit(1);
}
