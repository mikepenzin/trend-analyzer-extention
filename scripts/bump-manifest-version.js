const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '../extension/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function bumpVersion(version) {
  const parts = version.split('.').map(Number);
  parts[2]++;
  return parts.join('.');
}

manifest.version = bumpVersion(manifest.version);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Bumped manifest version to', manifest.version);
