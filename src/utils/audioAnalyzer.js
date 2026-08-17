const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Autocorrelation algorithm to detect the fundamental frequency (pitch) of a buffer of audio samples.
 */
export function autoCorrelate(buffer, sampleRate) {
  const SIZE = buffer.length;
  let rms = 0;

  // Calculate root-mean-square (volume energy)
  for (let i = 0; i < SIZE; i++) {
    const val = buffer[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);

  // If there's not enough signal, return -1
  if (rms < 0.008) {
    return { pitch: -1, volume: rms };
  }

  // Clip the signal boundaries to avoid edge artifacts
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = SIZE - 1; i >= SIZE / 2; i--) {
    if (Math.abs(buffer[i]) < thres) {
      r2 = i;
      break;
    }
  }

  const buf = buffer.subarray(r1, r2);
  const len = buf.length;

  if (len < 64) {
    return { pitch: -1, volume: rms }; // Signal too short after clipping
  }

  const correlations = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < len - i; j++) {
      correlations[i] += buf[j] * buf[j + i];
    }
  }

  // Find the first zero-crossing or dip in correlation
  let d = 0;
  while (d < len - 1 && correlations[d] > correlations[d + 1]) {
    d++;
  }

  // Find the peak correlation after the initial dip
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < len; i++) {
    if (correlations[i] > maxval) {
      maxval = correlations[i];
      maxpos = i;
    }
  }

  let T0 = maxpos;

  // Refine peak position using parabolic interpolation
  if (T0 > 0 && T0 < len - 1) {
    const x1 = correlations[T0 - 1];
    const x2 = correlations[T0];
    const x3 = correlations[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a !== 0) {
      T0 = T0 - b / (2 * a);
    }
  }

  const pitch = sampleRate / T0;

  // Limit pitch to human vocal range (roughly 50 Hz to 2000 Hz)
  if (pitch > 50 && pitch < 2000) {
    return { pitch, volume: rms };
  }

  return { pitch: -1, volume: rms };
}

/**
 * Convert a frequency (Hz) to a MIDI note number.
 */
export function noteFromPitch(frequency) {
  const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  return Math.round(noteNum) + 69;
}

/**
 * Get the string representation of a MIDI note.
 */
export function getNoteString(noteNumber) {
  const noteName = NOTE_NAMES[noteNumber % 12];
  const octave = Math.floor(noteNumber / 12) - 1;
  return `${noteName}${octave}`;
}

/**
 * AudioAnalyzerManager manages AudioContext, AnalyserNode, Microphone access and Audio element routing.
 */
export class AudioAnalyzerManager {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.micStream = null;
    this.micSource = null;
    this.audioElement = null;
    this.audioElementSource = null;
    this.dataArray = null;
    this.frequencyArray = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    
    // Create AudioContext
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass();
    
    // Create AnalyserNode
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.84;
    
    const bufferLength = this.analyser.fftSize;
    this.dataArray = new Float32Array(bufferLength);
    this.frequencyArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    this.isInitialized = true;
  }

  async startMic(deviceId = '') {
    this.init();
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Stop any existing stream
    this.stopMic();

    // Get microphone stream
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };

    if (deviceId) {
      audioConstraints.deviceId = { exact: deviceId };
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints
    });

    this.micSource = this.audioContext.createMediaStreamSource(this.micStream);
    
    // Route stream to analyzer
    this.micSource.connect(this.analyser);
    // Note: Do NOT connect micSource to audioContext.destination to avoid feedback squealing!
  }

  stopMic() {
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
  }

  /**
   * Routes an HTMLAudioElement through the analyser.
   * This is used during playback of recordings.
   */
  routeAudioElement(audioElement) {
    this.init();
    
    // If it's already routed, do not route again
    if (this.audioElement === audioElement && this.audioElementSource) {
      return;
    }

    // Clean up previous elements if any
    if (this.audioElementSource) {
      try {
        this.audioElementSource.disconnect();
      } catch (e) {
        console.warn("Failed to disconnect audio source:", e);
      }
    }

    this.audioElement = audioElement;
    this.audioElementSource = this.audioContext.createMediaElementSource(audioElement);
    
    // Connect audio element source to analyser
    this.audioElementSource.connect(this.analyser);
    // Connect analyser to destination (speakers) so user can hear the playback
    this.analyser.connect(this.audioContext.destination);
  }

  getAnalysisData() {
    if (!this.analyser) {
      return {
        pitch: -1,
        volume: 0,
        note: "",
        waveform: [],
        spectrum: [],
        peakFrequency: 0
      };
    }

    this.analyser.getFloatTimeDomainData(this.dataArray);
    this.analyser.getByteFrequencyData(this.frequencyArray);
    const { pitch, volume } = autoCorrelate(this.dataArray, this.audioContext.sampleRate);
    
    let noteString = "";
    if (pitch !== -1) {
      const midiNote = noteFromPitch(pitch);
      noteString = getNoteString(midiNote);
    }

    let peakIndex = 0;
    let peakValue = 0;
    for (let i = 0; i < this.frequencyArray.length; i++) {
      if (this.frequencyArray[i] > peakValue) {
        peakValue = this.frequencyArray[i];
        peakIndex = i;
      }
    }

    const peakFrequency = Math.round((peakIndex * this.audioContext.sampleRate) / this.analyser.fftSize);

    return {
      pitch,
      volume,
      note: noteString,
      waveform: Array.from(this.dataArray),
      spectrum: Array.from(this.frequencyArray),
      peakFrequency
    };
  }

  close() {
    this.stopMic();
    if (this.audioElementSource) {
      this.audioElementSource.disconnect();
    }
    if (this.analyser) {
      this.analyser.disconnect();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.isInitialized = false;
  }
}
