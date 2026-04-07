/**
 * WardrobeGapAnalysis — identifies gaps in wardrobe coverage by context.
 * Shows which contexts lack sufficient garment diversity and suggests actions.
 */
import React, { useMemo } from "react";

const CORE_CONTEXTS = [
  { key: "clinic", label: "Clinic", minShirts: 3, minPants: 2 },
  { key: "formal", label: "Formal", minShirts: 2, minPants: 2 },
  { key: "smart-casual", label: "Smart Casual", minShirts: 4, minPants: 3 },
  { key: "casual", label: "Casual", minShirts: 3, minPants: 2 },
  { key: "date-night", label: "Date Night", minShirts: 2, minPants: 2 },
  { key: "shift", label: "On-Call Shift", minShirts: 2, minPants: 2 },
];

/**
 * @param {{ garments: Array, isDark: boolean }} props
 */
export default function WardrobeGapAnalysis({ garments, isDark }) {
  const gaps = useMemo(() => {
    if (!garments?.length) return [];

    const wearable = garments.filter(g =>
      !g.excludeFromWardrobe &&
      !["outfit-photo", "watch", "outfit-shot", "accessory", "bag"].includes(g.type)
    );

    const result = [];
    for (const ctx of CORE_CONTEXTS) {
      const shirts = wearable.filter(g =>
        (g.type === "shirt") && (g.contexts ?? []).includes(ctx.key)
      );
      const pants = wearable.filter(g =>
        (g.type === "pants") && (g.contexts ?? []).includes(ctx.key)
      );
      const sweaters = wearable.filter(g =>
        (g.type === "sweater") && (g.contexts ?? []).includes(ctx.key)
      );

      const issues = [];
      if (shirts.length < ctx.minShirts) {
        issues.push(`${ctx.minShirts - shirts.length} more shirt${shirts.length < ctx.minShirts - 1 ? "s" : ""} needed (have ${shirts.length})`);
      }
      if (pants.length < ctx.minPants) {
        issues.push(`${ctx.minPants - pants.length} more trouser${pants.length < ctx.minPants - 1 ? "s" : ""} needed (have ${pants.length})`);
      }

      if (issues.length > 0) {
        // Show what colors are already covered
        const shirtColors = [...new Set(shirts.map(s => s.color))];
        const pantColors = [...new Set(pants.map(p => p.color))];
        result.push({
          context: ctx.label,
          key: ctx.key,
          issues,
          shirtColors,
          pantColors,
          sweaterCount: sweaters.length,
        });
      }
    }
    return result;
  }, [garments]);

  if (!gaps.length) return null;

  const card = isDark ? "#161b22" : "#fff7ed";
  const border = isDark ? "#c2410c30" : "#fed7aa40";
  const text = isDark ? "#fdba74" : "#9a3412";
  const muted = isDark ? "#fb923c" : "#c2410c";

  return (
    <div style={{ background: card, borderRadius: 14, border: `1px solid ${border}`, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: "uppercase",
                    letterSpacing: "0.05em", marginBottom: 10 }}>
        🔍 Wardrobe gaps
      </div>
      {gaps.map(g => (
        <div key={g.key} style={{ marginBottom: 10, paddingBottom: 8,
                                   borderBottom: `1px solid ${isDark ? "#1a1f2b" : "#fed7aa30"}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#fef3c7" : "#78350f", marginBottom: 3 }}>
            {g.context}
          </div>
          {g.issues.map((issue, i) => (
            <div key={i} style={{ fontSize: 11, color: muted, marginLeft: 8 }}>• {issue}</div>
          ))}
          {g.shirtColors.length > 0 && (
            <div style={{ fontSize: 10, color: isDark ? "#9ca3af" : "#6b7280", marginTop: 3, marginLeft: 8 }}>
              Shirts covered: {g.shirtColors.join(", ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
