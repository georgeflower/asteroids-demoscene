// Retro arcade sound effects using Web Audio API

// Extend Window interface to include webkit prefix
interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

class SoundEffects {
  private audioContext: AudioContext;
  private thrustOscillator: OscillatorNode | null = null;
  private thrustGain: GainNode | null = null;

  constructor() {
    const windowWithWebkit = window as WindowWithWebkitAudio;
    const AudioContextClass = window.AudioContext || windowWithWebkit.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("AudioContext is not supported in this browser");
    }
    this.audioContext = new AudioContextClass();
  }

  // Shooting sound - short laser beep
  shoot() {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.1);
  }

  // Explosion sound - descending noise burst
  explode() {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();

    oscillator.type = 'sawtooth';
    filter.type = 'lowpass';

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(50, this.audioContext.currentTime + 0.3);

    filter.frequency.setValueAtTime(2000, this.audioContext.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.4, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.3);
  }

  // Thrust sound - continuous white noise rumble
  startThrust() {
    if (this.thrustOscillator) return; // Already playing

    // Create white noise using buffer source
    const bufferSize = this.audioContext.sampleRate * 2;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Fill with random values for white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseSource = this.audioContext.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    // Low-pass filter to make it sound more like engine rumble
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, this.audioContext.currentTime);

    this.thrustGain = this.audioContext.createGain();
    this.thrustGain.gain.setValueAtTime(0.12, this.audioContext.currentTime);

    noiseSource.connect(filter);
    filter.connect(this.thrustGain);
    this.thrustGain.connect(this.audioContext.destination);

    noiseSource.start();
    this.thrustOscillator = noiseSource as unknown as OscillatorNode; // Store reference for stopping
  }

  stopThrust() {
    if (this.thrustOscillator && this.thrustGain) {
      this.thrustGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
      this.thrustOscillator.stop(this.audioContext.currentTime + 0.1);
      this.thrustOscillator = null;
      this.thrustGain = null;
    }
  }

  // UFO sound - oscillating beep
  ufoBeep() {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.05);
    oscillator.frequency.setValueAtTime(400, this.audioContext.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.15);
  }

  // Small explosion for small asteroids
  smallExplode() {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = 'sawtooth';
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(40, this.audioContext.currentTime + 0.15);

    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.15);
  }

  // Warp charge sound - subtle ascending tone before teleport
  warpCharge() {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.12, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.35);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.35);
  }

  // Power-up collection - bright ascending arpeggio chime
  powerUp() {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      const t = this.audioContext.currentTime + i * 0.07;
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
