const { execSync } = require('child_process');
try {
  const out = execSync('npx vitest run 2>&1', {
    cwd: 'C:\\Users\\User\\watch-advisor2',
    encoding: 'utf8',
    timeout: 180000,
  });
  printSummary(out);
} catch (e) {
  printSummary(e.stdout || '');
}

function printSummary(out) {
  const lines = out.split('\n');
  for (const l of lines) {
    const clean = l.replace(/\x1b\[[0-9;]*m/g, '');
    if (clean.match(/failed\)|FAIL|Error:|SyntaxError|Cannot find|Test Files|Tests |Duration/)) {
      console.log(clean.trim());
    }
  }
}
