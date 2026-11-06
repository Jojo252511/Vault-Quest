import type { Settings } from "../types";

/** Small synthesised sound effects via Web Audio. No audio files are shipped. */
export class Sounds {
  private ctx: AudioContext | null = null;
  private lastXp = 0;

  constructor(private getSettings: () => Settings) {}

  private audio(): AudioContext | null {
    if (!this.getSettings().sounds) return null;
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.25): void {
    const ctx = this.audio();
    if (!ctx) return;
    const vol = this.getSettings().volume * gain;
    if (vol <= 0) return;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Soft blip; throttled so fast typing doesn't turn into noise. */
  xp(): void {
    if (!this.getSettings().soundXp) return;
    const now = performance.now();
    if (now - this.lastXp < 900) return;
    this.lastXp = now;
    this.tone(1320 + Math.random() * 200, 0, 0.08, "sine", 0.12);
  }

  levelUp(): void {
    if (!this.getSettings().soundLevelUp) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * 0.09, 0.35, "triangle", 0.25));
  }

  achievement(): void {
    if (!this.getSettings().soundAchievement) return;
    this.tone(659.25, 0, 0.18, "triangle", 0.2);
    this.tone(987.77, 0.12, 0.5, "triangle", 0.22);
    this.tone(1318.5, 0.12, 0.5, "sine", 0.12);
  }

  quest(): void {
    if (!this.getSettings().soundAchievement) return;
    this.tone(880, 0, 0.12, "sine", 0.2);
    this.tone(1174.66, 0.08, 0.3, "sine", 0.2);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
