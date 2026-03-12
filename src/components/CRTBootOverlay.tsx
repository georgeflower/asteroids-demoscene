import { useEffect, useRef } from "react";

interface CRTBootOverlayProps {
  onComplete: () => void;
}

const DURATION = 1000; // ms total

const CRTBootOverlay = ({ onComplete }: CRTBootOverlayProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const w = (canvas.width = window.innerWidth);
    const h = (canvas.height = window.innerHeight);
    const start = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1);
      ctx.clearRect(0, 0, w, h);

      // Always draw black base
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      const cy = h / 2;

      if (t < 0.06) {
        // Phase 0: Pure black — brief delay
      } else if (t < 0.35) {
        // Phase 1: Thin bright horizontal line appears & begins expanding
        const p = (t - 0.06) / 0.29; // 0→1
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
        const lineH = 2 + eased * h * 0.08;
        const y = cy - lineH / 2;

        // Phosphor glow (wide soft glow)
        const grad = ctx.createLinearGradient(0, cy - lineH * 3, 0, cy + lineH * 3);
        grad.addColorStop(0, "rgba(100, 255, 200, 0)");
        grad.addColorStop(0.4, `rgba(150, 255, 220, ${0.3 * p})`);
        grad.addColorStop(0.5, `rgba(200, 255, 240, ${0.6 * p})`);
        grad.addColorStop(0.6, `rgba(150, 255, 220, ${0.3 * p})`);
        grad.addColorStop(1, "rgba(100, 255, 200, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, cy - lineH * 3, w, lineH * 6);

        // Bright center line
        ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * Math.min(p * 2, 1)})`;
        ctx.fillRect(0, y, w, lineH);

        // Horizontal scan artifact
        ctx.fillStyle = `rgba(180, 255, 230, ${0.15 * p})`;
        ctx.fillRect(0, y - 1, w, lineH + 2);
      } else if (t < 0.65) {
        // Phase 2: Line expands to full screen
        const p = (t - 0.35) / 0.3;
        const eased = 1 - Math.pow(1 - p, 2.5);
        const lineH = h * 0.08 + eased * h * 0.92;
        const y = cy - lineH / 2;

        // Screen fill glow
        ctx.fillStyle = `rgba(160, 255, 220, ${0.12 * (1 - p * 0.5)})`;
        ctx.fillRect(0, y, w, lineH);

        // Scanlines across the lit area
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = "#000";
        for (let sy = Math.floor(y); sy < y + lineH; sy += 2) {
          ctx.fillRect(0, sy, w, 1);
        }
        ctx.globalAlpha = 1;

        // Bright leading edges
        const edgeAlpha = Math.max(0, 1 - p * 1.5);
        ctx.fillStyle = `rgba(220, 255, 240, ${0.6 * edgeAlpha})`;
        ctx.fillRect(0, y, w, 3);
        ctx.fillRect(0, y + lineH - 3, w, 3);

        // Static noise (stronger early, fading)
        const noiseStrength = Math.max(0, 0.15 - p * 0.15);
        if (noiseStrength > 0.01) {
          const imgData = ctx.getImageData(0, Math.max(0, Math.floor(y)), w, Math.min(Math.ceil(lineH), h));
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 16) {
            if (Math.random() < noiseStrength) {
              const v = Math.random() * 200 + 55;
              d[i] = v;
              d[i + 1] = v;
              d[i + 2] = v;
              d[i + 3] = 120;
            }
          }
          ctx.putImageData(imgData, 0, Math.max(0, Math.floor(y)));
        }
      } else if (t < 0.82) {
        // Phase 3: Full screen — flicker
        const p = (t - 0.65) / 0.17;
        const flicker =
          Math.sin(p * Math.PI * 14) * 0.35 +
          Math.sin(p * Math.PI * 7) * 0.15 +
          0.5;

        // Green phosphor glow
        ctx.fillStyle = `rgba(160, 255, 220, ${0.1 * flicker})`;
        ctx.fillRect(0, 0, w, h);

        // Scanlines
        ctx.globalAlpha = 0.07 * flicker;
        ctx.fillStyle = "#000";
        for (let sy = 0; sy < h; sy += 2) {
          ctx.fillRect(0, sy, w, 1);
        }
        ctx.globalAlpha = 1;

        // Random horizontal glitch lines
        if (Math.random() < 0.3) {
          const gy = Math.random() * h;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.1 * flicker})`;
          ctx.fillRect(0, gy, w, 1);
        }
      } else {
        // Phase 4: Fade out overlay
        const p = (t - 0.82) / 0.18;
        const alpha = Math.max(0, 1 - Math.pow(p, 1.5));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }

      if (t < 1) {
        raf = requestAnimationFrame(draw);
      } else {
        onComplete();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        width: "100vw",
        height: "100vh",
        display: "block",
        background: "#000",
      }}
    />
  );
};

export default CRTBootOverlay;
