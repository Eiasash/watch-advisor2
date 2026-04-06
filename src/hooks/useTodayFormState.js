/**
 * useTodayFormState — encapsulates the form fields of TodayPanel.
 *
 * Extracted from TodayPanel to separate UI state from recommendation logic.
 * Accepts an optional seed from todayEntry so the hook can be initialised
 * with any already-logged data on first render.
 *
 * State managed here:
 *   selected     — Set of currently selected garment IDs
 *   watchId      — currently chosen watch ID
 *   context      — outfit context string (e.g. "smart-casual")
 *   notes        — free-text notes
 *   extraImgs    — array of base64 outfit photo strings
 *   logged       — whether today has been logged
 *   filter       — garment grid filter ("all" | type)
 *   aiLoading    — whether AI outfit suggestion is in-flight
 *   aiHint       — { explanation, strapShoeOk } from last AI suggestion
 */

import { useState, useRef, useEffect } from "react";
import { useWardrobeStore } from "../stores/wardrobeStore.js";

export function useTodayFormState({ todayEntry, watches, defaultWatchId }) {
  const [selected,   setSelected]   = useState(() => new Set(todayEntry?.garmentIds ?? []));
  const [watchId,    setWatchId]    = useState(() => defaultWatchId);
  const [context,    setContext]    = useState(() => {
    if (todayEntry?.context) return todayEntry.context;
    // Auto-detect on-call if today is in onCallDates
    const onCallDates = useWardrobeStore.getState().onCallDates ?? [];
    const todayIso = new Date().toISOString().slice(0, 10);
    return onCallDates.includes(todayIso) ? "shift" : null;
  });
  const [notes,      setNotes]      = useState(() => todayEntry?.notes ?? "");
  const [extraImgs,  setExtraImgs]  = useState(() =>
    todayEntry?.outfitPhotos ?? (todayEntry?.outfitPhoto ? [todayEntry.outfitPhoto] : [])
  );
  const [logged,     setLogged]     = useState(() => !!todayEntry);
  const [filter,     setFilter]     = useState("all");
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiHint,     setAiHint]     = useState(null);

  // Sync form fields when todayEntry hydrates from Supabase after initial render
  const prevEntryId = useRef(todayEntry?.id);
  useEffect(() => {
    if (!todayEntry || todayEntry.id === prevEntryId.current) return;
    prevEntryId.current = todayEntry.id;
    setSelected(new Set(todayEntry.garmentIds ?? []));
    setWatchId(todayEntry.watchId ?? watches[0]?.id ?? null);
    setContext(todayEntry.context ?? null);
    setNotes(todayEntry.notes ?? "");
    setExtraImgs(todayEntry.outfitPhotos ?? (todayEntry.outfitPhoto ? [todayEntry.outfitPhoto] : []));
    setLogged(true);
  }, [todayEntry, watches]);

  const toggleGarment = (id) => setSelected(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return {
    selected, setSelected, toggleGarment,
    watchId, setWatchId,
    context, setContext,
    notes, setNotes,
    extraImgs, setExtraImgs,
    logged, setLogged,
    filter, setFilter,
    aiLoading, setAiLoading,
    aiHint, setAiHint,
  };
}
