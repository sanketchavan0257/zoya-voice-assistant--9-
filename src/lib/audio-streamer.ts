/**
 * AudioStreamer handles microphone input and audio playback for real-time interactions.
 * It manages context at specific sample rates for mic (16kHz) and speaker (24kHz).
 */
export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private micStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private playbackQueue: Int16Array[] = [];
  private isPlaying = false;
  private nextStartTime = 0;

  constructor(
    private micSampleRate = 16000,
    private speakerSampleRate = 24000
  ) {}

  async resumeContext() {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContextClass({ sampleRate: this.speakerSampleRate });
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  async startMic(onAudioData: (base64Data: string) => void) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Your browser does not support high-quality audio features.");
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Your browser blocks microphone access. Please open this app in Chrome or Safari (browser) directly, not inside Instagram or WhatsApp.");
    }

    try {
      // Ensure we have a context. Re-using if it exists to satisfy user gesture rules
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContextClass({ sampleRate: this.micSampleRate });
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Try to get audio stream
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
      } catch (e) {
        console.warn("Retrying with minimal audio constraints...", e);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      // CRITICAL: Check if stopMic was called while waiting for getUserMedia
      if (!this.audioContext) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      this.micStream = stream;
      this.source = this.audioContext.createMediaStreamSource(this.micStream);
      
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = this.float32ToInt16(inputData);
        const base64 = this.arrayBufferToBase64(pcm16.buffer);
        onAudioData(base64);
      };
    } catch (error: any) {
      console.error("AudioStreamer Error:", error);
      this.stopMic();
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        throw new Error("No microphone found. Please check if your mic is connected and enabled.");
      } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new Error("Microphone permission denied. Please click the 'Lock' icon in the URL bar and allow microphone access.");
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        throw new Error("Microphone is already in use by another application.");
      } else {
        throw new Error(`Mic access error: ${error.message}`);
      }
    }
  }

  stopMic() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.micStream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
    this.processor = null;
    this.source = null;
    this.micStream = null;
    this.audioContext = null;
  }

  async play(base64Audio: string) {
    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass({ sampleRate: this.speakerSampleRate });
      }
    }
    
    if (!this.audioContext) return;
    
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const pcm16 = new Int16Array(bytes.buffer);
    this.playbackQueue.push(pcm16);
    
    if (!this.isPlaying) {
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.playbackQueue.length === 0 || !this.audioContext) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const pcm16 = this.playbackQueue.shift()!;
    const float32 = this.int16ToFloat32(pcm16);
    
    const buffer = this.audioContext.createBuffer(1, float32.length, this.speakerSampleRate);
    buffer.getChannelData(0).set(float32);
    
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.start();
    
    source.onended = () => {
      this.processQueue();
    };
  }

  stopPlayback() {
    this.playbackQueue = [];
    this.isPlaying = false;
    this.nextStartTime = 0;
  }

  private float32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  private int16ToFloat32(int16Array: Int16Array): Float32Array {
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 0x8000;
    }
    return float32Array;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}
