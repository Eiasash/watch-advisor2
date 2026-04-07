import React from "react";
import NeglectedWatchNudge from "./NeglectedWatchNudge.jsx";
import NeglectedAlert      from "./NeglectedAlert.jsx";
import StreakBadge         from "./StreakBadge.jsx";

/**
 * Groups all rotation-awareness nudges shown on the pre-log form.
 * Hidden after the user has logged (caller gates with {!logged && <RotationNudges />}).
 */
export default function RotationNudges({
  watches, history, neglected, streak,
  currentWatchId, onSelectWatch, isDark,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
      <NeglectedWatchNudge
        watches={watches} history={history}
        currentWatchId={currentWatchId} onSelectWatch={onSelectWatch}
        isDark={isDark}
      />
      <NeglectedAlert neglected={neglected} watchId={currentWatchId} onSelect={onSelectWatch} />
      <StreakBadge streak={streak} />
    </div>
  );
}
