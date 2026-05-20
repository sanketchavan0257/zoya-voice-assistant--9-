/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Power, Globe, Sparkles, MessageCircle } from 'lucide-react';
import { AudioStreamer } from './lib/audio-streamer';
import { LiveSession, SessionState } from './lib/live-session';

export default function App() {
  const [state, setState] = useState<SessionState>(SessionState.DISCONNECTED);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);

  // Initialize AudioStreamer and Session
  useEffect(() => {
    audioStreamerRef.current = new AudioStreamer();
    
    // In this environment, GEMINI_API_KEY is available via process.env
    const apiKey = process.env.GEMINI_API_KEY || '';
    
    sessionRef.current = new LiveSession(
      apiKey,
      (newState) => {
        setState(newState);
        if (newState === SessionState.CONNECTED || newState === SessionState.LISTENING) {
          setErrorMessage(null);
        }
      },
      audioStreamerRef.current,
      (err) => setErrorMessage(err)
    );

    return () => {
      sessionRef.current?.disconnect();
    };
  }, []);

  const handleToggle = async () => {
    setErrorMessage(null);
    if (state === SessionState.DISCONNECTED) {
      if (audioStreamerRef.current) {
        await audioStreamerRef.current.resumeContext();
      }
      try {
        await sessionRef.current?.connect();
      } catch (error: any) {
        setErrorMessage(error.message || "Failed to connect.");
      }
    } else {
      await sessionRef.current?.disconnect();
    }
  };

  const getStatusColor = () => {
    switch (state) {
      case SessionState.CONNECTING: return 'text-yellow-400';
      case SessionState.CONNECTED: return 'text-blue-400';
      case SessionState.LISTENING: return 'text-green-400';
      case SessionState.SPEAKING: return 'text-pink-400';
      default: return 'text-gray-500';
    }
  };

  const getOrbGlow = () => {
    switch (state) {
      case SessionState.CONNECTING: return 'shadow-[0_0_50px_rgba(250,204,21,0.3)]';
      case SessionState.CONNECTED: return 'shadow-[0_0_50px_rgba(96,165,250,0.3)]';
      case SessionState.LISTENING: return 'shadow-[0_0_60px_rgba(74,222,128,0.5)]';
      case SessionState.SPEAKING: return 'shadow-[0_0_80px_rgba(244,114,182,0.6)]';
      default: return 'shadow-[0_0_20px_rgba(255,255,255,0.1)]';
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-between p-8 font-sans overflow-hidden">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-pink-600 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="z-10 flex flex-col items-center gap-2">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md"
        >
          <Sparkles className="w-4 h-4 text-pink-400" />
          <span className="text-sm font-medium tracking-widest uppercase">Zoya AI • Live</span>
        </motion.div>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.5 }}
          className="text-xs uppercase tracking-[0.3em] font-mono"
        >
          {state.toUpperCase()}
        </motion.p>
      </header>

      {/* Central Visualizer */}
      <main className="z-10 flex flex-col items-center gap-12 w-full max-w-md">
        <div className="relative group">
          {/* Animated Rings */}
          <AnimatePresence>
            {(state === SessionState.LISTENING || state === SessionState.SPEAKING) && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1.5, opacity: 0.1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                className="absolute inset-0 border-2 border-pink-500 rounded-full"
              />
            )}
          </AnimatePresence>

          {/* Main Orb Button */}
          <motion.button
            id="mic-button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleToggle}
            className={`
              relative z-20 w-48 h-48 rounded-full flex items-center justify-center
              transition-all duration-700 ease-in-out
              ${state === SessionState.DISCONNECTED ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-800 border-zinc-700'}
              border-4 ${getOrbGlow()}
            `}
          >
            <div className={`absolute inset-2 rounded-full opacity-10 blur-xl ${getStatusColor().replace('text-', 'bg-')}`} />
            
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
            
            {state === SessionState.DISCONNECTED ? (
              <Power className="w-16 h-16 text-zinc-600 transition-colors group-hover:text-pink-500" />
            ) : (
              <div className="flex flex-col items-center gap-3">
                <motion.div
                  animate={state === SessionState.SPEAKING ? {
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 1, 0.5]
                  } : {}}
                  transition={{ repeat: Infinity, duration: 1 }}
                >
                  {state === SessionState.LISTENING ? 
                    <Mic className={`w-16 h-16 ${getStatusColor()}`} /> : 
                    <MessageCircle className={`w-16 h-16 ${getStatusColor()}`} />
                  }
                </motion.div>
              </div>
            )}
          </motion.button>
        </div>

        <div className="text-center space-y-4">
          <motion.h2 
            key={state}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-xl font-light tracking-tight ${getStatusColor()}`}
          >
            {state === SessionState.DISCONNECTED && "Ready to talk?"}
            {state === SessionState.CONNECTING && "Waking her up..."}
            {state === SessionState.CONNECTED && "She's here."}
            {state === SessionState.LISTENING && "Tell her anything..."}
            {state === SessionState.SPEAKING && "Zoya is teasing you..."}
          </motion.h2>

          <div className="text-zinc-500 text-sm max-w-[280px] mx-auto font-light leading-relaxed">
            {errorMessage ? (
              <div className="space-y-4 bg-red-950/20 p-5 rounded-2xl border border-red-900/30">
                <span className="text-red-400 font-medium block text-base">{errorMessage}</span>
                
                {(errorMessage.toLowerCase().includes("no microphone found") || 
                  errorMessage.toLowerCase().includes("permission denied") ||
                  errorMessage.toLowerCase().includes("access error")) && (
                  <div className="text-xs text-zinc-400 space-y-3 text-left">
                    <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                      <p className="font-bold text-zinc-200 mb-1">Easiest Fix (Mobile):</p>
                      <p>Tap the <span className="text-pink-400 font-bold">"Open in New Tab"</span> button below. Microphones often don't work inside apps like Instagram or WhatsApp.</p>
                    </div>

                    <ul className="list-disc list-inside space-y-1.5 pl-1">
                      <li>Use Chrome or Safari browser.</li>
                      <li>Tap the <span className="text-white font-bold">🔒 (Lock)</span> icon next to the URL.</li>
                      <li>Set <span className="text-white font-bold">Microphone to "Allow"</span>.</li>
                      <li><span className="text-white font-bold">Refresh</span> the page.</li>
                    </ul>
                    
                    <button 
                      onClick={() => window.open(window.location.href, '_blank')}
                      className="mt-3 w-full py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-pink-600/20 flex items-center justify-center gap-2 active:scale-95"
                    >
                      <Globe className="w-5 h-5" />
                      Open in New Tab
                    </button>
                  </div>
                )}
              </div>
            ) : (
              state === SessionState.DISCONNECTED 
                ? "Zoya is a bit sassy. Tap that power button if you can handle her."
                : "Try asking her to open a website or just tell her about your day."
            )}
          </div>
        </div>
      </main>

      {/* Footer Info / Controls */}
      <footer className="z-10 w-full flex items-center justify-between opacity-40 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-4">
          <Globe className="w-4 h-4" title="Browser Integration Active" />
          <span className="text-[10px] uppercase tracking-widest font-mono">Tools: Enabled</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] uppercase tracking-widest font-mono">v.3.1 LIVE</span>
        </div>
      </footer>

      {/* Mobile-first specific style overrides */}
      <style>{`
        body {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
