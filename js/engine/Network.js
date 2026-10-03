export class Network {
  constructor() {
    this.stations = new Map();
    this.routes = new Map();
    this.trackSections = new Map();
  }

  loadDemoRoute(route) {
    this.routes.set(route.id, route);
    for (const station of route.stops) {
      this.stations.set(station.id, station);
    }

    for (let i = 1; i < route.stops.length; i++) {
      const from = route.stops[i - 1];
      const to = route.stops[i];
      this.trackSections.set(`${route.id}__${i}`, {
        id: `${route.id}__${i}`,
        routeId: route.id,
        sequence: i - 1,
        fromStationId: from.id,
        toStationId: to.id
      });
    }
  }

  getStation(id) {
    return this.stations.get(id);
  }

  getRoute(id) {
    return this.routes.get(id);
  }

  get routeCount() {
    return this.routes.size;
  }

  get stationCount() {
    return this.stations.size;
  }

  get trackSectionCount() {
    return this.trackSections.size;
  }
}
