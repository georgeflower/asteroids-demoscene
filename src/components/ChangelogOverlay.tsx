import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { CHANGELOG, COMING_NEXT, type ChangelogSection } from "@/data/changelog";

interface ChangelogOverlayProps {
  currentVersion: string;
  onClose: () => void;
}

const sectionColors: Record<string, string> = {
  Removed: "text-[#FF6666] border-[#FF6666]/50",
  Added: "text-[#44FF44] border-[#44FF44]/50",
  Changed: "text-[#44AAFF] border-[#44AAFF]/50",
  Fixed: "text-[#FFAA33] border-[#FFAA33]/50",
  Gameplay: "text-[#FF66FF] border-[#FF66FF]/50",
  Performance: "text-[#CC66FF] border-[#CC66FF]/50",
};

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 font-['ui-monospace','SFMono-Regular',Menlo,Consolas,monospace] text-xs leading-relaxed text-[hsl(var(--game-foreground))]">
      {items.map((item) => (
        <li key={item} className="flex min-w-0 gap-2">
          <span aria-hidden="true" className="w-3 shrink-0 text-[#FFD700]">▸</span>
          <span className="min-w-0 flex-1 break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ section }: { section: ChangelogSection }) {
  const color = sectionColors[section.label] ?? "text-[hsl(var(--game-foreground))] border-[hsl(var(--game-foreground))]/50";
  return (
    <section className="space-y-2">
      <h3 className={`inline-flex min-h-6 items-center border px-2 font-mono text-[10px] uppercase leading-none ${color}`}>
        {section.label}
      </h3>
      <BulletList items={section.items} />
    </section>
  );
}

export default function ChangelogOverlay({ currentVersion, onClose }: ChangelogOverlayProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 h-dvh bg-black sm:flex sm:items-center sm:justify-center sm:bg-black/90 sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="grid h-full min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-black pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:max-h-[85dvh] sm:w-full sm:max-w-2xl sm:rounded sm:border sm:border-[hsl(var(--game-foreground))]/40 sm:py-0">
        <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between border-b border-[hsl(var(--game-foreground))]/40 bg-black px-4">
          <h2
            id={titleId}
            className="font-mono text-sm text-[#FFD700]"
            style={{ textShadow: "0 0 10px #FFD700" }}
          >
            CHANGELOG
          </h2>
          <Button
            ref={closeRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close changelog"
            className="min-h-11 min-w-11 font-mono text-lg text-[hsl(var(--game-foreground))] hover:bg-transparent hover:text-[#FFD700] focus-visible:ring-2 focus-visible:ring-[#FFD700]"
          >
            ✕
          </Button>
        </header>

        <div className="min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4">
          <section className="mb-5 border border-dashed border-[#FFD700] p-3">
            <div className="mb-4 inline-flex min-h-6 items-center border border-[#FFD700] px-2 font-mono text-[10px] text-[#FFD700]">
              COMING NEXT · PLANNED
            </div>
            <div className="space-y-4">
              {COMING_NEXT.map((section) => <Section key={section.label} section={section} />)}
            </div>
          </section>

          <div>
            {CHANGELOG.map((release, index) => (
              <details key={release.version} open={index === 0} className="group border-t border-dashed border-[hsl(var(--game-foreground))]/40 first:border-t-0">
                <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FFD700] [&::-webkit-details-marker]:hidden">
                  <span aria-hidden="true" className="w-3 shrink-0 pt-0.5 font-mono text-[10px] text-[#FFD700] group-open:hidden">▸</span>
                  <span aria-hidden="true" className="hidden w-3 shrink-0 pt-0.5 font-mono text-[10px] text-[#FFD700] group-open:inline">▾</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 border border-[#FFD700]/70 px-1.5 py-1 font-mono text-[10px] leading-none text-[#FFD700]">v{release.version}</span>
                      {release.version === currentVersion && (
                        <span className="shrink-0 border border-[hsl(var(--game-glow))]/60 px-1.5 py-1 font-mono text-[10px] leading-none text-[hsl(var(--game-glow))]">CURRENT</span>
                      )}
                      <time className="ml-auto shrink-0 font-mono text-[10px] text-[hsl(var(--game-foreground))]/60">{release.date}</time>
                    </span>
                    {release.title && <span className="mt-2 block break-words font-mono text-[10px] leading-relaxed text-[hsl(var(--game-foreground))]">{release.title}</span>}
                  </span>
                </summary>
                <div className="space-y-4 pb-5 pl-5">
                  {release.sections.map((section) => <Section key={section.label} section={section} />)}
                </div>
              </details>
            ))}
          </div>
        </div>

        <footer className="sticky bottom-0 border-t border-[hsl(var(--game-foreground))]/40 bg-black p-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="min-h-11 w-full rounded-none border-[hsl(var(--game-foreground))]/40 bg-black font-mono text-[10px] text-[hsl(var(--game-foreground))] hover:bg-[hsl(var(--game-foreground))]/10 hover:text-[hsl(var(--game-foreground))] focus-visible:ring-2 focus-visible:ring-[#FFD700]"
          >
            ◂ BACK TO MENU
          </Button>
        </footer>
      </div>
    </div>
  );
}
