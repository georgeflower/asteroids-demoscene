import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import Index from "./pages/Index";
import Game from "./pages/Game";
import NotFound from "./pages/NotFound";
import { AdminMonitor } from "./components/AdminMonitor";

const queryClient = new QueryClient();

const App = () => {
  const [adminEnabled, setAdminEnabled] = useState(() => {
    try { return localStorage.getItem("asteroids_admin") === "true"; } catch { return false; }
  });

  const [debugEnabled, setDebugEnabled] = useState(() => {
    try { return localStorage.getItem("asteroids_debug") === "true"; } catch { return false; }
  });

  const toggleDebug = useCallback(() => {
    setDebugEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem("asteroids_debug", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const toggleAdmin = useCallback(() => {
    setAdminEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem("asteroids_admin", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "asteroids_admin") {
        setAdminEnabled(e.newValue === "true");
      }
      if (e.key === "asteroids_debug") {
        setDebugEnabled(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if ((e.key === "x" || e.key === "X") && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        toggleDebug();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleDebug]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/game" element={<Game />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        {adminEnabled && <AdminMonitor />}
        {debugEnabled && (
          <div
            style={{
              position: "fixed",
              bottom: 12,
              right: 12,
              zIndex: 10000,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 6,
              fontFamily: "monospace",
              fontSize: 11,
            }}
          >
            <div
              aria-label="Debug mode active"
              role="status"
              style={{
                background: "rgba(0,0,0,0.75)",
                border: "1px solid #FFD700",
                borderRadius: 4,
                padding: "4px 8px",
                color: "#FFD700",
                letterSpacing: 1,
                cursor: "default",
                userSelect: "none",
              }}
            >
              ⚙ DEBUG
            </div>
            <button
              onClick={toggleAdmin}
              style={{
                background: adminEnabled ? "#FFD700" : "rgba(0,0,0,0.75)",
                border: "1px solid #FFD700",
                borderRadius: 4,
                padding: "4px 10px",
                color: adminEnabled ? "#000" : "#FFD700",
                fontFamily: "monospace",
                fontSize: 11,
                letterSpacing: 1,
                cursor: "pointer",
              }}
            >
              {adminEnabled ? "CLOSE ADMIN" : "OPEN ADMIN"}
            </button>
          </div>
        )}
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
