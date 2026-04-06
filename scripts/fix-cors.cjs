const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'netlify', 'functions');
const skip = new Set([
  'auto-heal.js','push-brief.js','supabase-keepalive.js',
  '_claudeClient.js','_blobCache.js','_cors.js'
]);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !skip.has(f));

let updated = 0;
for (const f of files) {
  const fp = path.join(dir, f);
  let code = fs.readFileSync(fp, 'utf8');
  if (code.includes('_cors.js')) {
    console.log('SKIP (already has _cors):', f);
    continue;
  }

  // 1. Add import after last import statement
  const lines = code.split('\n');
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) lastImport = i;
  }
  if (lastImport >= 0) {
    lines.splice(lastImport + 1, 0, 'import { cors } from "./_cors.js";');
    code = lines.join('\n');
  }

  // 2. Replace multiline CORS = { ... Access-Control ... }
  code = code.replace(
    /const CORS = \{[\s\S]*?Access-Control[\s\S]*?\};/g,
    'const CORS = cors(event);'
  );

  // 3. Also handle const headers = { ... Access-Control ... }
  code = code.replace(
    /const headers = \{[\s\S]*?Access-Control[\s\S]*?\};/g,
    'const headers = cors(event);'
  );

  fs.writeFileSync(fp, code, 'utf8');
  console.log('Updated:', f);
  updated++;
}
console.log(`\nDone. ${updated}/${files.length} files updated.`);
