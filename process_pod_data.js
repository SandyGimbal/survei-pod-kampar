const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const excelPath = path.join(__dirname, 'Data_63_Objek_POD_dari_KMZ_GoogleMaps.xlsx');
const wb = xlsx.readFile(excelPath);
const sheet = wb.Sheets['63 Objek POD'];
const rawData = xlsx.utils.sheet_to_json(sheet);

function latLonToUTM(lat, lon) {
  const zone = Math.floor((lon + 180) / 6) + 1;
  const centralMeridian = (zone - 1) * 6 - 180 + 3;
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e = Math.sqrt(2 * f - f * f);
  const ePrimeSq = (e * e) / (1 - e * e);

  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  const lambda0 = centralMeridian * Math.PI / 180;

  const N = a / Math.sqrt(1 - e * e * Math.sin(phi) * Math.sin(phi));
  const T = Math.tan(phi) * Math.tan(phi);
  const C = ePrimeSq * Math.cos(phi) * Math.cos(phi);
  const A = (lambda - lambda0) * Math.cos(phi);

  const M = a * ((1 - e * e / 4 - 3 * e * e * e * e / 64 - 5 * e * e * e * e * e * e / 256) * phi
    - (3 * e * e / 8 + 3 * e * e * e * e / 32 + 45 * e * e * e * e * e * e / 1024) * Math.sin(2 * phi)
    + (15 * e * e * e * e / 256 + 45 * e * e * e * e * e * e / 1024) * Math.sin(4 * phi)
    - (35 * e * e * e * e * e * e / 3072) * Math.sin(6 * phi));

  let easting = k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ePrimeSq) * Math.pow(A, 5) / 120) + 500000;
  let northing = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ePrimeSq) * Math.pow(A, 6) / 720));

  if (lat < 0) {
    northing += 10000000;
  }
  const zoneStr = zone + (lat >= 0 ? 'N' : 'S');
  return {
    zone: zoneStr,
    easting: Math.round(easting),
    northing: Math.round(northing),
    utmFull: `${zoneStr} ${Math.round(easting)}m E ${Math.round(northing)}m N`
  };
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function parseKMZ(txt) {
  const res = {};
  const patterns = [
    ['FID', /FID\s+(\d+)/],
    ['ID_POD', /ID_POD\s+([A-Za-z0-9_]+)/],
    ['Name_POD', /Name_POD\s+(.*?)\s+(Capacity_E|Lat_POD)/],
    ['District', /District_P\s+([A-Za-z\s]+?)\s+SubDistric/],
    ['SubDistrict', /SubDistric\s+([A-Za-z\s]+?)\s+Village_PO/],
    ['Village', /Village_PO\s+([A-Za-z\s]+?)\s+Source_POD/],
    ['Type_POD', /Type_POD\s+([A-Za-z\s]+?)\s+Active/],
    ['Priority', /Priority\s+(Priority\s+\d+|[^\s]+)/],
    ['SurveyStatus', /Survey\s+(Belum Di Survey|Sudah Di Survey|.*?)(?:\s+function|$)/]
  ];
  for (const [key, reg] of patterns) {
    const m = (txt || '').match(reg);
    if (m) res[key] = m[1].trim();
  }
  return res;
}

const points = rawData.map((d, index) => {
  const kmz = parseKMZ(d['Keterangan KMZ'] || '');
  const lat = parseFloat(d['Latitude']);
  const lng = parseFloat(d['Longitude']);
  const utm = latLonToUTM(lat, lng);

  // Hyperlink from cell G{row}
  const cellRef = 'G' + (index + 2);
  const cell = sheet[cellRef];
  const gmapsLink = (cell && cell.l && cell.l.Target) 
    ? cell.l.Target 
    : `https://www.google.com/maps?q=${lat},${lng}`;

  return {
    no: d['No'],
    id_pod: kmz.ID_POD || `POD${String(index + 1).padStart(5, '0')}`,
    fid: kmz.FID !== undefined ? parseInt(kmz.FID) : index,
    nama_pod: d['Nama POD'] ? d['Nama POD'].trim() : '',
    jenis_pod: d['Jenis POD'] ? d['Jenis POD'].trim() : 'Ramp',
    status_survey: d['Status'] ? d['Status'].trim() : 'Dilakukan',
    lat: lat,
    lng: lng,
    utm_zone: utm.zone,
    utm_easting: utm.easting,
    utm_northing: utm.northing,
    utm_string: utm.utmFull,
    provinsi: 'Riau',
    kabupaten: kmz.District || 'Kampar',
    kecamatan: kmz.SubDistrict || 'Kampar',
    desa: kmz.Village || '',
    priority: kmz.Priority || 'Priority 1',
    google_maps_url: gmapsLink,
    waze_url: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
  };
});

// We want to partition the 63 points into 7 days (or 6-7 days, with ~9-10 points/day)
// Kampar spans from East (Siak Hulu / Perhentian Raja ~ 101.56) to West (XIII Koto Kampar ~ 100.60)
// Let's create an optimal clustering where surveyor travels efficiently day by day!

// Geographical corridors:
// Day 1: Siak Hulu (4) + Perhentian Raja Timur (Lubuk Sakat, Sialang Kubang, Kampung Pinang utara) -> 10 points
// Day 2: Perhentian Raja Barat (Pantai Raja) -> 9 points
// Day 3: Tambang (Kuapan, Rimbo Panjang, Kualu, Padang Luas, Parit Baru) -> 10 points (or 12)
// Day 4: Kampa (Pulau Rambai, Pulau Birandang, Sungai Putih) + Kampar (Pulau Sarak, Rumbio) -> 10 points
// Day 5: Rumbio Jaya (Bukit Kratai, Teratak) + Kampar Utara (Muara Jalai, Sawah) + Tambang barat -> 9 points
// Day 6: Bangkinang (Bukit Payung, Pasir Sialang) + Bangkinang Kota (Ridan Permai) -> 8 points
// Day 7: Salo (Salo, Salo Timur) + Kuok (Merangin) + XIII Koto Kampar (Batu Bersurat, Gunung Bungsu) + Koto Kampar Hulu (Tanjung) -> 7 points

// Let's test route sequencing using a greedy nearest neighbor within each cluster to get the smoothest driving order!
console.log('Total points processed:', points.length);

fs.writeFileSync(path.join(__dirname, 'pod_data_raw.json'), JSON.stringify(points, null, 2));
console.log('Successfully saved pod_data_raw.json');
