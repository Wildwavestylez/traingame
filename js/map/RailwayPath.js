const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

const toRad = value => value * Math.PI / 180;

function distanceKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

class MinHeap {
  constructor() { this.items = []; }
  push(item, priority) {
    this.items.push({ item, priority });
    let i = this.items.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.items[p].priority <= priority) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }
  pop() {
    if (!this.items.length) return null;
    const root = this.items[0];
    const last = this.items.pop();
    if (this.items.length) {
      this.items[0] = last;
      let i = 0;
      while (true) {
        const l = i * 2 + 1, r = l + 1;
        let smallest = i;
        if (l < this.items.length && this.items[l].priority < this.items[smallest].priority) smallest = l;
        if (r < this.items.length && this.items[r].priority < this.items[smallest].priority) smallest = r;
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
        i = smallest;
      }
    }
    return root;
  }
  get size() { return this.items.length; }
}

function graphFromWays(elements) {
  const nodes = new Map();
  const edges = new Map();

  const addNode = (id, lat, lon) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, lat, lon });
      edges.set(id, []);
    }
  };

  for (const way of elements) {
    if (!way.geometry || way.geometry.length < 2) continue;
    for (const point of way.geometry) {
      addNode(point.id ?? `${way.id}:${point.lat}:${point.lon}`, point.lat, point.lon);
    }
    for (let i = 1; i < way.geometry.length; i++) {
      const a = way.geometry[i - 1];
      const b = way.geometry[i];
      const aId = a.id ?? `${way.id}:${a.lat}:${a.lon}`;
      const bId = b.id ?? `${way.id}:${b.lat}:${b.lon}`;
      const weight = distanceKm(nodes.get(aId), nodes.get(bId));
      edges.get(aId).push({ to: bId, weight });
      edges.get(bId).push({ to: aId, weight });
    }
  }

  return { nodes, edges };
}

function nearestNode(graph, station, maxDistanceKm = 2) {
  let best = null;
  let bestDistance = Infinity;
  for (const node of graph.nodes.values()) {
    const d = distanceKm({ lat: station.latitude, lon: station.longitude }, node);
    if (d < bestDistance) {
      bestDistance = d;
      best = node;
    }
  }
  if (!best || bestDistance > maxDistanceKm) {
    throw new Error(`No railway node within ${maxDistanceKm} km of ${station.name}`);
  }
  return best;
}

function shortestPath(graph, startId, endId) {
  const heap = new MinHeap();
  const distances = new Map([[startId, 0]]);
  const previous = new Map();
  heap.push(startId, 0);

  while (heap.size) {
    const current = heap.pop();
    if (current.item === endId) break;
    if (current.priority !== distances.get(current.item)) continue;

    for (const edge of graph.edges.get(current.item) || []) {
      const candidate = current.priority + edge.weight;
      if (candidate < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, candidate);
        previous.set(edge.to, current.item);
        heap.push(edge.to, candidate);
      }
    }
  }

  if (!distances.has(endId)) return null;

  const ids = [];
  let current = endId;
  while (current !== undefined) {
    ids.push(current);
    if (current === startId) break;
    current = previous.get(current);
  }
  if (ids[ids.length - 1] !== startId) return null;
  return ids.reverse().map(id => graph.nodes.get(id));
}

export async function loadRailwayPath(stations) {
  const lats = stations.map(s => s.latitude);
  const lons = stations.map(s => s.longitude);
  const south = Math.min(...lats) - 0.02;
  const north = Math.max(...lats) + 0.02;
  const west = Math.min(...lons) - 0.03;
  const east = Math.max(...lons) + 0.03;

  const query = `[out:json][timeout:30];way["railway"="rail"](${south},${west},${north},${east});out geom;`;
  let data = null;
  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
      data = await response.json();
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!data) throw lastError || new Error("Unable to load railway geometry");

  const graph = graphFromWays(data.elements.filter(e => e.type === "way"));
  const path = [];

  for (let i = 1; i < stations.length; i++) {
    const start = nearestNode(graph, stations[i - 1]);
    const end = nearestNode(graph, stations[i]);
    const segment = shortestPath(graph, start.id, end.id);
    if (!segment) throw new Error(`No railway path between ${stations[i - 1].name} and ${stations[i].name}`);
    if (!path.length) path.push(...segment);
    else path.push(...segment.slice(1));
  }

  return {
    coordinates: path.map(p => [p.lat, p.lon]),
    distanceKm: path.slice(1).reduce((sum, p, i) => sum + distanceKm(path[i], p), 0),
    source: "OpenStreetMap / Overpass API"
  };
}
