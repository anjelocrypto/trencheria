import { useState, useRef, useEffect } from 'react';
import { ChatMessage, EMOTES } from './types';
import { setInputFocused } from '../systems/InputSystem';
import { censorText } from '../utils/profanityFilter';

interface Props {
  messages: ChatMessage[];
  onSendChat: (text: string) => void;
  onSendEmote: (emote: string) => void;
  displayName: string;
}

export function ChatPanel({ messages, onSendChat, onSendEmote, displayName }: Props) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [showEmotes, setShowEmotes] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input focus state with InputSystem to block game controls
  useEffect(() => {
    setInputFocused(open);
    return () => setInputFocused(false);
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Global key handler for opening chat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' && !open) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.code === 'Escape' && open) {
        setOpen(false);
        setShowEmotes(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Rate limiting: max 3 messages per 5 seconds
  const sendTimestamps = useRef<number[]>([]);
  const RATE_LIMIT_WINDOW = 5000;
  const RATE_LIMIT_MAX = 3;

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    // Rate limit check
    const now = Date.now();
    sendTimestamps.current = sendTimestamps.current.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (sendTimestamps.current.length >= RATE_LIMIT_MAX) {
      return; // silently drop — avoid spamming error messages too
    }
    sendTimestamps.current.push(now);

    onSendChat(censorText(text));
    setInput('');
  };

  const recentMessages = messages.slice(-20);

  return (
    <div className="fixed bottom-44 left-4 z-40 pointer-events-auto" style={{ width: 320 }}>
      {/* Message history (always visible, faded) */}
      <div ref={scrollRef} className="overflow-y-auto mb-1 space-y-0.5"
        style={{ maxHeight: open ? 200 : 80, opacity: open ? 1 : 0.6 }}>
        {recentMessages.map(msg => (
          <div key={msg.id} className="text-xs font-mono px-2 py-0.5 rounded"
            style={{
              background: 'rgba(0,0,0,0.5)',
              color: msg.type === 'system' ? '#aaa' : msg.type === 'emote' ? '#ffa' : '#fff',
            }}>
            {msg.type === 'system' ? (
              <span style={{ fontStyle: 'italic' }}>{msg.text}</span>
            ) : msg.type === 'emote' ? (
              <span>{msg.displayName} {EMOTES[msg.text] || msg.text}</span>
            ) : (
              <span><strong style={{ color: '#7af' }}>{msg.displayName}:</strong> {msg.text}</span>
            )}
          </div>
        ))}
      </div>

      {/* Input bar */}
      {open && (
        <div className="flex gap-1">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') { handleSend(); }
              if (e.key === 'Escape') { setOpen(false); setShowEmotes(false); }
            }}
            onKeyUp={e => e.stopPropagation()}
            placeholder="Type a message..."
            className="flex-1 text-xs px-2 py-1 rounded font-mono outline-none"
            style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', border: '1px solid #444' }}
            maxLength={200}
          />
          <button onClick={() => setShowEmotes(!showEmotes)}
            className="text-xs px-2 py-1 rounded font-mono"
            style={{ background: 'rgba(0,0,0,0.7)', color: '#ff0', border: '1px solid #444' }}>
            😀
          </button>
        </div>
      )}

      {/* Emote picker */}
      {showEmotes && open && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {Object.entries(EMOTES).map(([key, emoji]) => (
            <button key={key}
              onClick={() => { onSendEmote(key); setShowEmotes(false); }}
              className="text-lg px-1 py-0.5 rounded hover:scale-125 transition-transform"
              style={{ background: 'rgba(0,0,0,0.7)', border: '1px solid #444' }}
              title={key}>
              {emoji}
            </button>
          ))}
        </div>
      )}

      {!open && (
        <div className="text-xs font-mono px-2 py-0.5" style={{ color: '#888' }}>
          Press Enter to chat
        </div>
      )}
    </div>
  );
}
