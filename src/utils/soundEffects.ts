// Retro arcade sound effects using Web Audio API

// Extend Window interface to include webkit prefix
interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

class SoundEffects {
  private audioContext: AudioContext | null = null;
  private thrustOscillator: AudioScheduledSourceNode | null = null;
  private thrustGain: GainNode | null = null;

  private getContext(): AudioContext {
    if (!this.audioContext) {
      const windowWithWebkit = window as WindowWithWebkitAudio;
      const AudioContextClass = window.AudioContext || windowWithWebkit.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("AudioContext is not supported in this browser");
      }
      this.audioContext = new AudioContextClass();
    }
    return this.audioContext;
  }

  // Shooting sound - short laser beep
  shoot() {
    const ctx = this.getContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.1);
  }

  // Explosion sound - descending noise burst
  explode() {
    const ctx = this.getContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    oscillator.type = 'sawtooth';
    filter.type = 'lowpass';

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(200, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.3);

    filter.frequency.setValueAtTime(2000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  }

  // Thrust sound - continuous white noise rumble
  startThrust() {
    if (this.thrustOscillator) return; // Already playing

    const ctx = this.getContext();
    // Create white noise using buffer source
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Fill with random values for white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    // Low-pass filter to make it sound more like engine rumble
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, ctx.currentTime);

    this.thrustGain = ctx.createGain();
    this.thrustGain.gain.setValueAtTime(0.12, ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(this.thrustGain);
    this.thrustGain.connect(ctx.destination);

    noiseSource.start();
    this.thrustOscillator = noiseSource;
  }

  stopThrust() {
    if (this.thrustOscillator && this.thrustGain) {
      const ctx = this.getContext();
      this.thrustGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      this.thrustOscillator.stop(ctx.currentTime + 0.1);
      this.thrustOscillator = null;
      this.thrustGain = null;
    }
  }

  // UFO sound - oscillating beep
  ufoBeep() {
    const ctx = this.getContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(400, ctx.currentTime);
    oscillator.frequency.setValueAtTime(600, ctx.currentTime + 0.05);
    oscillator.frequency.setValueAtTime(400, ctx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.15);
  }

  // Small explosion for small asteroids
  smallExplode() {
    const ctx = this.getContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sawtooth';
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(150, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.15);
  }

  // Warp charge sound - subtle ascending tone before teleport
  warpCharge() {
    const ctx = this.getContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(200, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.35);
  }

  // Power-up collection - bright ascending arpeggio chime
  powerUp() {
    const ctx = this.getContext();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.07;
      oscillator.frequency.setValueAtTime(freq, t);
      gainNode.gain.setValueAtTime(0.001, t);
      gainNode.gain.linearRampToValueAtTime(0.3, t + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      oscillator.start(t);
      oscillator.stop(t + 0.18);
    });
  }
}

// Singleton instance
export const soundEffects = new SoundEffects();
