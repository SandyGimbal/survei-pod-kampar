const fs = require('fs');
const path = require('path');

const leafletCss = fs.readFileSync(path.join(__dirname, 'assets', 'vendor', 'leaflet', 'leaflet.css'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
const leafletJs = fs.readFileSync(path.join(__dirname, 'assets', 'vendor', 'leaflet', 'leaflet.js'), 'utf8');
const xlsxJs = fs.readFileSync(path.join(__dirname, 'assets', 'vendor', 'xlsx.full.min.js'), 'utf8');
const dbJs = fs.readFileSync(path.join(__dirname, 'assets', 'pod_database.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Replace external css with inline css
html = html.replace('<link rel="stylesheet" href="assets/vendor/leaflet/leaflet.css">', `<style>${leafletCss}</style>`);
html = html.replace('<link rel="stylesheet" href="style.css">', `<style>${styleCss}</style>`);

// Replace external scripts with inline scripts
const scriptsBlock = `
<script>${leafletJs}</script>
<script>${xlsxJs}</script>
<script>${dbJs}</script>
<script>${appJs}</script>
`;

html = html.replace(/<script src="assets\/vendor\/leaflet\/leaflet\.js"><\/script>[\s\S]*?<script src="app\.js"><\/script>/, scriptsBlock);

fs.writeFileSync(path.join(__dirname, 'Survei_POD_Kampar_Standalone.html'), html);
console.log('Successfully bundled Survei_POD_Kampar_Standalone.html');
