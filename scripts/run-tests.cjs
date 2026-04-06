const { execSync } = require('child_process');
try {
  const out = execSync('npx vitest run 2>&1', {
    cwd: 'C:\\Users\\User\\watch-advisor2',
    encoding: 'utf8',
    timeout: 180000,
  });
  // Print only summary lines
  const lines = out.split('\n');
  for (const l of lines) {
    const clean = l.replace(/\x1b\[[0-9;]*m/g, '');
    if (clean.match(/Test Files|Tests |failed\)|Duration/)) {
      console.log(clean.trim());
    }
  }
} catch (e) {
  const out = e.stdout || '';
  const lines = out.split('\n');
  for (const l of lines) {
    const clean = l.replace(/\x1b\[[0-9;]*m/g, '');
    if (clean.match(/Test Files|Tests |failed\)|Duration/)) {
      console.log(clean.trim());
    }
  }
}
