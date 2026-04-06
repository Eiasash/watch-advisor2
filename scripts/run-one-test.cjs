const { execSync } = require('child_process');
const testFile = process.argv[2];
if (!testFile) { console.log('Usage: node run-one-test.cjs <testfile>'); process.exit(1); }
try {
  const out = execSync(`npx vitest run ${testFile} 2>&1`, {
    cwd: 'C:\\Users\\User\\watch-advisor2',
    encoding: 'utf8', timeout: 60000,
  });
  // Show failed tests and errors
  for (const l of out.split('\n')) {
    const c = l.replace(/\x1b\[[0-9;]*m/g, '');
    if (c.match(/FAIL|Error|×|assert|expect|500|502|Test Files|Tests /i)) console.log(c.trim());
  }
} catch (e) {
  for (const l of (e.stdout||'').split('\n')) {
    const c = l.replace(/\x1b\[[0-9;]*m/g, '');
    if (c.match(/FAIL|Error|×|assert|expect|500|502|Test Files|Tests |stderr/i)) console.log(c.trim());
  }
}
