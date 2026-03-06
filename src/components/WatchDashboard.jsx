import React, { useMemo } from "react";
import { useWatchStore } from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { pickWatchForCalendar } from "../engine/calendarWatchRotation.js";
import { generateOutfit, explainOutfit } from "../engine/outfitEngine.js";

const PROFILE_LABEL = {
  "hospital-smart-casual": "Hospital · Smart Casual",
  "smart-casual": "Smart Casual",
  "formal": "Formal",
  "casual": "Casual",
  "travel": "Travel",
};

const PROFILE_COLOR = {
  "hospital-smart-casual": "#3b82f6",
  "smart-casual": "#6366f1",
  "formal": "#d4a017",
  "casual": "#22c55e",
  "travel": "#f97316",
};

const DIAL_SWATCH = {
  "silver-white": "#e8e8e0",
  "green":        "#3d6b45",
  "grey":         "#8a8a8a",
  "blue":         "#2d5fa0",
  "navy":         "#1e2f5e",
  "white":        "#f0ede8",
  "black-red":    "#1a1a1a",
  "black":        "#1a1a1a",
  "white-teal":   "#4da89c",
};

function WatchCard({ watch, label, accent = "#3b82f6" }) {
  if (!watch) return null;
  const swatch = DIAL_SWATCH[watch.dial] ?? "#444";

  return (
    <div style={{
      background: "#0f131a",
      borderRadius: 14,
      padding: "14px 16px",
      border: `1px solid ${accent}33`,
      display: "flex", gap: 14, alignItems: "flex-start",
    }}>
      {/* Dial swatch */}
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        background: swatch,
        border: "3px solid #2b3140",
        flexShrink: 0,
        boxShadow: `0 0 12px ${swatch}44`,
      }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: accent, marginBottom: 3, textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>{watch.model}</div>
        <div style={{ fontSize: 13, color: "#8b93a7", marginTop: 2 }}>{watch.brand} · {watch.ref}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
          {watch.dial} dial · {watch.style} · formality {watch.formality}/10
        </div>
      </div>
    </div>
  );
}

function OutfitSlot({ slot, garment }) {
  const ICONS = { shirt: "👔", pants: "👖", shoes: "👟", jacket: "🧥" };
  return (
    <div style={{
      background: "#0f131a", borderRadius: 12, padding: "12px 14px",
      border: "1px solid #2b3140", minHeight: 90,
    }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{ICONS[slot] ?? "•"}</div>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{slot}</div>
      {garment ? (
        <>
          <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{garment.name}</div>
          <div style={{ fontSize: 12, color: "#8b93a7", marginTop: 2 }}>{garment.color}</div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: "#4b5563", fontStyle: "italic" }}>No garments yet</div>
      )}
    </div>
  );
}

export default function WatchDashboard() {
  const watches  = useWatchStore(s => s.watches);
  const garments = useWardrobeStore(s => s.garments);
  const history  = useHistoryStore(s => s.entries);

  // Simulate today's events — in production this comes from a calendar service
  const todayEvents = useMemo(() => {
    const hour = new Date().getHours();
    return hour >= 6 && hour <= 22 ? ["hospital rounds", "ward work"] : [];
  }, []);

  const { primary, backup, dayProfile } = useMemo(() =>
    pickWatchForCalendar(watches, todayEvents, { tempC: 22 }, history),
  [watches, todayEvents, history]);

  const outfit = useMemo(() =>
    primary ? generateOutfit(primary, garments, { tempC: 22 }, {}, history) : {},
  [primary, garments, history]);

  const explanation = useMemo(() =>
    primary ? explainOutfit(primary, outfit, dayProfile) : "",
  [primary, outfit, dayProfile]);

  const profileColor = PROFILE_COLOR[dayProfile] ?? "#6366f1";

  return (
    <div style={{
      padding: "18px 20px", borderRadius: 18, marginBottom: 20,
      background: "#171a21", border: "1px solid #2b3140",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Today's Watch</h2>
        <span style={{
          fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
          background: `${profileColor}22`, color: profileColor,
          borderRadius: 6, padding: "3px 10px", textTransform: "uppercase",
        }}>
          {PROFILE_LABEL[dayProfile] ?? dayProfile}
        </span>
      </div>

      {!primary && (
        <div style={{ color: "#6b7280", fontSize: 14 }}>No watches available.</div>
      )}

      {primary && (
        <>
          {/* Watch cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            <WatchCard watch={primary} label="Primary" accent={profileColor} />
            <WatchCard watch={backup}  label="Backup"  accent="#4b5563" />
          </div>

          {/* Outfit slots */}
          <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Outfit built around this watch
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {["shirt", "pants", "shoes", "jacket"].map(slot => (
              <OutfitSlot key={slot} slot={slot} garment={outfit[slot]} />
            ))}
          </div>

          {/* Explanation */}
          <div style={{
            fontSize: 14, lineHeight: 1.6, color: "#a1a9b8",
            background: "#0f131a", borderRadius: 10,
            padding: "12px 14px", borderLeft: `3px solid ${profileColor}`,
          }}>
            {explanation}
          </div>
        </>
      )}
    </div>
  );
}
