/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
/*
  this is post-processing script for compiled worker.js
  1) remove sourcesContent from sourceMap
  2) trim a bit sourceMap.sources so file lengths are not long
  3) remove comments
*/
const filename = 'dist/worker.js';
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
global.atob = (b64Encoded) => Buffer.from(b64Encoded, 'base64').toString('binary');

let lines = ('' + require('fs').readFileSync(filename)).split('\n');
require('fs').writeFileSync(filename + '.orig', lines.join('\n'));

let [beforeMap, sourceMap] = lines[lines.length - 1].split('sourceMappingURL=')[1].split('base64,');
sourceMap = JSON.parse(atob(sourceMap));

// point 1
sourceMap.sourcesContent = '';

// point 2
sourceMap.sources = sourceMap.sources.map((x) => x.split(/\/\.\//)[1] || 'khm');

sourceMap = btoa(JSON.stringify(sourceMap));

lines[lines.length - 1] = 'var sourceMappingURL="' + `${beforeMap}base64,${sourceMap}` + '"';
lines[lines.length] = 'var buildMetadata=' + JSON.stringify({ time: Date.now() });

// point 3: remove comments
let res = lines
  .join('\n')
  .replace(/\n[ \t]*\/\*(.*?)\*\//gs, (a, b) => {
    if (b.substring(1).includes('\n')) return '\n' + b.replace(/[^\n]/g, '');
    return '\n';
  })
  .replace(/ \/\/[^/"\n]*\n/g, '\n')
  .replace(/\n[ \t]*\/\/.*/g, '\n');

// NOTE: MAY NOT WORK FOR MULTILINE STRING!
// res = res.replace(/\n[ \t]+/g, "\n")

require('fs').writeFileSync(filename, res);
console.log(`${filename} length = ${res.length}`);

const wranglerToml = '' + require('fs').readFileSync('./wrangler.toml');

if (wranglerToml.includes('xxxxx') || wranglerToml.includes('XXXXX') || wranglerToml.includes('.....')) {
  console.log('ERROR: please remove stub values from wrangler.toml');
}
