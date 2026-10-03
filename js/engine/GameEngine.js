import { Network } from "./Network.js";
import { SimulationClock } from "./SimulationClock.js";

export class GameEngine {
  constructor() {
    this.network = new Network();
    this.clock = new SimulationClock({ speed: 60 });
    this.state = "created";
    this.startedAt = null;
    this.events = [];
  }

  async loadDemo() {
    const response = await fetch("./data/demo-route-198.json");
    if (!response.ok) throw new Error(`Demo network load failed: ${response.status}`);
    const data = await response.json();
    this.network.loadDemoRoute(data.route);
    this.state = "ready";
    this.events.push({ type: "network-loaded", routeId: data.route.id });
    return this;
  }

  start() {
    if (this.state === "running") return;
    this.state = "running";
    this.startedAt = Date.now();
    this.clock.start();
    this.events.push({ type: "engine-started" });
  }

  pause() {
    this.clock.stop();
    this.state = "paused";
  }

  setSpeed(speed) {
    this.clock.setSpeed(speed);
  }

  snapshot() {
    return {
      state: this.state,
      simulationSeconds: Math.round(this.clock.elapsedSeconds),
      speed: this.clock.speed,
      network: {
        stations: this.network.stationCount,
        routes: this.network.routeCount,
        trackSections: this.network.trackSectionCount
      }
    };
  }
}
