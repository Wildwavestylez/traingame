export class SimulationClock {
  constructor({ speed = 1 } = {}) {
    this.speed = speed;
    this.elapsedSeconds = 0;
    this.running = false;
    this.listeners = new Set();
    this._last = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    requestAnimationFrame(this._tick.bind(this));
  }

  stop() {
    this.running = false;
  }

  setSpeed(speed) {
    this.speed = Math.max(0, Number(speed) || 0);
  }

  onTick(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _tick(now) {
    if (!this.running) return;
    const delta = Math.max(0, (now - this._last) / 1000);
    this._last = now;
    this.elapsedSeconds += delta * this.speed;
    for (const listener of this.listeners) listener(this.elapsedSeconds, delta * this.speed);
    requestAnimationFrame(this._tick.bind(this));
  }
}
