#!/usr/bin/env node
// One-shot: fix three JSX strings in SettingsPanel.jsx where backslash-u
// escapes were written as literal text inside JSX (where they don't decode).
// After this runs, source contains actual emoji codepoints, not "\uXXXX".
import fs from "node:fs";
import path from "node:path";

const file = path.resolve("src/components/SettingsPanel.jsx");
let text = fs.readFileSync(file, "utf8");
const before = text.length;

// Each pair uses double-backslash so the runtime string is literal "\u..."
// matching the raw text in the source file.
const subs = [
  ["\\ud83d\\uddd1\\ufe0f Clear Local Cache & Reload",
   "\u{1F5D1}\u{FE0F} Clear Local Cache & Reload"],
  ["\\ud83d\\uddd1 Clear Local Cache & Reload",
   "\u{1F5D1}\u{FE0F} Clear Local Cache & Reload"],
  ["\\ud83d\\udd04 Force Update \\u2014 Nuke Cache + SW",
   "\u{1F504} Force Update — Nuke Cache + SW"],
  ["title=\"\\ud83e\\udeb2 Debug Console\"",
   "title=\"\u{1FAB2} Debug Console\""],
];

let changes = 0;
for (const [from, to] of subs) {
  if (text.includes(from)) {
    text = text.split(from).join(to);
    changes++;
    console.log("  fixed:", JSON.stringify(from.slice(0, 60)));
  }
}

fs.writeFileSync(file, text, "utf8");
console.log(`changes: ${changes}, size delta: ${text.length - before}`);
