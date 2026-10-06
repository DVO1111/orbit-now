/**
 * Simulation clock. Simulated time advances at `rate` × real time and can be
 * paused, rewound (negative rate) or jumped to any date.
 */
export class SimClock {
  private simAtAnchor: number;
  private realAtAnchor: number;
  private _rate = 1;
  private _paused = false;

  constructor(start: Date = new Date()) {
    this.simAtAnchor = start.getTime();
    this.realAtAnchor = performance.now();
  }

  now(): Date {
    if (this._paused) return new Date(this.simAtAnchor);
    return new Date(this.simAtAnchor + (performance.now() - this.realAtAnchor) * this._rate);
  }

  get rate() {
    return this._rate;
  }

  get paused() {
    return this._paused;
  }

  setRate(rate: number) {
    this.reanchor();
    this._rate = rate;
  }

  setPaused(paused: boolean) {
    this.reanchor();
    this._paused = paused;
  }

  set(date: Date) {
    this.simAtAnchor = date.getTime();
    this.realAtAnchor = performance.now();
  }

  /** Back to the real current time, running at real-time speed. */
  goLive() {
    this._rate = 1;
    this._paused = false;
    this.set(new Date());
  }

  isLive(): boolean {
    return !this._paused && this._rate === 1 && Math.abs(this.now().getTime() - Date.now()) < 5000;
  }

  private reanchor() {
    this.simAtAnchor = this.now().getTime();
    this.realAtAnchor = performance.now();
  }
}
