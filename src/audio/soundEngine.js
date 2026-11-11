/**
 * GeoMelody Procedural Sound & Ambient Engine
 * Powered by Web Audio API for 100% reliable, zero-latency, infinitely evolving ambient music & soundscapes.
 */

import { getDemoTrack } from '../data/demoTracks.js';

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.ambientGain = null;
    this.analyser = null;
    this.referenceAudio = null;
    this.referenceAudioSource = null;
    this.currentTrack = null;

    this.isPlaying = false;
    this.isMuted = false;
    this.currentSpot = null;
    this.currentStyle = null;

    // Active nodes & timers
    this.activeMusicNodes = [];
    this.musicTimers = [];
    this.ambientGenerators = {};

    // Volume states (0.0 to 1.0) - Ambient default 0 so pure music plays without background noise
    this.volumes = {
      master: 0.85,
      music: 0.85,
      ambient: 0.0,
      rain: 0.0,
      ocean: 0.0,
      wind: 0.0,
      birds: 0.0,
      campfire: 0.0,
      bell: 0.0
    };

    this.listeners = new Set();
  }

  // Initialize Audio engine on first user interaction
  init() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !this.ctx) {
      try {
        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volumes.master, this.ctx.currentTime);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(this.volumes.music, this.ctx.currentTime);
        this.musicGain.connect(this.masterGain);

        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.setValueAtTime(this.volumes.ambient, this.ctx.currentTime);
        this.ambientGain.connect(this.masterGain);

        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 64;
        this.analyser.smoothingTimeConstant = 0.8;
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      } catch (_) {}
    }

    // Direct, 100% reliable HTML5 Audio element for crystal-clear sound on all devices & platforms
    if (!this.referenceAudio) {
      this.referenceAudio = new Audio();
      this.referenceAudio.preload = 'auto';
      // Let the ended event advance to another soundscape instead of
      // silently restarting the same file.
      this.referenceAudio.loop = false;
      this.syncAudioVolume();

      this.referenceAudio.addEventListener('timeupdate', () => this.handleTimeUpdate());
      this.referenceAudio.addEventListener('loadedmetadata', () => this.handleTimeUpdate());
      this.referenceAudio.addEventListener('durationchange', () => this.handleTimeUpdate());
      this.referenceAudio.addEventListener('ended', () => {
        this.notify('trackEnded', { spot: this.currentSpot, track: this.currentTrack });
      });
      this.referenceAudio.addEventListener('error', (err) => {
        console.warn('[GeoMelody Audio] Audio element notice:', err);
        this.isPlaying = false;
        this.notify('playStateChange', { isPlaying: false, spot: this.currentSpot });
      });
    }

    // Initialize ambient generators
    this.initAmbientGenerators();
  }

  syncAudioVolume() {
    if (!this.referenceAudio) return;
    const targetVol = this.isMuted ? 0 : (this.volumes.master * this.volumes.music);
    this.referenceAudio.volume = Math.max(0, Math.min(1, targetVol));
  }

  handleTimeUpdate() {
    if (!this.referenceAudio) return;
    const currentTime = this.referenceAudio.currentTime || 0;
    const duration = isFinite(this.referenceAudio.duration) ? (this.referenceAudio.duration || 0) : 0;
    const progress = duration > 0 ? currentTime / duration : 0;
    this.notify('timeUpdate', {
      currentTime,
      duration,
      progress,
      spot: this.currentSpot,
      track: this.currentTrack
    });
  }

  getCurrentTime() {
    return this.referenceAudio?.currentTime || 0;
  }

  getDuration() {
    return isFinite(this.referenceAudio?.duration) ? (this.referenceAudio?.duration || 0) : 0;
  }

  seek(timeInSeconds) {
    if (!this.referenceAudio) return;
    const duration = this.getDuration();
    const target = Math.max(0, Math.min(duration || 9999, timeInSeconds));
    try {
      this.referenceAudio.currentTime = target;
      this.handleTimeUpdate();
    } catch (_) {}
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, data) {
    this.listeners.forEach(cb => {
      try {
        cb(event, data);
      } catch (err) {
        console.error('[GeoMelody Audio] Event listener error:', err);
      }
    });
  }

  async resumeContext() {
    if (!this.ctx) this.init();
    if (this.ctx?.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* HTML audio can still play. */ }
    }
  }

  // ==================== Master & Channel Volume ====================
  setMasterVolume(val) {
    this.volumes.master = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volumes.master, this.ctx.currentTime, 0.05);
    }
    this.syncAudioVolume();
    this.notify('volumeChange', { type: 'master', value: this.volumes.master });
  }

  setMusicVolume(val) {
    this.volumes.music = Math.max(0, Math.min(1, val));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.volumes.music, this.ctx.currentTime, 0.05);
    }
    this.syncAudioVolume();
    this.notify('volumeChange', { type: 'music', value: this.volumes.music });
  }

  setAmbientChannelVolume(channel, val) {
    const clamped = Math.max(0, Math.min(1, val));
    this.volumes[channel] = clamped;
    const gen = this.ambientGenerators[channel];
    if (gen && gen.gainNode && this.ctx) {
      gen.gainNode.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.05);
    }
    this.notify('ambientChange', { channel, value: clamped });
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volumes.master, this.ctx.currentTime, 0.05);
    }
    this.syncAudioVolume();
    this.notify('muteChange', { isMuted: this.isMuted });
    return this.isMuted;
  }

  // ==================== Playback Lifecycle ====================
  async playSpot(spot, resetTime = false) {
    const request = this.playRequest = (this.playRequest || 0) + 1;
    // HTML audio is the primary player; a suspended visualizer context must
    // never block the user's Play gesture or consume its activation.
    if (!this.referenceAudio) this.init();
    void this.resumeContext();

    const track = getDemoTrack(spot);
    const isSameSpot = this.currentSpot?.id === spot?.id;
    const isSameTrack = this.currentTrack?.id === track?.id || this.currentTrack?.url === track?.url;

    // If resuming the same spot and track (and resetTime is false), resume from exact paused position!
    if (isSameSpot && isSameTrack && this.referenceAudio && !resetTime && this.referenceAudio.currentTime > 0) {
      const played = await this.playReferenceTrack(track, false);
      if (request !== this.playRequest) return;
      this.isPlaying = played;
      this.notify('playStateChange', { isPlaying: played, spot, track });
      return;
    }

    this.currentSpot = spot;
    this.stopMusic(false);

    const style = spot.audioRecipe?.style || 'lake_zen';
    this.currentStyle = style;
    this.isPlaying = false;
    this.notify('playStateChange', { isPlaying: false, spot, track });

    // Exclusively play user-provided authentic MP3 songs
    const played = await this.playReferenceTrack(track, true);
    if (request !== this.playRequest) return;
    this.isPlaying = played;

    // Keep ambient noise generators completely off
    this.muteAllAmbient();

    this.notify('playStateChange', { isPlaying: played, spot, style, track });
  }

  pause() {
    this.playRequest = (this.playRequest || 0) + 1;
    this.isPlaying = false;
    if (this.referenceAudio) {
      this.referenceAudio.pause();
    }
    this.muteAllAmbient();
    this.notify('playStateChange', { isPlaying: false, spot: this.currentSpot, currentTime: this.getCurrentTime() });
  }

  resume() {
    if (!this.currentSpot) return;
    this.playSpot(this.currentSpot, false);
  }

  togglePlay(spot) {
    if (this.isPlaying) {
      this.pause();
    } else {
      if (spot) {
        this.playSpot(spot, false);
      } else if (this.currentSpot) {
        this.resume();
      }
    }
  }

  stopMusic(resetPosition = true) {
    this.musicTimers.forEach(t => clearTimeout(t));
    this.musicTimers = [];

    this.activeMusicNodes.forEach(node => {
      try {
        if (node.stop) node.stop();
        node.disconnect();
      } catch (e) {}
    });
    this.activeMusicNodes = [];

    if (this.referenceAudio) {
      this.referenceAudio.pause();
      if (resetPosition) {
        try {
          this.referenceAudio.currentTime = 0;
        } catch (_) {}
      }
    }
    if (resetPosition) {
      this.currentTrack = null;
    }
  }

  async playReferenceTrack(track, resetTime = false) {
    const request = this.playRequest;
    if (!track?.url) {
      this.currentTrack = track;
      this.notify('playbackError', { reason: 'missing' });
      return false;
    }
    if (!this.referenceAudio) this.init();

    try {
      this.syncAudioVolume();
      const currentSrc = this.referenceAudio.src || '';
      const isDifferent = !currentSrc.endsWith(track.url) && currentSrc !== track.url;

      if (isDifferent) {
        this.referenceAudio.src = track.url;
        this.referenceAudio.load();
        if (resetTime) {
          this.referenceAudio.currentTime = 0;
        }
      } else if (resetTime) {
        this.referenceAudio.currentTime = 0;
      }

      await this.referenceAudio.play();
      if (request !== this.playRequest) return false;
      this.currentTrack = track;
      this.notify('trackChange', { track, spot: this.currentSpot });
      return true;
    } catch (error) {
      if (request !== this.playRequest) return false;
      if (error.name !== 'AbortError') {
        this.notify('playbackError', { reason: error.name === 'NotAllowedError' ? 'blocked' : 'unavailable' });
      }
      return false;
    }
  }

  applyScenicSoundscape() {
    // Ambient background white noise is completely disabled
    this.muteAllAmbient();
  }

  muteAllAmbient() {
    Object.keys(this.ambientGenerators).forEach(key => {
      const gen = this.ambientGenerators[key];
      if (gen && gen.gainNode && this.ctx) {
        gen.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      }
    });
  }

  // Legacy procedural engines disabled to prioritize authentic songs
  startMusicStyle() {}

  // 1. 江南古风 · 五声音阶古筝与笛韵 (Pentatonic Guzheng & Bamboo Flute)
  playGuzhengRainEngine() {
    const scale = [220.00, 246.94, 277.18, 329.63, 369.99, 440.00, 493.88, 554.37, 659.25, 739.99, 880.00]; // Pentatonic Gong/Yu scale
    const baseBass = 110.0;

    // Warm underlying drone pad
    this.createPad([baseBass, baseBass * 1.5, baseBass * 2], 0.15, 'triangle', 450);

    // Generative Guzheng plucking loop
    const schedulePluck = () => {
      if (!this.isPlaying || this.currentStyle !== 'guzheng_rain') return;
      const freq = scale[Math.floor(Math.random() * scale.length)];
      const velocity = 0.15 + Math.random() * 0.15;
      this.synthesizePluck(freq, velocity, 1.8);

      // Chance of grace note / rapid ornamentation
      if (Math.random() > 0.6) {
        const graceTimer = setTimeout(() => {
          if (!this.isPlaying) return;
          const nextFreq = scale[Math.floor(Math.random() * scale.length)];
          this.synthesizePluck(nextFreq, velocity * 0.7, 1.2);
        }, 180 + Math.random() * 120);
        this.musicTimers.push(graceTimer);
      }

      // Interval between plucks based on tranquil BPM ~ 68
      const nextInterval = 600 + Math.random() * 1400;
      const timer = setTimeout(schedulePluck, nextInterval);
      this.musicTimers.push(timer);
    };

    schedulePluck();
  }

  // 2. 雪山高原 · 432Hz 颂钵与空灵 Drone (Mountain Ambient & Tibetan Bowl)
  playMountainAmbientEngine() {
    // 432Hz harmonic roots
    const rootFreq = 108.0; // 432 / 4
    const padFreqs = [rootFreq, rootFreq * 1.5, rootFreq * 2.0, rootFreq * 2.667];

    this.createPad(padFreqs, 0.22, 'sine', 350, true);

    // Periodic Tibetan Singing Bowl chime
    const scheduleBowl = () => {
      if (!this.isPlaying || this.currentStyle !== 'mountain_ambient') return;
      const bowlRoot = 216.0; // 432 / 2
      this.synthesizeSingingBowl(bowlRoot, 0.25);

      const nextInterval = 5000 + Math.random() * 6000;
      const timer = setTimeout(scheduleBowl, nextInterval);
      this.musicTimers.push(timer);
    };

    scheduleBowl();
  }

  // 3. 热带海岛 · 温暖电钢琴与海浪和弦 (Island Rhodes Chords & Warm Breeze)
  playIslandBreezeEngine() {
    // Soft Major 7th / 9th chord progressions (Fmaj9, Dm9, G13, Cmaj9)
    const chordProgressions = [
      [174.61, 220.00, 261.63, 329.63, 392.00], // Fmaj9
      [146.83, 220.00, 261.63, 329.63, 349.23], // Dm9
      [196.00, 246.94, 293.66, 329.63, 392.00], // G13
      [130.81, 196.00, 246.94, 261.63, 329.63]  // Cmaj9
    ];

    let chordIndex = 0;

    const playNextChord = () => {
      if (!this.isPlaying || this.currentStyle !== 'island_breeze') return;
      const chord = chordProgressions[chordIndex % chordProgressions.length];
      chordIndex++;

      // Arpeggiate chord notes softly
      chord.forEach((freq, idx) => {
        const noteTimer = setTimeout(() => {
          if (!this.isPlaying) return;
          this.synthesizeRhodes(freq, 0.14, 4.0);
        }, idx * 250);
        this.musicTimers.push(noteTimer);
      });

      const timer = setTimeout(playNextChord, 4500);
      this.musicTimers.push(timer);
    };

    playNextChord();
  }

  // 4. 西北大漠 · 苍凉大提琴与马头琴长音 (Desert Strings & Cello Drone)
  playDesertStringsEngine() {
    const root = 73.42; // D2
    const scale = [146.83, 164.81, 174.61, 220.00, 246.94, 261.63, 293.66, 329.63]; // D Aeolian/Minor

    // Low sustained string drone
    this.createPad([root, root * 1.5], 0.2, 'sawtooth', 300);

    // Expressive cello lead melodies
    const scheduleCello = () => {
      if (!this.isPlaying || this.currentStyle !== 'desert_strings') return;
      const freq = scale[Math.floor(Math.random() * scale.length)];
      this.synthesizeCello(freq, 0.18, 3.5);

      const nextInterval = 2800 + Math.random() * 2500;
      const timer = setTimeout(scheduleCello, nextInterval);
      this.musicTimers.push(timer);
    };

    scheduleCello();
  }

  // 5. 森林秘境 · 原声吉他与清脆指弹 (Forest Acoustic Guitar & Ambient Stream)
  playForestGuitarEngine() {
    const chords = [
      [164.81, 246.94, 329.63, 392.00, 493.88], // Em7
      [130.81, 196.00, 261.63, 329.63, 392.00], // Cmaj7
      [196.00, 246.94, 293.66, 392.00, 587.33], // Gadd9
      [146.83, 220.00, 293.66, 369.99, 440.00]  // Dsus4
    ];

    let chordIdx = 0;
    const playGuitarPattern = () => {
      if (!this.isPlaying || this.currentStyle !== 'forest_guitar') return;
      const currentChord = chords[chordIdx % chords.length];
      chordIdx++;

      currentChord.forEach((freq, idx) => {
        const t = setTimeout(() => {
          if (!this.isPlaying) return;
          this.synthesizePluck(freq, 0.16, 2.2, 'triangle');
        }, idx * 300);
        this.musicTimers.push(t);
      });

      const timer = setTimeout(playGuitarPattern, 3200);
      this.musicTimers.push(timer);
    };

    playGuitarPattern();
  }

  // 6. 城市夜景 · Lo-Fi 柔和爵士电钢琴 (City Night Lo-Fi EP & Vinyl)
  playCityLofiEngine() {
    const lofiChords = [
      [174.61, 261.63, 311.13, 392.00], // Fm7
      [155.56, 233.08, 293.66, 349.23], // Ebmaj7
      [130.81, 196.00, 233.08, 293.66], // C7#9
      [146.83, 220.00, 261.63, 329.63]  // Dm7
    ];

    let idx = 0;
    const playLofi = () => {
      if (!this.isPlaying || this.currentStyle !== 'city_lofi') return;
      const chord = lofiChords[idx % lofiChords.length];
      idx++;

      chord.forEach(freq => {
        this.synthesizeRhodes(freq, 0.12, 3.8);
      });

      const timer = setTimeout(playLofi, 4000);
      this.musicTimers.push(timer);
    };

    playLofi();
  }

  // 7. 湖泊湿地 · 纯净禅意水琴 (Lake Zen & Crystal Chimes)
  playLakeZenEngine() {
    const zenScale = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];

    // Gentle glass pad
    this.createPad([130.81, 196.00, 261.63], 0.15, 'sine', 600, true);

    const scheduleZenChime = () => {
      if (!this.isPlaying || (this.currentStyle !== 'lake_zen' && this.currentStyle)) return;
      const freq = zenScale[Math.floor(Math.random() * zenScale.length)];
      this.synthesizeBell(freq, 0.15, 4.5);

      const nextInterval = 1200 + Math.random() * 2200;
      const timer = setTimeout(scheduleZenChime, nextInterval);
      this.musicTimers.push(timer);
    };

    scheduleZenChime();
  }

  // ==================== Synthesizer Instruments ====================

  // Continuous background ambient pad
  createPad(frequencies, gainLevel = 0.15, type = 'sine', cutoff = 500, withLFO = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const padGain = this.ctx.createGain();
    padGain.gain.setValueAtTime(0.001, now);
    padGain.gain.exponentialRampToValueAtTime(gainLevel, now + 3.0);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, now);

    if (withLFO) {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.15, now);
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(cutoff * 0.3, now);
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
      this.activeMusicNodes.push(lfo);
    }

    frequencies.forEach(freq => {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq + (Math.random() - 0.5) * 1.5, now); // slight detune
      osc.connect(filter);
      osc.start();
      this.activeMusicNodes.push(osc);
    });

    filter.connect(padGain);
    padGain.connect(this.musicGain);
    this.activeMusicNodes.push(padGain, filter);
  }

  // Plucked string (Guzheng, Guitar, Harp)
  synthesizePluck(freq, velocity = 0.2, decay = 2.0, type = 'triangle') {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(velocity, now + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    // Filter to simulate body resonance
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3.5, now);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.8, now + decay);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.musicGain);

    osc.start(now);
    osc.stop(now + decay);
  }

  // Electric Piano / Rhodes
  synthesizeRhodes(freq, velocity = 0.15, decay = 3.5) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const fundamental = this.ctx.createOscillator();
    fundamental.type = 'sine';
    fundamental.frequency.setValueAtTime(freq, now);

    const overtone = this.ctx.createOscillator();
    overtone.type = 'triangle';
    overtone.frequency.setValueAtTime(freq * 2, now);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(velocity, now + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    const overtoneGain = this.ctx.createGain();
    overtoneGain.gain.setValueAtTime(0.3, now);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    overtone.connect(overtoneGain);
    overtoneGain.connect(gainNode);
    fundamental.connect(gainNode);
    gainNode.connect(this.musicGain);

    fundamental.start(now);
    overtone.start(now);
    fundamental.stop(now + decay);
    overtone.stop(now + decay);
  }

  // Cello / Bowed Strings with vibrato
  synthesizeCello(freq, velocity = 0.18, duration = 3.5) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    // Vibrato LFO
    const vibrato = this.ctx.createOscillator();
    vibrato.frequency.setValueAtTime(5.0, now);
    const vibratoGain = this.ctx.createGain();
    vibratoGain.gain.setValueAtTime(freq * 0.015, now);
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);
    vibrato.start(now + 0.5); // delayed vibrato for natural expression

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, now);
    filter.Q.setValueAtTime(2.0, now);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(velocity, now + 0.6);
    gainNode.gain.setValueAtTime(velocity * 0.9, now + duration - 0.8);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.musicGain);

    osc.start(now);
    osc.stop(now + duration);
    vibrato.stop(now + duration);
  }

  // Tibetan Singing Bowl with rich partials
  synthesizeSingingBowl(baseFreq, velocity = 0.25) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const partials = [1.0, 2.76, 5.4, 8.9]; // characteristic inharmonic bell ratios
    const decay = 8.0;

    partials.forEach((ratio, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * ratio, now);

      const gain = this.ctx.createGain();
      const pVelocity = (velocity / (i + 1)) * (i === 0 ? 1 : 0.4);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(pVelocity, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (decay / (i * 0.4 + 1)));

      osc.connect(gain);
      gain.connect(this.musicGain);

      osc.start(now);
      osc.stop(now + decay);
    });
  }

  // Zen Bell / Water Chime
  synthesizeBell(freq, velocity = 0.15, decay = 4.0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2.02, now); // subtle shimmer

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(velocity, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.musicGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + decay);
    osc2.stop(now + decay);
  }

  // ==================== 6-Channel Procedural Ambient Soundboard ====================
  initAmbientGenerators() {
    this.ambientGenerators = {
      rain: this.createRainGenerator(),
      ocean: this.createOceanGenerator(),
      wind: this.createWindGenerator(),
      birds: this.createBirdGenerator(),
      campfire: this.createCampfireGenerator(),
      bell: this.createBellGenerator()
    };
  }

  // 1. Rain (Pink Noise + Lowpass + Bandpass)
  createRainGenerator() {
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
    gainNode.connect(this.ambientGain);

    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2) * 0.15;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, this.ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    whiteNoise.start();

    return { gainNode };
  }

  // 2. Ocean Waves (Low Noise modulated with 0.1Hz LFO)
  createOceanGenerator() {
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
    gainNode.connect(this.ambientGain);

    const bufferSize = this.ctx.sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350, this.ctx.currentTime);

    // Wave swell LFO
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.08, this.ctx.currentTime); // 12.5s wave period
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(250, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    noise.connect(filter);
    filter.connect(gainNode);
    noise.start();

    return { gainNode };
  }

  // 3. Mountain Wind (Resonant Bandpass filter with slow sweeping frequency)
  createWindGenerator() {
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
    gainNode.connect(this.ambientGain);

    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.2;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, this.ctx.currentTime);
    filter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(220, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    noise.connect(filter);
    filter.connect(gainNode);
    noise.start();

    return { gainNode };
  }

  // 4. Forest Birdsong (Random frequency modulated chirps)
  createBirdGenerator() {
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
    gainNode.connect(this.ambientGain);

    const scheduleChirp = () => {
      if (this.ctx && this.volumes.birds > 0.05 && this.isPlaying) {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();

        const baseF = 2400 + Math.random() * 1200;
        osc.frequency.setValueAtTime(baseF, now);
        osc.frequency.exponentialRampToValueAtTime(baseF * 1.4, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(baseF * 0.9, now + 0.16);

        bGain.gain.setValueAtTime(0.001, now);
        bGain.gain.linearRampToValueAtTime(0.15, now + 0.04);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(bGain);
        bGain.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.2);
      }
      setTimeout(scheduleChirp, 2000 + Math.random() * 4500);
    };

    scheduleChirp();
    return { gainNode };
  }

  // 5. Campfire (Sub-bass rumble + random crackle pulses)
  createCampfireGenerator() {
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
    gainNode.connect(this.ambientGain);

    const scheduleCrackle = () => {
      if (this.ctx && this.volumes.campfire > 0.05 && this.isPlaying) {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const cGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80 + Math.random() * 300, now);

        cGain.gain.setValueAtTime(0.2, now);
        cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        osc.connect(cGain);
        cGain.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.04);
      }
      setTimeout(scheduleCrackle, 100 + Math.random() * 400);
    };

    scheduleCrackle();
    return { gainNode };
  }

  // 6. Zen Chimes / Temple Bell (Periodic deep harmonic chime)
  createBellGenerator() {
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
    gainNode.connect(this.ambientGain);

    const scheduleZenBell = () => {
      if (this.ctx && this.volumes.bell > 0.05 && this.isPlaying) {
        const now = this.ctx.currentTime;
        const root = 196.0; // G3
        [1, 2.01, 3.02, 4.1].forEach((mult, i) => {
          const osc = this.ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(root * mult, now);
          const pGain = this.ctx.createGain();
          pGain.gain.setValueAtTime(0.12 / (i + 1), now);
          pGain.gain.exponentialRampToValueAtTime(0.0001, now + 5.0 / (i + 1));
          osc.connect(pGain);
          pGain.connect(gainNode);
          osc.start(now);
          osc.stop(now + 6.0);
        });
      }
      setTimeout(scheduleZenBell, 8000 + Math.random() * 8000);
    };

    scheduleZenBell();
    return { gainNode };
  }

  // ==================== Audio Wave Visualizer Data ====================
  getVisualizerData() {
    if (!this.analyser) return new Uint8Array(32);
    const buffer = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buffer);
    return buffer;
  }
}

export const soundEngine = new SoundEngine();
