// Fix: move `const CORS = cors(event);` from module scope INTO handler function
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'netlify', 'functions');
const skip = new Set(['auto-heal.js','push-brief.js','supabase-keepalive.js',
  '_claudeClient.js','_blobCache.js','_cors.js']);

const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !skip.has(f));
let fixed = 0;

for (const f of files) {
  const fp = path.join(dir, f);
  let code = fs.readFileSync(fp, 'utf8');
  
  // Check if CORS = cors(event) is OUTSIDE handler function
  const corsLine = 'const CORS = cors(event);';
  const corsIdx = code.indexOf(corsLine);
  if (corsIdx < 0) continue; // no cors call
  
  const handlerIdx = code.indexOf('export async function handler(event');
  if (handlerIdx < 0) {
    // Try alternate: export const handler
    const altIdx = code.indexOf('export const handler');
    if (altIdx < 0) { console.log('SKIP (no handler):', f); continue; }
  }

  const handlerStart = code.indexOf('export async function handler(event');
  if (handlerStart < 0) { console.log('SKIP (no async handler):', f); continue; }
  
  // Is cors(event) BEFORE handler? If so, it's at module scope = broken
  if (corsIdx < handlerStart) {
    // Remove from module scope
    code = code.replace(corsLine + '\n', '');
    code = code.replace(corsLine, ''); // in case no trailing newline
    
    // Find the opening { of handler function
    const braceIdx = code.indexOf('{', code.indexOf('export async function handler(event'));
    if (braceIdx < 0) { console.log('SKIP (no handler brace):', f); continue; }
    
    // Insert CORS as first line inside handler
    // Check if there's already an OPTIONS check right after
    const afterBrace = code.slice(braceIdx + 1, braceIdx + 200);
    const optionsCheck = afterBrace.indexOf('OPTIONS');
    
    if (optionsCheck >= 0 && optionsCheck < 100) {
      // Insert before the OPTIONS check
      code = code.slice(0, braceIdx + 1) + '\n  ' + corsLine + code.slice(braceIdx + 1);
    } else {
      code = code.slice(0, braceIdx + 1) + '\n  ' + corsLine + '\n' + code.slice(braceIdx + 1);
    }
    
    fs.writeFileSync(fp, code, 'utf8');
    console.log('Fixed (moved inside handler):', f);
    fixed++;
  } else {
    console.log('OK (already inside handler):', f);
  }
}
console.log('\nFixed:', fixed, '/', files.length, 'files');
