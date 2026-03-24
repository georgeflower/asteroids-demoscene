import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import Index from "./pages/Index";
import Game from "./pages/Game";
import NotFound from "./pages/NotFound";
import { AdminMonitor } from "./components/AdminMonitor";

const queryClient = new QueryClient();

const App = () => {
  const [adminEnabled, setAdminEnabled] = useState(() => {
    try { return localStorage.getItem("asteroids_admin") === "true"; } catch { return false; }
  });

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "asteroids_admin") {
        setAdminEnabled(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

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
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
