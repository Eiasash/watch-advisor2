const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'tests');

const CORS_MOCK = `vi.mock("../netlify/functions/_cors.js", () => ({
  cors: () => ({
    "Access-Control-Allow-Origin": "https://watch-advisor2.netlify.app",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  }),
}));`;

const targets = [
  'bulkTag.test.js',
  'extractOutfit.test.js',
  'dailyPick.test.js',
  'netlifyfunctions.test.js',
  'netlifyfunctions2.test.js',
  'pushBrief.test.js',
  'pushSubscribe.test.js',
  'skillSnapshot.test.js',
  'generateEmbedding.test.js',
];

for (const f of targets) {
  const fp = path.join(dir, f);
  if (!fs.existsSync(fp)) { console.log('SKIP:', f); continue; }
  let code = fs.readFileSync(fp, 'utf8');
  const orig = code;

  // 1. Add _cors mock if missing
  if (!code.includes('_cors')) {
    // Find the LAST vi.mock() call and insert after it
    const re = /vi\.mock\([^)]*\)\s*;?\s*(\n\s*\}\s*\)\s*;?)?/g;
    let lastIdx = -1, lastLen = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      lastIdx = m.index;
      lastLen = m[0].length;
    }
    if (lastIdx >= 0) {
      const insertPos = lastIdx + lastLen;
      code = code.slice(0, insertPos) + '\n\n' + CORS_MOCK + '\n' + code.slice(insertPos);
    } else {
      // No vi.mock found, insert after imports
      const lines = code.split('\n');
      let ins = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ')) ins = i + 1;
      }
      lines.splice(ins, 0, '', CORS_MOCK, '');
      code = lines.join('\n');
    }
  }

  // 2. Fix CORS header expectations: "*" -> domain
  code = code.replace(
    /"Access-Control-Allow-Origin"[^"]*"[*]"/g,
    '"Access-Control-Allow-Origin": "https://watch-advisor2.netlify.app"'
  );
  code = code.replace(
    /\.toBe\(\s*"\*"\s*\)/g,
    '.toBe("https://watch-advisor2.netlify.app")'
  );

  // 3. Add origin header to handler events missing it
  // Pattern: headers: {} -> headers: { origin: "..." }
  code = code.replace(
    /headers:\s*\{\s*\}/g,
    'headers: { origin: "https://watch-advisor2.netlify.app" }'
  );

  if (code !== orig) {
    fs.writeFileSync(fp, code, 'utf8');
    console.log('Fixed:', f);
  } else {
    console.log('Unchanged:', f);
  }
}
console.log('Done.');
