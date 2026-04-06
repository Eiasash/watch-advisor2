// Surgical test fixes: only change CORS assertions from "*" to domain
// and add _cors mock where needed. Never touch other code.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'tests');

const DOMAIN = 'https://watch-advisor2.netlify.app';
const CORS_MOCK = `\nvi.mock("../netlify/functions/_cors.js", () => ({
  cors: () => ({
    "Access-Control-Allow-Origin": "${DOMAIN}",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  }),
}));\n`;

// These test CORS "*" assertions that need updating
const corsAssertionFiles = [
  'dailyPick.test.js',
  'extractOutfit.test.js',
  'generateEmbedding.test.js',
  'netlifyfunctions.test.js',
  'pushSubscribe.test.js',
  'skillSnapshot.test.js',
];

// Files that need _cors mock added (handler imports cors())
const needCorsMock = [
  'dailyPick.test.js',
  'extractOutfit.test.js',
  'generateEmbedding.test.js',
  'netlifyfunctions.test.js',
  'netlifyfunctions2.test.js',
  'pushBrief.test.js',
  'pushSubscribe.test.js',
  'skillSnapshot.test.js',
  'bulkTag.test.js',
  'colorsMultilayerHiRes.test.js',
];

for (const f of needCorsMock) {
  const fp = path.join(dir, f);
  if (!fs.existsSync(fp)) continue;
  let code = fs.readFileSync(fp, 'utf8');
  if (code.includes('_cors.js')) continue; // already has mock

  // Find insertion point: after the LAST complete vi.mock() statement
  const lines = code.split('\n');
  let insertLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('vi.mock(')) {
      // Scan forward to find the closing ");
      let depth = 0;
      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]) {
          if (ch === '(') depth++;
          if (ch === ')') depth--;
        }
        if (depth <= 0) { insertLine = j + 1; break; }
      }
    }
  }
  if (insertLine < 0) {
    // No vi.mock found — insert after last import
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) insertLine = i + 1;
    }
  }
  if (insertLine >= 0) {
    lines.splice(insertLine, 0, CORS_MOCK);
    code = lines.join('\n');
    fs.writeFileSync(fp, code, 'utf8');
    console.log('Added _cors mock:', f, 'at line', insertLine);
  }
}


// Fix CORS assertions: .toBe("*") -> .toBe(DOMAIN)
for (const f of corsAssertionFiles) {
  const fp = path.join(dir, f);
  if (!fs.existsSync(fp)) continue;
  let code = fs.readFileSync(fp, 'utf8');
  const before = code;
  
  // Pattern: .toBe("*") in lines that mention Access-Control or CORS
  code = code.replace(/\.toBe\(\s*"\*"\s*\)/g, `.toBe("${DOMAIN}")`);
  
  if (code !== before) {
    fs.writeFileSync(fp, code, 'utf8');
    console.log('Fixed CORS assertions:', f);
  }
}

// Fix pushBrief mock — needs extractText in _claudeClient mock
const pbPath = path.join(dir, 'pushBrief.test.js');
if (fs.existsSync(pbPath)) {
  let code = fs.readFileSync(pbPath, 'utf8');
  // The mock for _claudeClient needs extractText export
  if (code.includes('callClaude: vi.fn') && !code.includes('extractText')) {
    code = code.replace(
      /callClaude:\s*vi\.fn\(\)/,
      'callClaude: vi.fn(),\n  extractText: vi.fn((r) => r?.content?.[0]?.text ?? "")'
    );
    fs.writeFileSync(pbPath, code, 'utf8');
    console.log('Added extractText to pushBrief mock');
  }
}

console.log('\nDone. Run tests to verify.');
