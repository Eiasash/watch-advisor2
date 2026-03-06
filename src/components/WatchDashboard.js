import React, { useMemo } from "react";
import { useWatchStore } from "../stores/watchStore.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";
import { useHistoryStore } from "../stores/historyStore.js";
import { pickWatch } from "../engine/watchRotation.js";
import { generateOutfit, explainOutfit } from "../engine/outfitEngine.js";

export default function WatchDashboard() {
  const watches = useWatchStore(s => s.watches);
  const garments = useWardrobeStore(s => s.garments);
  const history = useHistoryStore(s => s.entries);

  const rec = useMemo(() => {
    if (!watches.length) return null;
    const watch = pickWatch(watches, history);
    const outfit = generateOutfit(watch, garments, { tempC: 22 }, {}, history);
    return { watch, outfit, why: explainOutfit(watch, outfit) };
  }, [watches, garments, history]);

  return React.createElement("div", {
    style: {
      padding: 16, borderRadius: 16, marginBottom: 16,
      background: "#171a21", border: "1px solid #2b3140"
    }
  },
    React.createElement("h2", { style: { margin: "0 0 10px" } }, "Today’s Watch"),
    !rec && React.createElement("div", { style: { opacity: 0.7 } }, "No watches available."),
    rec && React.createElement(React.Fragment, null,
      React.createElement("div", { style: { fontSize: 24, fontWeight: 700 } }, rec.watch.model),
      React.createElement("div", { style: { opacity: 0.7, marginBottom: 12 } }, `${rec.watch.brand} · ${rec.watch.dial}`),
      React.createElement("div", {
        style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }
      },
        ["shirt", "pants", "shoes", "jacket"].map(slot =>
          React.createElement("div", {
            key: slot,
            style: { background: "#0f131a", borderRadius: 12, padding: 10, minHeight: 84 }
          },
            React.createElement("div", { style: { opacity: 0.6, fontSize: 12, textTransform: "uppercase" } }, slot),
            React.createElement("div", { style: { fontWeight: 600 } }, rec.outfit[slot]?.name || "None")
          )
        )
      ),
      React.createElement("div", { style: { opacity: 0.82, fontSize: 14 } }, rec.why)
    )
  );
}
