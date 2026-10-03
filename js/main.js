import { GameEngine } from "./engine/GameEngine.js";

const engine = new GameEngine();
const status = document.querySelector("#engine-status");
const stats = document.querySelector("#stats");
const clock = document.querySelector("#clock");
const routeName = document.querySelector("#route-name");
const stations = document.querySelector("#station-list");

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
routeName.textContent = demo.network.getRoute("route_rat_trakonice_olary").name;
renderStations(demo.network.getRoute("route_rat_trakonice_olary"));

const map = L.map("map").setView([49.13, 13.84], 11);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const points = demo.network.getRoute("route_rat_trakonice_olary").stops.map(s => [s.latitude, s.longitude]);
L.polyline(points, { weight: 5 }).addTo(map);
demo.network.getRoute("route_rat_trakonice_olary").stops.forEach((station, index) => {
  L.marker([station.latitude, station.longitude])
    .addTo(map)
    .bindPopup(`<strong>${index + 1}. ${station.name}</strong>`);
});

document.querySelector("#start").addEventListener("click", () => {
  engine.start();
});

document.querySelector("#pause").addEventListener("click", () => {
  engine.pause();
});

document.querySelector("#speed").addEventListener("input", event => {
  engine.setSpeed(Number(event.target.value));
});

engine.clock.onTick(() => render());
render();
