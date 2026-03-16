import { useState, useEffect, useCallback } from "react";
import {
  ControlBindings,
  KeyBindings,
  DEFAULT_BINDINGS,
  saveBindings,
  displayKeyName,
} from "@/hooks/useControlSettings";
import { toast } from "sonner";

interface ControlSettingsProps {
  bindings: ControlBindings;
  onSave: (bindings: ControlBindings) => void;
  onClose: () => void;
}

type ActionKey = keyof KeyBindings;

const ACTIONS: { key: ActionKey; label: string }[] = [
  { key: "left", label: "STEER LEFT" },
  { key: "right", label: "STEER RIGHT" },
  { key: "thrust", label: "THRUST" },
  { key: "fire", label: "FIRE" },
  { key: "hyperspace", label: "HYPERSPACE" },
];


export default function ControlSettings({ bindings, onSave, onClose }: ControlSettingsProps) {
  const [draft, setDraft] = useState<ControlBindings>(() => JSON.parse(JSON.stringify(bindings)));
  const [listening, setListening] = useState<{ player: "p1" | "p2"; action: ActionKey } | null>(null);

  const handleKeyCapture = useCallback(
    (e: KeyboardEvent) => {
      if (!listening) return;
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels listening
      if (e.key === "Escape") {
        setListening(null);
        return;
      }

      setDraft((prev) => {
        const updated = JSON.parse(JSON.stringify(prev)) as ControlBindings;
        updated[listening.player][listening.action] = e.key;
        return updated;
      });
      setListening(null);
    },
    [listening],
  );

  useEffect(() => {
    if (listening) {
      window.addEventListener("keydown", handleKeyCapture, true);
      return () => window.removeEventListener("keydown", handleKeyCapture, true);
    }
  }, [listening, handleKeyCapture]);

  const handleSave = () => {
    saveBindings(draft);
    onSave(draft);
    toast("Settings saved to localStorage");
  };

  const handleReset = () => {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)) as ControlBindings;
    setDraft(defaults);
  };

  const renderKeyRow = (player: "p1" | "p2", action: ActionKey, label: string) => {
    const isListening = listening?.player === player && listening?.action === action;
    const currentKey = draft[player][action];

    return (
      <div key={`${player}-${action}`} className="flex items-center justify-between py-1">
        <span className="text-xs opacity-80">{label}</span>
        <button
          className={`font-mono text-xs px-3 py-1 border min-w-[80px] text-center transition-all ${
            isListening
              ? "border-[#FFD700] text-[#FFD700] animate-pulse bg-[#FFD700]/10"
              : "border-[hsl(var(--game-foreground))]/40 text-[hsl(var(--game-foreground))] hover:border-[hsl(var(--game-foreground))]"
          }`}
          onClick={() => setListening({ player, action })}
        >
          {isListening ? "PRESS KEY..." : displayKeyName(currentKey)}
        </button>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <div
        className="bg-black border border-[hsl(var(--game-foreground))]/40 rounded p-6 max-w-3xl w-[90vw] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ scrollbarWidth: "thin", scrollbarColor: "#444 #111" }}
      >
        <div
          className="text-center font-mono text-lg text-[#FFD700] mb-6"
          style={{ textShadow: "0 0 10px #FFD700" }}
        >
          ⚙ CONTROL SETTINGS
        </div>

        {/* Keyboard section */}
        <div className="font-mono text-[hsl(var(--game-foreground))]">
          <div className="text-sm text-center mb-4 opacity-60">KEYBOARD</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* P1 */}
            <div className="border border-[#00FFFF]/30 p-3 rounded">
              <div className="text-center text-sm mb-2" style={{ color: "#00FFFF" }}>
                PLAYER 1
              </div>
              {ACTIONS.map(({ key, label }) => renderKeyRow("p1", key, label))}
            </div>
            {/* P2 */}
            <div className="border border-[#FF8844]/30 p-3 rounded">
              <div className="text-center text-sm mb-2" style={{ color: "#FF8844" }}>
                PLAYER 2
              </div>
              {ACTIONS.map(({ key, label }) => renderKeyRow("p2", key, label))}
            </div>
          </div>

          {/* Gamepad section */}
          <div className="text-sm text-center mb-3 opacity-60">GAMEPAD (XBOX LAYOUT)</div>
          <div className="border border-[hsl(var(--game-foreground))]/20 p-3 rounded mb-6">
            <div className="text-xs opacity-50 text-center mb-2">
              Standard mapping — not rebindable
            </div>
            {GAMEPAD_BUTTONS.map(({ label, button }) => (
              <div key={label} className="flex items-center justify-between py-1 text-xs">
                <span className="opacity-80">{label}</span>
                <span className="opacity-60">{button}</span>
              </div>
            ))}
          </div>

          {/* Turn Speed slider */}
          <div className="text-sm text-center mb-3 opacity-60">TURN SPEED</div>
          <div className="border border-[hsl(var(--game-foreground))]/20 p-3 rounded mb-6">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs opacity-60 shrink-0">SLOW</span>
              <input
                type="range"
                min={0.02}
                max={0.10}
                step={0.005}
                value={draft.turnSpeed}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, turnSpeed: parseFloat(e.target.value) }))
                }
                className="w-full h-1 appearance-none bg-[hsl(var(--game-foreground))]/20 rounded accent-[#FFD700] cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#FFD700]"
              />
              <span className="text-xs opacity-60 shrink-0">FAST</span>
            </div>
            <div className="text-center text-xs mt-2 text-[#FFD700]" style={{ textShadow: "0 0 6px #FFD700" }}>
              {draft.turnSpeed.toFixed(3)}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleReset}
              className="font-mono text-xs px-4 py-2 border border-[hsl(var(--game-foreground))]/40 text-[hsl(var(--game-foreground))] opacity-60 hover:opacity-100 transition-opacity uppercase tracking-widest"
            >
              RESET DEFAULTS
            </button>
            <button
              onClick={onClose}
              className="font-mono text-xs px-4 py-2 border border-[hsl(var(--game-foreground))]/40 text-[hsl(var(--game-foreground))] opacity-60 hover:opacity-100 transition-opacity uppercase tracking-widest"
            >
              CANCEL
            </button>
            <button
              onClick={handleSave}
              className="font-mono text-xs px-4 py-2 border border-[#FFD700]/60 text-[#FFD700] hover:bg-[#FFD700]/10 transition-all uppercase tracking-widest"
              style={{ textShadow: "0 0 6px #FFD700" }}
            >
              SAVE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
