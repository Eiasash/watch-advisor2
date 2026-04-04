/**
 * SeasonalTransition — alerts when season is changing and suggests
 * garments to rotate in/out. Only shows during transition months.
 */
import React, { useMemo } from "react";

const SEASON_MONTHS = {
  winter:  [12, 1, 2],
  spring:  [3, 4, 5],
  summer:  [6, 7, 8],
  autumn:  [9, 10, 11],
};

// Jerusalem timezone
function getJerusalemMonth() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })).getMonth() + 1;
}

function getCurrentSeason(month) {
  for (const [season, months] of Object.entries(SEASON_MONTHS)) {
    if (months.includes(month)) return season;
  }
  return "spring";
}

function getNextSeason(current) {
  const order = ["winter", "spring", "summer", "autumn"];
  return order[(order.indexOf(current) + 1) % 4];
}

// Transition months = first month of each season
const TRANSITION_MONTHS = [3, 6, 9, 12];

/**
 * @param {{ garments: Array, isDark: boolean }} props
 */
export default function SeasonalTransition({ garments, isDark }) {
  const { outgoing, incoming, isTransition, currentSeason, nextSeason } = useMemo(() => {
    const month = getJerusalemMonth();
    const isTrans = TRANSITION_MONTHS.includes(month);
    const current = getCurrentSeason(month);
    const next = getNextSeason(current);

    if (!isTrans || !garments?.length) {
      return { outgoing: [], incoming: [], isTransition: false, currentSeason: current, nextSeason: next };
    }

    const wearable = garments.filter(g =>
      !g.excludeFromWardrobe &&
      ["shirt", "pants", "sweater", "jacket"].includes(g.category ?? g.type)
    );

    // Outgoing: garments ONLY tagged for the previous season (not multi-season)
    const prevSeason = ["winter", "spring", "summer", "autumn"][
      (["winter", "spring", "summer", "autumn"].indexOf(current) - 1 + 4) % 4
    ];
    const out = wearable.filter(g => {
      const seasons = g.seasons ?? [];
      return seasons.includes(prevSeason) && !seasons.includes(current) && !seasons.includes(next);
    });

    // Incoming: garments tagged for next season but not the previous
    const inc = wearable.filter(g => {
      const seasons = g.seasons ?? [];
      return seasons.includes(current) && !seasons.includes(prevSeason) && seasons.length <= 2;
    });

    return { outgoing: out.slice(0, 5), incoming: inc.slice(0, 5), isTransition: true, currentSeason: current, nextSeason: next };
  }, [garments]);

  if (!isTransition || (!outgoing.length && !incoming.length)) return null;

  const card = isDark ? "#161b22" : "#f0fdf4";
  const border = isDark ? "#16a34a30" : "#bbf7d040";
  const text = isDark ? "#86efac" : "#166534";
  const muted = isDark ? "#4ade80" : "#15803d";

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: "uppercase",
                    letterSpacing: "0.05em", marginBottom: 8 }}>
        🌿 Season shift → {currentSeason}
      </div>
      {outgoing.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>Pack away:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {outgoing.map(g => (
              <span key={g.id} style={{
                fontSize: 11, padding: "3px 8px", borderRadius: 12,
                background: isDark ? "#1a1f2b" : "#fef2f2", color: isDark ? "#fca5a5" : "#991b1b",
              }}>{g.name?.slice(0, 20)}</span>
            ))}
          </div>
        </div>
      )}
      {incoming.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>Bring out:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {incoming.map(g => (
              <span key={g.id} style={{
                fontSize: 11, padding: "3px 8px", borderRadius: 12,
                background: isDark ? "#1a1f2b" : "#ecfdf5", color: isDark ? "#86efac" : "#065f46",
              }}>{g.name?.slice(0, 20)}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
