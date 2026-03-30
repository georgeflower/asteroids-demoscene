import React from "react";

interface PlayerListProps {
  playerInitialsMap: Map<number, string>;
  pingMap: Map<number, number>;
  localPlayerIdx: number;
}

/**
 * Online player list overlay – shows all connected players and their current ping.
 * Displayed in the top-right corner during online co-op gameplay.
 */
export default function PlayerList({ playerInitialsMap, pingMap, localPlayerIdx }: PlayerListProps) {
  if (playerInitialsMap.size === 0) return null;

  const entries = Array.from(playerInitialsMap.entries()).sort(([a], [b]) => a - b);

  return (
    <div
      className="absolute top-2 right-2 z-20 select-none"
      style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: "9px",
        background: "rgba(0,0,0,0.65)",
        border: "1px solid rgba(255,255,255,0.18)",
        padding: "8px 12px",
        minWidth: "140px",
        lineHeight: "1.8",
      }}
    >
      {entries.map(([idx, initials]) => {
        const isMe = idx === localPlayerIdx;
        const isHostPlayer = idx === 0;
        const ping = pingMap.get(idx);

        let pingLabel: string;
        let pingColor: string;
        if (isHostPlayer) {
          pingLabel = "HOST";
          pingColor = "rgba(255,255,255,0.5)";
        } else if (ping === undefined) {
          pingLabel = "...";
          pingColor = "#888";
        } else if (ping < 60) {
          pingLabel = `${ping}ms`;
          pingColor = "#00ff88";
        } else if (ping < 150) {
          pingLabel = `${ping}ms`;
          pingColor = "#ffee00";
        } else {
          pingLabel = `${ping}ms`;
          pingColor = "#ff4444";
        }

        return (
          <div
            key={idx}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              color: isMe ? "#ffffff" : "rgba(255,255,255,0.55)",
            }}
          >
            <span>
              {isMe ? "▶" : " "} P{idx + 1} {initials}
            </span>
            <span style={{ color: pingColor }}>{pingLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
