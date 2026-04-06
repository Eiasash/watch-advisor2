const fs = require('fs');
const file = process.argv[2];
const from = parseInt(process.argv[3], 10) - 1;
const to = parseInt(process.argv[4], 10);
const lines = fs.readFileSync(file, 'utf8').split('\n');
for (let i = from; i < to && i < lines.length; i++) {
  console.log((i+1) + ': ' + lines[i]);
}
