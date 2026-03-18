/**
 * Strap → shoe coordination rules.
 * Single source of truth. Imported by scoring.js.
 *
 * Non-negotiable: leather strap color must match shoe leather color.
 * Metal / integrated bracelets are exempt from all rules.
 */

// Strap substrings that identify a black leather strap
export const BLACK_STRAP_TERMS  = ["black"];

// Strap substrings that identify a brown/warm leather strap
export const BROWN_STRAP_TERMS  = ["brown", "tan", "honey", "cognac", "caramel"];

// Shoe colors that satisfy a brown strap rule
export const BROWN_SHOE_COLORS  = ["brown", "tan", "cognac", "dark brown"];

// Shoe colors that satisfy a black strap rule
export const BLACK_SHOE_COLORS  = ["black"];

// Strap substrings that exempt from color matching (bracelet / integrated)
export const EXEMPT_STRAP_TERMS = ["bracelet", "integrated"];

// NATO / canvas / rubber: soft preference only, no hard block
export const CASUAL_STRAP_TERMS = ["nato", "canvas", "rubber"];
export const CASUAL_SHOE_SOFT_MATCH = ["white", "grey", "tan"]; // 1.0
export const CASUAL_SHOE_SOFT_MISS  = 0.8;

// Non-standard leather colors and their allowed shoe families
export const SPECIAL_STRAP_RULES = {
  navy:  { allowed: ["black", "white", "brown", "tan", "cognac", "dark brown"], fallback: 0.0 },
  grey:  { allowed: ["black", "white", "grey"],  fallback: 0.3 },
  teal:  { allowed: ["white", "black"],           fallback: 0.3 },
  olive: { allowed: ["white", "black"],           fallback: 0.3 },
  green: { allowed: ["white", "black"],           fallback: 0.3 },
};
