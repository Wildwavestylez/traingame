import { GameEngine } from "./engine/GameEngine.js";
import { loadRailwayPath } from "./map/RailwayPath.js";

const engine = new GameEngine();
const status = document.querySelector("#engine-status");
const stats = document.querySelector("#stats");
const clock = document.querySelector("#clock");
const routeName = document.querySelector("#route-name");
const stations = document.querySelector("#station-list");
const map = L.map("map").setView([49.13, 13.84], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

L.tileLayer("https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", {
  maxZoom: 19,
  opacity: 0.72,
  attribution: 'Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, Style: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a>'
}).addTo(map);

function stationIcon() {
  return L.divIcon({
    className: "station-marker",
    html: "<span></span>",
    iconSize: [8, 8],
    iconAnchor: [4, 4]
  });
}

const trainIcon = L.divIcon({
  className: "train-marker",
  html: "🚆",
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

function render() {
  const snapshot = engine.snapshot();
  status.textContent = snapshot.state.toUpperCase();
  clock.textContent = `Simulace: ${snapshot.simulationSeconds}s | rychlost ${snapshot.speed}×`;
  stats.textContent = `${snapshot.network.stations} stanic · ${snapshot.network.routes} trasa · ${snapshot.network.trackSections} úseků`;
}

function renderStations(route) {
  stations.innerHTML = "";
  route.stops.forEach((station, index) => {
    const li = document.createElement("li");
    li.textContent = `${String(index + 1).padStart(2, "0")}  ${station.name}`;
    stations.appendChild(li);
  });
}

const demo = await engine.loadDemo();
const route = demo.network.getRoute("route_rat_trakonice_olary");
routeName.textContent = route.name;
renderStations(route);

const stationMarkers = route.stops.map((station, index) =>
  L.marker([station.latitude, station.longitude], {
    icon: stationIcon(),
    keyboard: false,
    title: station.name
  }).bindTooltip(`${index + 1}. ${station.name}`, {
    direction: "top",
    offset: [0, -5]
  })
);

function updateStationVisibility() {
  const zoom = map.getZoom();
  const visible = zoom >= 10;
  stationMarkers.forEach(marker => {
    if (visible && !map.hasLayer(marker)) marker.addTo(map);
    if (!visible && map.hasLayer(marker)) map.removeLayer(marker);
  });
}
updateStationVisibility();
map.on("zoomend", updateStationVisibility);

try {
  const result = await loadRailwayPath(route.stops);
  document.querySelector("#track-status").textContent =
    `Skutečná železniční geometrie načtena · ${result.distanceKm.toFixed(1)} km`;

  const trainMarker = L.marker(result.coordinates[0], {
    icon: trainIcon,
    zIndexOffset: 1000,
    interactive: false
  }).addTo(map);

  const speedKmH = 60;
  const segmentLengths = [];
  let totalKm = 0;
  for (let i = 1; i < result.coordinates.length; i++) {
    const a = result.coordinates[i - 1];
    const b = result.coordinates[i];
    const dx = (b[0] - a[0]) * 111;
    const dy = (b[1] - a[1]) * 70;
    const length = Math.sqrt(dx * dx + dy * dy);
    segmentLengths.push(length);
    totalKm += length;
  }

  engine.clock.onTick(seconds => {
    const cycleSeconds = Math.max(1, totalKm / speedKmH * 3600);
    let targetKm = ((seconds % cycleSeconds) / cycleSeconds) * totalKm;

    for (let i = 1; i < result.coordinates.length; i++) {
      const segmentKm = segmentLengths[i - 1];
      if (targetKm <= segmentKm) {
        const a = result.coordinates[i - 1];
        const b = result.coordinates[i];
        const ratio = segmentKm ? targetKm / segmentKm : 0;
        trainMarker.setLatLng([
          a[0] + (b[0] - a[0]) * ratio,
          a[1] + (b[1] - a[1]) * ratio
        ]);
        break;
      }
      targetKm -= segmentKm;
    }
  });
} catch (error) {
  document.querySelector("#track-status").textContent =
    `Železniční geometrie se nepodařila načíst: ${error.message}`;
  console.error(error);
}

document.querySelector("#start").addEventListener("click", () => engine.start());
document.querySelector("#pause").addEventListener("click", () => engine.pause());
document.querySelector("#speed").addEventListener("input", event => engine.setSpeed(Number(event.target.value)));

engine.clock.onTick(() => render());
render();
