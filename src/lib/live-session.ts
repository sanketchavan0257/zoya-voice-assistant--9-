import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";
import { AudioStreamer } from "./audio-streamer";

export enum SessionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  LISTENING = "listening",
  SPEAKING = "speaking"
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private state: SessionState = SessionState.DISCONNECTED;
  private onStateChange: (state: SessionState) => void;
  private onError?: (error: string) => void;
  private audioStreamer: AudioStreamer;

  constructor(
    _apiKey: string, // Not used directly in client anymore, but keeping signature for now
    onStateChange: (state: SessionState) => void,
    audioStreamer: AudioStreamer,
    onError?: (error: string) => void
  ) {
    this.onStateChange = onStateChange;
    this.audioStreamer = audioStreamer;
    this.onError = onError;
  }

  private setState(state: SessionState) {
    this.state = state;
    this.onStateChange(state);
  }

  async connect() {
    if (this.ws) return;

    this.setState(SessionState.CONNECTING);

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      this.ws = new WebSocket(`${protocol}//${host}/ws/live`);

      this.ws.onopen = () => {
        console.log("WebSocket connected to proxy");
      };

      this.ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        
        switch (msg.type) {
          case "open":
            console.log("Live session opened via proxy");
            this.setState(SessionState.CONNECTED);
            this.startMic();
            break;
          case "message":
            this.handleMessage(msg.data);
            break;
          case "error":
            console.error("Live session error from proxy:", msg.message);
            this.onError?.(`Live session error: ${msg.message}`);
            this.disconnect();
            break;
          case "close":
            console.log("Live session closed via proxy");
            this.disconnect();
            break;
        }
      };

      this.ws.onclose = () => {
        console.log("WebSocket connection closed");
        this.disconnect();
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.onError?.("WebSocket connection failed.");
        this.disconnect();
      };

    } catch (error: any) {
      console.error("Failed to connect to proxy:", error);
      this.setState(SessionState.DISCONNECTED);
      this.onError?.(`Connection failed: ${error.message || "Network error"}`);
      throw error;
    }
  }

  private async startMic() {
    try {
      await this.audioStreamer.startMic((base64) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && this.state !== SessionState.DISCONNECTED) {
          this.ws.send(JSON.stringify({
            type: "input",
            data: {
              audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
            }
          }));
        }
      });
      this.setState(SessionState.LISTENING);
    } catch (error: any) {
      console.error("Mic start error:", error);
      this.onError?.(error.message || "Microphone access failed.");
      this.disconnect();
    }
  }

  private async handleMessage(message: any) {
    // Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      this.setState(SessionState.SPEAKING);
      await this.audioStreamer.play(base64Audio);
    }

    // Handle Interruption
    if (message.serverContent?.interrupted) {
      console.log("Interrupted");
      this.audioStreamer.stopPlayback();
      this.setState(SessionState.LISTENING);
    }

    // Handle End of turn (listening again)
    if (message.serverContent?.turnComplete) {
       this.setState(SessionState.LISTENING);
    }

    // Handle Tool Calls
    const toolCalls = message.toolCall?.functionCalls;
    if (toolCalls) {
      const responses: any[] = [];
      for (const call of toolCalls) {
        if (call.name === "launchAppOrWebsite") {
          const url = (call.args as any).url;
          const name = (call.args as any).name;
          window.open(url, "_blank");
          
          responses.push({
            name: "launchAppOrWebsite",
            response: { success: true, message: `Launched ${name} via ${url}` },
            id: call.id,
          });
        }
        
        if (call.name === "sendWhatsAppMessage") {
          const { phoneNumber, message: text } = call.args as any;
          const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(text)}`;
          window.open(url, "_blank");
          
          responses.push({
            name: "sendWhatsAppMessage",
            response: { success: true, message: `WhatsApp chat opened for ${phoneNumber}` },
            id: call.id,
          });
        }
      }

      if (responses.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: "toolResponse",
          data: { functionResponses: responses }
        }));
      }
    }
  }

  async disconnect() {
    this.ws?.close();
    this.ws = null;
    this.audioStreamer.stopMic();
    this.audioStreamer.stopPlayback();
    this.setState(SessionState.DISCONNECTED);
  }
}
