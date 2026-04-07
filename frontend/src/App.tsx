import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type DebugInfo = {
  primary_emotion?: string;
  selected_strategy?: string;
  implicit_need?: string;
  crisis_signal_detected?: boolean;
  sentiment_score?: number;
};

type Message = {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  debug?: DebugInfo;
  debugOpen?: boolean;
};

// Icons as SVG components (no dependency)
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
);
const BotIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2zM7.5 13c-.83 0-1.5.67-1.5 1.5S6.67 16 7.5 16s1.5-.67 1.5-1.5S8.33 13 7.5 13zm9 0c-.83 0-1.5.67-1.5 1.5S15.67 16 16.5 16s1.5-.67 1.5-1.5S17.33 13 16.5 13zM22 19H2v2h20v-2z"/></svg>
);
const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
);
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.3s ease' }}><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
);

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const toggleDebug = (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, debugOpen: !m.debugOpen } : m));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: userMsg.text }),
      });
      const data = await res.json();
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: data.response,
        debug: data.debug?.emotion_profile || undefined,
        debugOpen: false,
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: "There was a connection issue. Please try again.",
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: '#131125', color: '#e4dffc', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      {/* Google Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Material+Symbols+Outlined:wght,FILL@400,0..1&display=swap" rel="stylesheet" />

      {/* Ambient background blobs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '55%', height: '55%', background: 'rgba(138,43,226,0.18)', borderRadius: '9999px', filter: 'blur(100px)', animation: 'blob1 8s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-15%', right: '-10%', width: '60%', height: '60%', background: 'rgba(98,37,153,0.16)', borderRadius: '9999px', filter: 'blur(100px)', animation: 'blob2 10s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '30%', right: '15%', width: '30%', height: '30%', background: 'rgba(220,184,255,0.08)', borderRadius: '9999px', filter: 'blur(80px)', animation: 'blob3 12s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '10px', right: '40px', width: '200px', height: '200px', border: '1px solid rgba(138,43,226,0.2)', borderRadius: '9999px', animation: 'pulse 4s ease-in-out infinite', opacity: 0.3 }} />
      </div>

      <style>{`
        @keyframes blob1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-40px) scale(1.08)} 66%{transform:translate(-20px,20px) scale(0.95)} }
        @keyframes blob2 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-20px,30px) scale(1.1)} 66%{transform:translate(30px,-20px) scale(0.92)} }
        @keyframes blob3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-30px,20px) scale(1.06)} }
        @keyframes pulse { 0%,100%{opacity:0.2;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.05)} }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .glass { backdrop-filter: blur(24px); background: rgba(27,25,46,0.7); border: 1px solid rgba(255,255,255,0.05); box-shadow: inset 0 1px 1px rgba(255,255,255,0.08); }
        .glass-high { backdrop-filter: blur(16px); background: rgba(53,50,72,0.5); border: 1px solid rgba(255,255,255,0.07); box-shadow: 0 20px 40px rgba(138,43,226,0.08); }
        .ai-border { border-left: 3px solid #8a2be2; }
        .input-field { background: #0e0c20; border: none; color: #e4dffc; outline: none; transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
        .input-field:focus { background: #1f1d32; box-shadow: 0 0 0 2px rgba(138,43,226,0.3); }
        .input-field::placeholder { color: rgba(152,140,160,0.5); }
        .send-btn { background: linear-gradient(135deg, #dcb8ff, #8a2be2); box-shadow: 0 4px 20px rgba(138,43,226,0.4); transition: all 0.2s; }
        .send-btn:hover { box-shadow: 0 6px 28px rgba(138,43,226,0.6); transform: scale(1.05); }
        .send-btn:active { transform: scale(0.95); }
        .send-btn:disabled { opacity: 0.5; transform: none; cursor: not-allowed; }
        .nav-active { color: #dcb8ff; border-right: 4px solid #8a2be2; background: rgba(53,50,72,0.35); }
        .nav-item { color: rgba(207,194,215,0.6); transition: all 0.25s; border-right: 4px solid transparent; }
        .nav-item:hover { color: #dcb8ff; background: rgba(53,50,72,0.25); }
        .tag-pill { background: rgba(98,37,153,0.3); border: 1px solid rgba(221,183,255,0.15); cursor: pointer; transition: all 0.2s; }
        .tag-pill:hover { background: rgba(98,37,153,0.5); }
        .debug-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
        .debug-row { display: flex; flex-direction: column; gap: 2px; }
        .msg-user { background: #2a273d; border-radius: 18px 18px 4px 18px; }
        .msg-ai { backdrop-filter: blur(20px); background: rgba(53,50,72,0.4); border: 1px solid rgba(255,255,255,0.06); box-shadow: inset 0 1px 1px rgba(255,255,255,0.06); border-left: 3px solid #8a2be2; border-radius: 4px 18px 18px 18px; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(138,43,226,0.3); border-radius: 999px; }
      `}</style>

      {/* Header */}
      <header className="glass" style={{ position: 'fixed', top: 0, width: '100%', zIndex: 50, boxShadow: '0 20px 40px rgba(138,43,226,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 32px', height: '72px', maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '999px', background: 'linear-gradient(135deg, #dcb8ff, #8a2be2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', color: '#480081', boxShadow: '0 4px 16px rgba(138,43,226,0.35)', flexShrink: 0 }}>OA</div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 600, background: 'linear-gradient(90deg, #dcb8ff, #8a2be2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>OpenAimer Space</div>
              <div style={{ fontSize: '9px', color: 'rgba(207,194,215,0.7)', letterSpacing: '0.2em', fontWeight: 500 }}>EMOTIONAL CONTEXT ENGINE</div>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: '28px' }}>
            {['Sanctuary', 'Journals', 'Insights'].map((n, i) => (
              <a key={n} href="#" style={{ color: i === 0 ? '#dcb8ff' : 'rgba(207,194,215,0.6)', textDecoration: 'none', fontSize: '14px', fontWeight: i === 0 ? 600 : 400, borderBottom: i === 0 ? '2px solid #8a2be2' : 'none', paddingBottom: '2px', transition: 'all 0.2s' }}>{n}</a>
            ))}
          </nav>
          <div style={{ width: '40px', height: '40px', borderRadius: '999px', background: 'rgba(53,50,72,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <span style={{ fontFamily: 'Material Symbols Outlined', fontSize: '20px', color: '#dcb8ff' }}>account_circle</span>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside style={{ position: 'fixed', left: 0, top: '72px', height: 'calc(100vh - 72px)', width: '256px', background: 'rgba(27,25,46,0.92)', backdropFilter: 'blur(24px)', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', padding: '32px 16px', zIndex: 40 }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(207,194,215,0.4)', marginBottom: '16px', paddingLeft: '12px' }}>THE OBSERVATORY</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[
            { icon: 'spa', label: 'Sanctuary', active: true },
            { icon: 'auto_stories', label: 'Journals', active: false },
            { icon: 'psychology', label: 'Insights', active: false },
            { icon: 'settings', label: 'Settings', active: false },
          ].map(({ icon, label, active }) => (
            <a key={label} href="#" className={active ? 'nav-active' : 'nav-item'} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '12px', textDecoration: 'none', fontSize: '14px', fontWeight: active ? 600 : 400 }}>
              <span style={{ fontFamily: 'Material Symbols Outlined', fontSize: '20px' }}>{icon}</span>
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div style={{ marginTop: 'auto' }}>
          <button style={{ width: '100%', padding: '14px', borderRadius: '999px', background: 'linear-gradient(135deg, #dcb8ff, #8a2be2)', border: 'none', color: '#2c0051', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 20px rgba(138,43,226,0.35)', transition: 'all 0.2s' }}>
            <span style={{ fontFamily: 'Material Symbols Outlined', fontSize: '18px' }}>add_reaction</span>
            New Reflection
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: '72px', paddingLeft: '256px', position: 'relative', zIndex: 10, height: '100vh' }}>
        <div className="glass" style={{ flex: 1, display: 'flex', flexDirection: 'column', margin: '16px', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '40px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

            {messages.length === 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: '20px' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '24px', background: 'linear-gradient(135deg, rgba(220,184,255,0.15), rgba(138,43,226,0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(138,43,226,0.2)' }}>
                  <span style={{ fontFamily: 'Material Symbols Outlined', fontSize: '36px', color: '#dcb8ff' }}>spa</span>
                </div>
                <h2 style={{ fontSize: '26px', fontWeight: 600, margin: 0, background: 'linear-gradient(135deg, #e4dffc, #dcb8ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Welcome to your Sanctuary.</h2>
                <p style={{ color: 'rgba(207,194,215,0.6)', maxWidth: '380px', lineHeight: 1.7, fontSize: '15px', margin: 0 }}>This space uses a real-time Cognitive Routing Engine. It doesn't just hear your words — it reads what you mean underneath them.</p>
              </motion.div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} style={{ display: 'flex', flexDirection: 'column', alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '72%', alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                  
                  {m.sender === 'ai' && (
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(220,184,255,0.6)', marginBottom: '6px', textTransform: 'uppercase' }}>OpenAimer Space</div>
                  )}

                  <div className={m.sender === 'ai' ? 'msg-ai' : 'msg-user'} style={{ padding: '16px 20px', fontSize: '15px', lineHeight: '1.7', color: '#e4dffc' }}>
                    {m.text}
                  </div>

                  {/* Debug Panel */}
                  {m.sender === 'ai' && m.debug && (
                    <div style={{ marginTop: '8px', minWidth: '260px' }}>
                      <button className="tag-pill" onClick={() => toggleDebug(m.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '999px', fontSize: '10px', fontWeight: 700, color: '#ddb7ff', border: 'none', letterSpacing: '0.05em' }}>
                        <span style={{ fontFamily: 'Material Symbols Outlined', fontSize: '13px' }}>psychology</span>
                        Cognitive Router Insights
                        <ChevronIcon open={!!m.debugOpen} />
                      </button>
                      <AnimatePresence>
                        {m.debugOpen && (
                          <motion.div initial={{ opacity: 0, height: 0, y: -4 }} animate={{ opacity: 1, height: 'auto', y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }} style={{ overflow: 'hidden' }}>
                            <div className="glass-high" style={{ marginTop: '8px', padding: '16px', borderRadius: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', fontSize: '12px' }}>
                              {[
                                { label: 'Emotion', value: m.debug.primary_emotion },
                                { label: 'Strategy', value: m.debug.selected_strategy },
                                { label: 'Implicit Need', value: m.debug.implicit_need },
                                { label: 'Sentiment', value: m.debug.sentiment_score != null ? `${m.debug.sentiment_score}/10` : undefined },
                              ].map(({ label, value }) => value ? (
                                <div key={label}>
                                  <div style={{ color: 'rgba(207,194,215,0.5)', marginBottom: '3px', fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em' }}>{label.toUpperCase()}</div>
                                  <div style={{ color: '#ddb7ff', fontWeight: 500 }}>{value}</div>
                                </div>
                              ) : null)}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Typing indicator */}
            {isLoading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '72%' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(220,184,255,0.6)', marginBottom: '6px', textTransform: 'uppercase' }}>OpenAimer Space</div>
                <div className="msg-ai" style={{ padding: '18px 22px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {[0, 0.18, 0.36].map((delay, i) => (
                    <div key={i} style={{ width: '8px', height: '8px', borderRadius: '9999px', background: '#8a2be2', animation: `bounce 1s ease-in-out ${delay}s infinite` }} />
                  ))}
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div style={{ padding: '24px 40px 28px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <form onSubmit={handleSend} style={{ position: 'relative', maxWidth: '900px', margin: '0 auto' }}>
              <span style={{ fontFamily: 'Material Symbols Outlined', position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', fontSize: '20px', color: 'rgba(152,140,160,0.5)', pointerEvents: 'none' }}>sentiment_satisfied</span>
              <input
                className="input-field"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="What's on your mind?"
                disabled={isLoading}
                style={{ width: '100%', padding: '17px 70px 17px 54px', borderRadius: '999px', fontSize: '15px', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }}
              />
              <button type="submit" className="send-btn" disabled={!input.trim() || isLoading} style={{ position: 'absolute', right: '6px', top: '6px', bottom: '6px', padding: '0 22px', borderRadius: '999px', border: 'none', color: '#2c0051', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700, fontSize: '14px' }}>
                <SendIcon />
              </button>
            </form>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '14px' }}>
              {[['verified_user', 'Encrypted Connection'], ['auto_awesome', 'Real-time Empathy Engine Active'], ['memory', 'Graph Memory Active']].map(([icon, label]) => (
                <span key={label} style={{ fontSize: '10px', color: 'rgba(207,194,215,0.35)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontFamily: 'Material Symbols Outlined', fontSize: '12px' }}>{icon}</span>{label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
