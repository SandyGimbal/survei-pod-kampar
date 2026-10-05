const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const AdmZip = require('adm-zip');

// 1. Load Excel 63 POD
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

  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const lambda0 = (centralMeridian * Math.PI) / 180;

  const N = a / Math.sqrt(1 - e * e * Math.sin(phi) * Math.sin(phi));
  const T = Math.tan(phi) * Math.tan(phi);
  const C = ePrimeSq * Math.cos(phi) * Math.cos(phi);
  const A = (lambda - lambda0) * Math.cos(phi);

  const M =
    a *
    ((1 - (e * e) / 4 - (3 * e * e * e * e) / 64 - (5 * e * e * e * e * e * e) / 256) * phi -
      ((3 * e * e) / 8 + (3 * e * e * e * e) / 32 + (45 * e * e * e * e * e * e) / 1024) *
        Math.sin(2 * phi) +
      ((15 * e * e * e * e) / 256 + (45 * e * e * e * e * e * e) / 1024) * Math.sin(4 * phi) -
      ((35 * e * e * e * e * e * e) / 3072) * Math.sin(6 * phi));

  let easting =
    k0 *
      N *
      (A +
        ((1 - T + C) * Math.pow(A, 3)) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ePrimeSq) * Math.pow(A, 5)) / 120) +
    500000;
  let northing =
    k0 *
    (M +
      N *
        Math.tan(phi) *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4)) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ePrimeSq) * Math.pow(A, 6)) / 720));

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
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

// 2. Parse 63 Primary Target Items
const targetNamesSet = new Set();
const rawList = rawData.map((d, index) => {
  const kmz = parseKMZ(d['Keterangan KMZ'] || '');
  const lat = parseFloat(d['Latitude']);
  const lng = parseFloat(d['Longitude']);
  const utm = latLonToUTM(lat, lng);

  const cellRef = 'G' + (index + 2);
  const cell = sheet[cellRef];
  const gmapsLink =
    cell && cell.l && cell.l.Target
      ? cell.l.Target
      : `https://www.google.com/maps?q=${lat},${lng}`;

  const namaPod = d['Nama POD'] ? d['Nama POD'].trim() : '';
  targetNamesSet.add(namaPod.toLowerCase());

  return {
    no: d['No'],
    id_pod: kmz.ID_POD || `POD${String(index + 1).padStart(5, '0')}`,
    fid: kmz.FID !== undefined ? parseInt(kmz.FID) : index,
    nama_pod: namaPod,
    jenis_pod: d['Jenis POD'] ? d['Jenis POD'].trim() : 'Ramp',
    status_survey: 'Belum Dikunjungi',
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
    is_target_63: true,
    google_maps_url: gmapsLink,
    google_nav_url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    waze_url: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
  };
});

// 3. Build Schedule Definitions (Mulai 6 / 7 Oktober)
const scheduleDefs = [
  {
    day: 1,
    dateRange: 'Selasa / Rabu, 6 - 7 Okt 2026',
    title: 'Hari 1: Siak Hulu & Perhentian Raja Timur',
    corridor: 'Kec. Siak Hulu & Kec. Perhentian Raja (Lubuk Sakat, Sialang Kubang, Kampung Pinang)',
    desc: 'Mulai dari area timur perbatasan Pekanbaru. Jalur Pasir Putih & Marpoyan.',
    filter: (p) =>
      p.kecamatan === 'Siak Hulu' ||
      (p.kecamatan === 'Perhentian Raja' &&
        ['Lubuk Sakat', 'Sialang Kubang', 'Kampung Pinang'].includes(p.desa))
  },
  {
    day: 2,
    dateRange: 'Rabu / Kamis, 7 - 8 Okt 2026',
    title: 'Hari 2: Perhentian Raja (Pantai Raja)',
    corridor: 'Kec. Perhentian Raja (Desa Pantai Raja)',
    desc: 'Sentra RAM & Peron di Pantai Raja. Semua titik padat dan saling berdekatan.',
    filter: (p) => p.kecamatan === 'Perhentian Raja' && p.desa === 'Pantai Raja'
  },
  {
    day: 3,
    dateRange: 'Kamis / Jumat, 8 - 9 Okt 2026',
    title: 'Hari 3: Tambang Sentral (Kuapan & Sekitarnya)',
    corridor: 'Kec. Tambang (Desa Kuapan, Rimbo Panjang, Kualu)',
    desc: 'Konsentrasi RAM sawit Desa Kuapan yang sangat aktif serta Rimbo Panjang & Kualu.',
    filter: (p) =>
      p.kecamatan === 'Tambang' && ['Kuapan', 'Rimbo Panjang', 'Kualu'].includes(p.desa)
  },
  {
    day: 4,
    dateRange: 'Jumat / Sabtu, 9 - 10 Okt 2026',
    title: 'Hari 4: Tambang Barat & Kampa',
    corridor: 'Kec. Tambang (Padang Luas, Parit Baru) & Kec. Kampa (Pulau Rambai, Sungai Putih, Pulau Birandang)',
    desc: 'Koridor jalan poros Tambang Barat menyambung ke seluruh sentra RAM di Kecamatan Kampa.',
    filter: (p) =>
      (p.kecamatan === 'Tambang' && ['Padang Luas', 'Parit Baru'].includes(p.desa)) ||
      p.kecamatan === 'Kampa'
  },
  {
    day: 5,
    dateRange: 'Sabtu / Minggu, 10 - 11 Okt 2026',
    title: 'Hari 5: Kampar, Kampar Utara & Rumbio Jaya',
    corridor: 'Kec. Kampar (Pulau Sarak, Rumbio), Kampar Utara (Muara Jalai, Sawah) & Rumbio Jaya (Bukit Kratai, Teratak)',
    desc: 'Menyusuri koridor sungai Kampar utara dan sekitarnya.',
    filter: (p) =>
      p.kecamatan === 'Kampar' || p.kecamatan === 'Kampar Utara' || p.kecamatan === 'Rumbio Jaya'
  },
  {
    day: 6,
    dateRange: 'Minggu / Senin, 11 - 12 Okt 2026',
    title: 'Hari 6: Bangkinang & Bangkinang Kota',
    corridor: 'Kec. Bangkinang (Bukit Payung, Pasir Sialang) & Kec. Bangkinang Kota (Ridan Permai)',
    desc: 'Perkebunan transmigrasi Bukit Payung dan Pasir Sialang di lingkar kota Bangkinang.',
    filter: (p) => p.kecamatan === 'Bangkinang' || p.kecamatan === 'Bangkinang Kota'
  },
  {
    day: 7,
    dateRange: 'Senin / Selasa, 12 - 13 Okt 2026',
    title: 'Hari 7: Salo, Kuok & Kampar Hulu (Ujung Barat)',
    corridor: 'Kec. Salo, Kuok (Merangin), XIII Koto Kampar (Batu Bersurat, Gunung Bungsu) & Koto Kampar Hulu (Tanjung)',
    desc: 'Koridor barat arah perbatasan Riau-Sumbar & PLTA Koto Panjang.',
    filter: (p) => ['Salo', 'Kuok', 'Xiii Koto Kampar', 'Koto Kampar Hulu'].includes(p.kecamatan)
  }
];

let finalItems = [];
const scheduleSummary = [];

scheduleDefs.forEach((def) => {
  const matched = rawList.filter(def.filter);
  const ordered = orderPointsNearestNeighbor(matched);

  let routeDistanceKm = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    routeDistanceKm += haversine(
      ordered[i].lat,
      ordered[i].lng,
      ordered[i + 1].lat,
      ordered[i + 1].lng
    );
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
    tanggal: def.dateRange,
    judul: def.title,
    koridor: def.corridor,
    deskripsi: def.desc,
    jumlah_titik: dayItems.length,
    estimasi_jarak_km: Math.round(routeDistanceKm * 10) / 10,
    titik_mulai: `${dayItems[0].nama_pod} (${dayItems[0].desa})`,
    titik_akhir: `${dayItems[dayItems.length - 1].nama_pod} (${dayItems[dayItems.length - 1].desa})`
  });
});

// 4. Parse ALL 517 points from Data-Ada/Prioritas Area POD.kmz
const zip517 = new AdmZip(path.join(__dirname, 'Data-Ada', 'Prioritas Area POD.kmz'));
const kml517 = zip517.readAsText('doc.kml');
const placemarks517 = kml517.split('<Placemark');

const kamparAll181 = [];
const sumutAll336 = [];

for (let i = 1; i < placemarks517.length; i++) {
  const pm = placemarks517[i];
  const getField = (name) => {
    const reg = new RegExp(`${name}<\\/td>\\s*<td>(.*?)<\\/td>`, 'i');
    const m = pm.match(reg);
    return m ? m[1].trim() : '';
  };
  const coordM = pm.match(/<coordinates>\s*([0-9\.\-]+),([0-9\.\-]+)/);
  const lat = coordM ? parseFloat(coordM[2]) : parseFloat(getField('Lat_POD'));
  const lng = coordM ? parseFloat(coordM[1]) : parseFloat(getField('Long_POD'));
  const dist = getField('District_P');
  const name = getField('Name_POD');
  const isTarget = targetNamesSet.has(name.toLowerCase());
  const utm = latLonToUTM(lat, lng);

  const entry = {
    fid: getField('FID'),
    id_pod: getField('ID_POD'),
    nama_pod: name,
    provinsi: getField('Province_P'),
    kabupaten: dist,
    kecamatan: getField('SubDistric'),
    desa: getField('Village_PO'),
    jenis_pod: getField('Type_POD') || 'Ramp',
    active: getField('Active'),
    priority: getField('Priority'),
    source: getField('Source_POD'),
    year: getField('Year_POD'),
    info_mill: getField('Info_Mill'),
    lat: lat,
    lng: lng,
    utm_string: utm.utmFull,
    is_target_63: isTarget,
    google_maps_url: `https://www.google.com/maps?q=${lat},${lng}`,
    google_nav_url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    waze_url: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
  };

  if (dist.toLowerCase() === 'kampar') {
    kamparAll181.push(entry);
  } else {
    sumutAll336.push(entry);
  }
}

// 5. Group by Kecamatan (13 Target Kecamatan & All 20 Kampar Kecamatan)
const kecamatanStats = {};
finalItems.forEach((item) => {
  const kec = item.kecamatan;
  if (!kecamatanStats[kec]) {
    kecamatanStats[kec] = {
      nama_kecamatan: kec,
      total_titik: 0,
      total_sebelumnya: 0,
      desa_list: {},
      points: []
    };
  }
  kecamatanStats[kec].total_titik += 1;
  kecamatanStats[kec].desa_list[item.desa || 'Lainnya'] =
    (kecamatanStats[kec].desa_list[item.desa || 'Lainnya'] || 0) + 1;
  kecamatanStats[kec].points.push(item);
});

// Also tally all 181 Kampar points per kecamatan
kamparAll181.forEach((item) => {
  const kec = item.kecamatan;
  if (kecamatanStats[kec]) {
    kecamatanStats[kec].total_sebelumnya += 1;
  }
});

const kecamatanList = Object.values(kecamatanStats).sort((a, b) => b.total_titik - a.total_titik);

// 6. Load PKS Prioritas from Data-Ada/PKS Prioritas.kmz
const pksList = [];
try {
  const pksZip = new AdmZip(path.join(__dirname, 'Data-Ada', 'PKS Prioritas.kmz'));
  const pksKml = pksZip.readAsText('doc.kml');
  const pksPlacemarks = pksKml.split('<Placemark');
  for (let i = 1; i < pksPlacemarks.length; i++) {
    const pm = pksPlacemarks[i];
    const nameM = pm.match(/<name>(.*?)<\/name>/);
    const millM = pm.match(/Mill_Name<\/td>\s*<td>(.*?)<\/td>/);
    const compM = pm.match(/Company_Na<\/td>\s*<td>(.*?)<\/td>/);
    const distM = pm.match(/District<\/td>\s*<td>(.*?)<\/td>/);
    const addrM = pm.match(/Address<\/td>\s*<td>(.*?)<\/td>/);
    const coordM = pm.match(/<coordinates>\s*([0-9\.\-]+),([0-9\.\-]+)/);

    if (coordM) {
      const lat = parseFloat(coordM[2]);
      const lng = parseFloat(coordM[1]);
      pksList.push({
        nama_pks: millM ? millM[1].trim() : nameM ? nameM[1] : 'PKS Prioritas',
        perusahaan: compM ? compM[1].trim() : '',
        kabupaten: distM ? distM[1].trim() : '',
        alamat: addrM ? addrM[1].trim() : '',
        lat: lat,
        lng: lng,
        google_maps_url: `https://www.google.com/maps?q=${lat},${lng}`,
        google_nav_url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
      });
    }
  }
} catch (e) {
  console.warn('Could not parse PKS Prioritas.kmz:', e.message);
}

const masterOutput = {
  metadata: {
    total_objek_target: finalItems.length,
    total_kampar_prioritas: kamparAll181.length,
    total_database_517: placemarks517.length - 1,
    total_kecamatan_target: kecamatanList.length,
    kabupaten: 'Kampar, Riau',
    target_harian: '10 titik / hari (Mulai 6 - 7 Oktober 2026)',
    mobile_url: 'http://192.168.100.107:3000',
    local_laragon_url: 'http://localhost/Survei-POD/',
    generated_at: new Date().toISOString()
  },
  kecamatan_list: kecamatanList,
  schedule: scheduleSummary,
  pks_list: pksList,
  pod_list: finalItems,
  kampar_all_181: kamparAll181
};

const outputJs = `// Auto-generated POD Survey Mobile Master Database with 517 History
window.POD_SURVEY_MASTER_DATA = ${JSON.stringify(masterOutput, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, 'assets', 'pod_database.js'), outputJs);
fs.writeFileSync(path.join(__dirname, 'assets', 'pod_database.json'), JSON.stringify(masterOutput, null, 2));

console.log('Successfully updated assets/pod_database.js and assets/pod_database.json');
console.log('Target 63:', finalItems.length);
console.log('Kampar All 181:', kamparAll181.length);
console.log('PKS:', pksList.length);
