import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SeasonInfo {
  id: number;
  name: string;
}

const CACHE_KEY = "currentSeason";

export function readCachedSeason(): SeasonInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.id === "number" && typeof v?.name === "string" ? { id: v.id, name: v.name } : null;
  } catch {
    return null;
  }
}

let seasonsPromise: Promise<{ current: SeasonInfo | null; past: SeasonInfo[] }> | null = null;

/** Fetches the seasons list once per app load. */
export function fetchSeasons() {
  if (!seasonsPromise) {
    seasonsPromise = (async () => {
      const { data, error } = await (supabase as any)
        .from("seasons")
        .select("id, name, is_current")
        .order("id", { ascending: false });
      if (error || !data) {
        seasonsPromise = null;
        return { current: readCachedSeason(), past: [] };
      }
      const rows = data as { id: number; name: string; is_current: boolean }[];
      const cur = rows.find((r) => r.is_current);
      const current = cur ? { id: cur.id, name: cur.name } : null;
      const past = current ? rows.filter((r) => r.id < current.id).map((r) => ({ id: r.id, name: r.name })) : [];
      if (current) {
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(current));
        } catch {
          /* ignore */
        }
      }
      return { current, past };
    })();
  }
  return seasonsPromise;
}

export function useSeasons() {
  const [current, setCurrent] = useState<SeasonInfo | null>(() => readCachedSeason());
  const [past, setPast] = useState<SeasonInfo[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchSeasons().then((r) => {
      if (!alive) return;
      if (r.current) setCurrent(r.current);
      setPast(r.past);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { current, past, loading };
}

/** Season 1 keeps the legacy keys so no local record is lost. */
export function seasonKey(base: string, seasonId: number | undefined | null) {
  return !seasonId || seasonId <= 1 ? base : `${base}:s${seasonId}`;
}
