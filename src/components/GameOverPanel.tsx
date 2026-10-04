import { useId } from "react";

export interface GameOverRunSummary {
  score: number;
  wave: number;
  timeSurvived: number;
  accuracy: number | null;
  asteroids: number;
  bestChain: number;
  prevBest: { score: number } | null;
}

interface Entry { initials: string; score: number }

interface Props {
  score: number;
  runSummary: GameOverRunSummary | null;
  boardTitle: string;
  entries: Entry[];
  enteringInitials: boolean;
  initials: string;
  hasStoredInitials: boolean;
  isTouchDevice: boolean;
  status: string;
  statusIsError: boolean;
  selection: number;
  onInitialsChange: (v: string) => void;
  onSubmitInitials: () => void;
  onPlayAgain: () => void;
  onMenu: () => void;
}

const SLOTS = 10;
const FG = "text-[hsl(var(--game-foreground))]";

export default function GameOverPanel(p: Props) {
  const titleId = useId();
  const rs = p.runSummary;
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const isPB = rs ? !rs.prevBest || rs.score > rs.prevBest.score : false;
  const pbText = !rs
    ? "\u00a0"
    : !rs.prevBest
      ? "NEW PERSONAL BEST!"
      : rs.score > rs.prevBest.score
        ? `NEW PERSONAL BEST! +${(rs.score - rs.prevBest.score).toLocaleString()}`
        : `BEST: ${rs.prevBest.score.toLocaleString()} (-${(rs.prevBest.score - rs.score).toLocaleString()})`;
  const stats: [string, string][] = [
    ["ACC", rs ? (rs.accuracy === null ? "—" : `${rs.accuracy.toFixed(0)}%`) : "—"],
    ["KILLS", rs ? String(rs.asteroids) : "—"],
    ["CHAIN", rs ? `x${rs.bestChain}` : "—"],
    ["TIME", rs ? fmtTime(rs.timeSurvived) : "—"],
    ["WAVE", rs ? String(rs.wave) : "—"],
  ];
  const autoFocus = !p.isTouchDevice && !p.hasStoredInitials;
  const btnBase = "w-full min-h-12 font-mono text-sm sm:text-base border-2 transition-colors";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 h-dvh bg-black/80 md:absolute md:z-20 md:h-full motion-safe:animate-[fade-in_150ms_ease-out]"
    >
      <div className={`mx-auto w-full max-w-[420px] h-full p-3 pt-[max(0.75rem,env(safe-area-inset-top))] grid grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2 font-mono ${FG}`}>
        {/* Row 1: header */}
        <div className="text-center leading-tight">
          <h2 id={titleId} className="text-xl sm:text-4xl text-[hsl(var(--game-danger))]">GAME OVER</h2>
          <div className="text-lg sm:text-2xl tabular-nums">{p.score.toString().padStart(8, "0")}</div>
          <div className={`h-4 text-[10px] sm:text-xs truncate ${isPB ? "text-[hsl(var(--game-glow))] font-bold" : "opacity-60"}`}>{pbText}</div>
        </div>

        {/* Row 2: stats */}
        <div className="grid grid-cols-5 gap-1">
          {stats.map(([l, v]) => (
            <div key={l} className="h-10 flex flex-col items-center justify-center border border-[hsl(var(--game-foreground))]/30 overflow-hidden">
              <span className="text-[10px] opacity-60 leading-none">{l}</span>
              <span className="text-[10px] sm:text-xs tabular-nums leading-tight">{v}</span>
            </div>
          ))}
        </div>

        {/* Row 3: flexible region */}
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {p.enteringInitials && (
            <div className="sticky top-0 z-10 bg-black/95 border border-[hsl(var(--game-glow))] p-2 mb-2 flex items-center justify-center gap-2">
              <label htmlFor={`${titleId}-ini`} className="text-[10px] text-[hsl(var(--game-glow))]">INITIALS</label>
              <input
                id={`${titleId}-ini`}
                type="text"
                inputMode="text"
                autoComplete="off"
                maxLength={3}
                value={p.initials}
                autoFocus={autoFocus}
                onChange={(e) => p.onInitialsChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && p.initials.length > 0) p.onSubmitInitials();
                  e.stopPropagation();
                }}
                className={`w-[5.5rem] h-9 text-center text-xl tracking-[0.4em] bg-transparent border-2 border-[hsl(var(--game-foreground))] ${FG} uppercase`}
                placeholder="___"
              />
              <button
                type="button"
                disabled={p.initials.length === 0}
                onClick={() => p.initials.length > 0 && p.onSubmitInitials()}
                className="h-9 px-3 text-xs bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] disabled:opacity-40"
              >
                SAVE
              </button>
            </div>
          )}
          <div className="text-[10px] sm:text-xs text-center text-[hsl(var(--game-glow))] mb-1">{p.boardTitle}</div>
          <ol className="border border-[hsl(var(--game-foreground))]/50 px-2 py-1 text-[11px] sm:text-sm">
            {Array.from({ length: SLOTS }, (_, i) => {
              const e = p.entries[i];
              const mine = e && e.score === p.score && e.initials === p.initials.toUpperCase();
              return (
                <li key={i} className={`h-5 flex justify-between tabular-nums whitespace-pre ${mine ? "text-[hsl(var(--game-glow))]" : e ? "" : "opacity-40"}`}>
                  <span>{(i + 1).toString().padStart(2, " ")}. {e ? e.initials.padEnd(3, " ") : "---"}</span>
                  <span>{e ? e.score.toString().padStart(8, "0") : "........"}</span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Row 4: action bar */}
        <div className="pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <div
            role="status"
            aria-live="polite"
            className={`h-4 text-[10px] text-center truncate ${p.statusIsError ? "text-[hsl(var(--game-danger))]" : "opacity-70"}`}
          >
            {p.status}
          </div>
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <button
              type="button"
              onClick={p.onPlayAgain}
              className={`${btnBase} ${p.selection === 0
                ? "bg-[hsl(var(--game-foreground))] text-[hsl(var(--game-background))] border-[hsl(var(--game-foreground))]"
                : "bg-[hsl(var(--game-foreground))]/15 border-[hsl(var(--game-foreground))]/40"}`}
            >
              PLAY AGAIN
            </button>
            <button
              type="button"
              onClick={p.onMenu}
              className={`${btnBase} ${p.selection === 1
                ? "bg-[hsl(var(--game-foreground))]/25 border-[hsl(var(--game-foreground))]"
                : "bg-transparent border-[hsl(var(--game-foreground))]/40 opacity-70"}`}
            >
              MENU
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
