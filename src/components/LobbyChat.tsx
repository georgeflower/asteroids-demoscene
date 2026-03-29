import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/types/multiplayer";

const MAX_MESSAGE_LENGTH = 200;

interface LobbyChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  disabled?: boolean;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const LobbyChat = ({ messages, onSend, disabled = false }: LobbyChatProps) => {
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setDraft("");
  };

  return (
    <div
      className="flex flex-col w-full max-w-sm border border-[hsl(var(--game-foreground))]/30 rounded"
      style={{ background: "rgba(0,0,0,0.4)" }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-[hsl(var(--game-foreground))]/20 text-xs font-mono text-[hsl(var(--game-foreground))]/60 tracking-widest uppercase">
        Chat
      </div>

      {/* Message list */}
      <div className="flex flex-col gap-1 overflow-y-auto px-3 py-2" style={{ minHeight: "10rem", maxHeight: "12rem" }}>
        {messages.length === 0 && (
          <div className="text-xs font-mono text-[hsl(var(--game-foreground))]/30 italic text-center mt-4">
            No messages yet — say hi!
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-mono font-bold text-[hsl(var(--game-glow))]">{msg.sender}</span>
              <span className="text-[10px] font-mono text-[hsl(var(--game-foreground))]/40">{formatTime(msg.timestamp)}</span>
            </div>
            <div className="text-xs font-mono text-[hsl(var(--game-foreground))]/90 break-words whitespace-pre-wrap leading-snug pl-1">
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input row */}
      <div className="flex gap-1 px-2 py-2 border-t border-[hsl(var(--game-foreground))]/20">
        <input
          type="text"
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
            e.stopPropagation();
          }}
          placeholder={disabled ? "Chat unavailable" : "Type a message…"}
          className="flex-1 min-w-0 text-xs font-mono bg-transparent border border-[hsl(var(--game-foreground))]/30 text-[hsl(var(--game-foreground))] px-2 py-1 focus:outline-none focus:border-[hsl(var(--game-glow))] disabled:opacity-30 placeholder-[hsl(var(--game-foreground))]/30"
        />
        <Button
          onClick={handleSend}
          disabled={disabled || !draft.trim()}
          className="text-xs px-3 py-1 font-mono bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] hover:bg-[hsl(var(--game-glow))] disabled:opacity-30 h-auto"
        >
          SEND
        </Button>
      </div>
    </div>
  );
};

export default LobbyChat;
