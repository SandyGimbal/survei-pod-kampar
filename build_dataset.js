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
    - (35 * e * e * e * e / 256 + 45 * e * e * e * e / 1024) * Math.sin(4 * phi) // standard term
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

function orderPointsNearestNeighbor(pts) {
  if (pts.length <= 1) return pts;
  const remaining = [...pts];
  const ordered = [];
  
  // Start from the most eastward point (closest to Pekanbaru / entry point)
  let current = remaining.reduce((prev, curr) => (curr.lng > prev.lng ? curr : prev));
  ordered.push(current);
  remaining.splice(remaining.indexOf(current), 1);

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let minD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
      if (d < minD) {
        minD = d;
        nearestIdx = i;
      }
    }
    current = remaining[nearestIdx];
    ordered.push(current);
    remaining.splice(nearestIdx, 1);
  }
  return ordered;
}

const rawList = rawData.map((d, index) => {
  const kmz = parseKMZ(d['Keterangan KMZ'] || '');
  const lat = parseFloat(d['Latitude']);
  const lng = parseFloat(d['Longitude']);
  const utm = latLonToUTM(lat, lng);

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
    status_survey: 'Belum Disurvei', // Default initial status
    status_target: d['Status'] ? d['Status'].trim() : 'Dilakukan',
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

// Balanced 7-day Schedule definitions:
const scheduleDefs = [
  {
    day: 1,
    title: 'Hari 1: Siak Hulu & Perhentian Raja Timur',
    corridor: 'Kec. Siak Hulu & Kec. Perhentian Raja (Lubuk Sakat, Sialang Kubang, Kampung Pinang)',
    desc: 'Area paling timur (akses cepat dari Pekanbaru via Pasir Putih & Marpoyan). 10 titik survey berurutan.',
    filter: p => p.kecamatan === 'Siak Hulu' || 
                 (p.kecamatan === 'Perhentian Raja' && ['Lubuk Sakat', 'Sialang Kubang', 'Kampung Pinang'].includes(p.desa))
  },
  {
    day: 2,
    title: 'Hari 2: Perhentian Raja (Pantai Raja)',
    corridor: 'Kec. Perhentian Raja (Desa Pantai Raja)',
    desc: 'Pusat sentra RAM & Peron di Pantai Raja. Semua titik sangat padat & berdekatan di koridor jalan poros sawit.',
    filter: p => p.kecamatan === 'Perhentian Raja' && p.desa === 'Pantai Raja'
  },
  {
    day: 3,
    title: 'Hari 3: Tambang Sentral (Kuapan & Sekitarnya)',
    corridor: 'Kec. Tambang (Desa Kuapan, Rimbo Panjang, Kualu)',
    desc: 'Sentra RAM sawit Desa Kuapan yang sangat aktif serta titik strategis Rimbo Panjang & Kualu.',
    filter: p => p.kecamatan === 'Tambang' && ['Kuapan', 'Rimbo Panjang', 'Kualu'].includes(p.desa)
  },
  {
    day: 4,
    title: 'Hari 4: Tambang Barat & Kampa',
    corridor: 'Kec. Tambang (Padang Luas, Parit Baru) & Kec. Kampa (Pulau Rambai, Sungai Putih, Pulau Birandang)',
    desc: 'Menyusuri koridor Tambang bagian barat dan menyeberang ke seluruh sentra RAM di Kecamatan Kampa.',
    filter: p => (p.kecamatan === 'Tambang' && ['Padang Luas', 'Parit Baru'].includes(p.desa)) ||
                 p.kecamatan === 'Kampa'
  },
  {
    day: 5,
    title: 'Hari 5: Kampar, Kampar Utara & Rumbio Jaya',
    corridor: 'Kec. Kampar (Pulau Sarak, Rumbio), Kampar Utara (Muara Jalai, Sawah) & Rumbio Jaya (Bukit Kratai, Teratak)',
    desc: 'Koridor sungai Kampar utara dan sekitarnya. 9 titik RAM/Peron saling terhubung.',
    filter: p => p.kecamatan === 'Kampar' || p.kecamatan === 'Kampar Utara' || p.kecamatan === 'Rumbio Jaya'
  },
  {
    day: 6,
    title: 'Hari 6: Bangkinang & Bangkinang Kota',
    corridor: 'Kec. Bangkinang (Bukit Payung, Pasir Sialang) & Kec. Bangkinang Kota (Ridan Permai)',
    desc: 'Kawasan perkebunan transmigrasi Bukit Payung dan Pasir Sialang di lingkar kota Bangkinang.',
    filter: p => p.kecamatan === 'Bangkinang' || p.kecamatan === 'Bangkinang Kota'
  },
  {
    day: 7,
    title: 'Hari 7: Salo, Kuok & Kampar Hulu (Ujung Barat)',
    corridor: 'Kec. Salo, Kuok (Merangin), XIII Koto Kampar (Batu Bersurat, Gunung Bungsu) & Koto Kampar Hulu (Tanjung)',
    desc: 'Kawasan barat ke arah perbatasan Sumbar & waduk PLTA Koto Panjang.',
    filter: p => ['Salo', 'Kuok', 'Xiii Koto Kampar', 'Koto Kampar Hulu'].includes(p.kecamatan)
  }
];

let finalItems = [];
const scheduleSummary = [];

scheduleDefs.forEach(def => {
  const matched = rawList.filter(def.filter);
  const ordered = orderPointsNearestNeighbor(matched);

  let routeDistanceKm = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    routeDistanceKm += haversine(ordered[i].lat, ordered[i].lng, ordered[i+1].lat, ordered[i+1].lng);
  }

  const dayItems = ordered.map((item, idx) => ({
    ...item,
    hari_ke: def.day,
    urutan_hari: idx + 1,
    label_urutan: `H${def.day}-${String(idx + 1).padStart(2, '0')}`
  }));

  finalItems = finalItems.concat(dayItems);

  scheduleSummary.push({
    hari: def.day,
    judul: def.title,
    koridor: def.corridor,
    deskripsi: def.desc,
    jumlah_titik: dayItems.length,
    estimasi_jarak_km: Math.round(routeDistanceKm * 10) / 10,
    titik_mulai: dayItems[0].nama_pod + ' (' + dayItems[0].desa + ')',
    titik_akhir: dayItems[dayItems.length - 1].nama_pod + ' (' + dayItems[dayItems.length - 1].desa + ')'
  });
});

console.log('Final sorted items total:', finalItems.length);

const outData = {
  metadata: {
    total_objek: finalItems.length,
    kabupaten: 'Kampar, Riau',
    sumber_file: 'Data_63_Objek_POD_dari_KMZ_GoogleMaps.xlsx',
    target_harian: '10 titik / hari (Selesai dalam 7 hari)',
    generated_at: new Date().toISOString()
  },
  schedule: scheduleSummary,
  pod_list: finalItems
};

const outputJs = `// Auto-generated POD Survey Master Database
window.POD_SURVEY_MASTER_DATA = ${JSON.stringify(outData, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, 'assets', 'pod_database.js'), outputJs);
fs.writeFileSync(path.join(__dirname, 'assets', 'pod_database.json'), JSON.stringify(outData, null, 2));

console.log('Successfully generated assets/pod_database.js and assets/pod_database.json');
