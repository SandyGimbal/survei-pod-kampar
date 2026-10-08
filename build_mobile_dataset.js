const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const AdmZip = require('adm-zip');

// 1. Coordinate & Utility Functions
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

// 2. Load 63 Excel Targets first to get target names
const excelPath = path.join(__dirname, 'Data_63_Objek_POD_dari_KMZ_GoogleMaps.xlsx');
const wb = xlsx.readFile(excelPath);
const sheet = wb.Sheets['63 Objek POD'];
const rawData = xlsx.utils.sheet_to_json(sheet);

const targetNamesSet = new Set();
rawData.forEach((d) => {
  if (d['Nama POD']) targetNamesSet.add(d['Nama POD'].trim().toLowerCase());
});

// 3. Parse ALL 517 points from Data-Ada/Prioritas Area POD.kmz
const zip517 = new AdmZip(path.join(__dirname, 'Data-Ada', 'Prioritas Area POD.kmz'));
const kml517 = zip517.readAsText('doc.kml');
const placemarks517 = kml517.split('<Placemark');

const kamparAll181 = [];
const sumutAll336 = [];
const kamparIndex = {};

const RAW_FIELD_KEYS = [
  'FID',
  'ID_POD',
  'Name_POD',
  'Capacity_E',
  'Capacity_D',
  'Lat_POD',
  'Long_POD',
  'Country_PO',
  'Province_P',
  'District_P',
  'SubDistric',
  'Village_PO',
  'Source_POD',
  'Year_POD',
  'Type_POD',
  'Active',
  'Weightbrid',
  'Info_Mill',
  'Phone_Numb',
  'Contact_In',
  'Priority',
  'Survey'
];

for (let i = 1; i < placemarks517.length; i++) {
  const pm = placemarks517[i];
  
  const rawFields = {};
  const rowRegex = /<tr[^>]*>\s*<td>\s*([A-Za-z0-9_]+)\s*<\/td>\s*<td>(.*?)<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = rowRegex.exec(pm)) !== null) {
    rawFields[m[1].trim()] = m[2].trim();
  }

  // Ensure all 22 standard fields exist in rawFields
  RAW_FIELD_KEYS.forEach(k => {
    if (rawFields[k] === undefined) rawFields[k] = '';
  });

  const coordM = pm.match(/<coordinates>\s*([0-9\.\-]+),([0-9\.\-]+)/);
  const lat = coordM ? parseFloat(coordM[2]) : parseFloat(rawFields.Lat_POD || 0);
  const lng = coordM ? parseFloat(coordM[1]) : parseFloat(rawFields.Long_POD || 0);
  const dist = rawFields.District_P || '';
  const name = rawFields.Name_POD || '';
  const isTarget = targetNamesSet.has(name.toLowerCase());
  const utm = latLonToUTM(lat, lng);

  const entry = {
    fid: rawFields.FID || String(i),
    id_pod: rawFields.ID_POD || `POD${String(i).padStart(5, '0')}`,
    nama_pod: name,
    provinsi: rawFields.Province_P || 'Riau',
    kabupaten: dist || 'Kampar',
    kecamatan: rawFields.SubDistric || 'Kampar',
    desa: rawFields.Village_PO || '',
    jenis_pod: rawFields.Type_POD || 'Ramp',
    active: rawFields.Active || 'Dilakukan Survey',
    priority: rawFields.Priority || 'Priority 1',
    source: rawFields.Source_POD || 'POD Survey',
    year: rawFields.Year_POD || '2026',
    info_mill: rawFields.Info_Mill || '',
    capacity_e: rawFields.Capacity_E || '',
    capacity_d: rawFields.Capacity_D || '',
    weightbrid: rawFields.Weightbrid || '',
    phone: rawFields.Phone_Numb || '',
    contact: rawFields.Contact_In || '',
    survey_status: rawFields.Survey || 'Belum Di Survey',
    raw_fields: rawFields,
    lat: lat,
    lng: lng,
    utm_zone: utm.zone,
    utm_easting: utm.easting,
    utm_northing: utm.northing,
    utm_string: utm.utmFull,
    is_target_63: isTarget,
    google_maps_url: `https://www.google.com/maps?q=${lat},${lng}`,
    google_nav_url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    waze_url: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
  };

  if (dist.toLowerCase() === 'kampar') {
    kamparAll181.push(entry);
    kamparIndex[name.toLowerCase()] = entry;
    if (entry.id_pod) kamparIndex[entry.id_pod.toLowerCase()] = entry;
  } else {
    sumutAll336.push(entry);
  }
}

// 4. Build 63 Primary Target Items from Excel, enriched with 181 DB
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
  const idPod = kmz.ID_POD || `POD${String(index + 1).padStart(5, '0')}`;

  // Lookup in 181 DB
  let matched181 = kamparIndex[namaPod.toLowerCase()] || kamparIndex[idPod.toLowerCase()];
  if (!matched181) {
    // try finding by lat/lng proximity
    matched181 = kamparAll181.find(k => Math.abs(k.lat - lat) < 0.001 && Math.abs(k.lng - lng) < 0.001);
  }

  const rawFields = matched181 ? { ...matched181.raw_fields } : {
    FID: kmz.FID || String(index),
    ID_POD: idPod,
    Name_POD: namaPod,
    Capacity_E: '',
    Capacity_D: '',
    Lat_POD: String(lat),
    Long_POD: String(lng),
    Country_PO: 'Indonesia',
    Province_P: 'Riau',
    District_P: kmz.District || 'Kampar',
    SubDistric: kmz.SubDistrict || 'Kampar',
    Village_PO: kmz.Village || '',
    Source_POD: 'POD Survey',
    Year_POD: '2026',
    Type_POD: d['Jenis POD'] ? d['Jenis POD'].trim() : 'Ramp',
    Active: 'Dilakukan Survey',
    Weightbrid: '',
    Info_Mill: '',
    Phone_Numb: '',
    Contact_In: '',
    Priority: kmz.Priority || 'Priority 1',
    Survey: 'Belum Di Survey'
  };

  return {
    no: d['No'],
    id_pod: idPod,
    fid: kmz.FID !== undefined ? parseInt(kmz.FID) : index,
    nama_pod: namaPod,
    jenis_pod: d['Jenis POD'] ? d['Jenis POD'].trim() : (matched181 ? matched181.jenis_pod : 'Ramp'),
    status_survey: 'Belum Dikunjungi',
    status_target: d['Status'] ? d['Status'].trim() : 'Dilakukan',
    lat: lat,
    lng: lng,
    utm_zone: utm.zone,
    utm_easting: utm.easting,
    utm_northing: utm.northing,
    utm_string: utm.utmFull,
    provinsi: 'Riau',
    kabupaten: kmz.District || (matched181 ? matched181.kabupaten : 'Kampar'),
    kecamatan: kmz.SubDistrict || (matched181 ? matched181.kecamatan : 'Kampar'),
    desa: kmz.Village || (matched181 ? matched181.desa : ''),
    priority: kmz.Priority || (matched181 ? matched181.priority : 'Priority 1'),
    info_mill: matched181 ? matched181.info_mill : '',
    raw_fields: rawFields,
    is_target_63: true,
    google_maps_url: gmapsLink,
    google_nav_url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    waze_url: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
  };
});

// 5. Build Schedule Definitions (Mulai 6 / 7 Oktober)
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

// 6. Group by Kecamatan (13 Target Kecamatan & All 20 Kampar Kecamatan)
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

kamparAll181.forEach((item) => {
  const kec = item.kecamatan;
  if (kecamatanStats[kec]) {
    kecamatanStats[kec].total_sebelumnya += 1;
  }
});

const kecamatanList = Object.values(kecamatanStats).sort((a, b) => b.total_titik - a.total_titik);

// 7. Load PKS Prioritas from Data-Ada/PKS Prioritas.kmz
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

// 8. Load & Parse Boundary Polygons from Data-Prioritas/TapungPOD.kmz
let tapungBoundariesGeojson = { type: 'FeatureCollection', features: [] };
try {
  const polyZip = new AdmZip(path.join(__dirname, 'Data-Prioritas', 'TapungPOD.kmz'));
  const polyKml = polyZip.readAsText('doc.kml');
  const placemarksPoly = polyKml.split('<Placemark');
  for (let i = 1; i < placemarksPoly.length; i++) {
    const pm = placemarksPoly[i];
    const nameM = pm.match(/<name>(.*?)<\/name>/);
    const name = nameM ? nameM[1].trim() : `Kecamatan ${i}`;
    const polyMatches = [...pm.matchAll(/<coordinates>(.*?)<\/coordinates>/gs)];
    if (polyMatches.length === 1) {
      const raw = polyMatches[0][1].trim().split(/\s+/);
      const ring = raw.map((pt) => {
        const parts = pt.split(',');
        return [
          parseFloat(parseFloat(parts[0]).toFixed(5)),
          parseFloat(parseFloat(parts[1]).toFixed(5))
        ];
      });
      tapungBoundariesGeojson.features.push({
        type: 'Feature',
        properties: { name: name, kec: name },
        geometry: { type: 'Polygon', coordinates: [ring] }
      });
    } else if (polyMatches.length > 1) {
      const multi = polyMatches.map((m) => {
        const raw = m[1].trim().split(/\s+/);
        const ring = raw.map((pt) => {
          const parts = pt.split(',');
          return [
            parseFloat(parseFloat(parts[0]).toFixed(5)),
            parseFloat(parseFloat(parts[1]).toFixed(5))
          ];
        });
        return [ring];
      });
      tapungBoundariesGeojson.features.push({
        type: 'Feature',
        properties: { name: name, kec: name },
        geometry: { type: 'MultiPolygon', coordinates: multi }
      });
    }
  }
} catch (e) {
  console.warn('Could not parse TapungPOD.kmz:', e.message);
}

// 9. Load & Parse 78 Priority Points from Data-Prioritas/Titik POD.kmz
const tapungRawList = [];
try {
  const ptsZip = new AdmZip(path.join(__dirname, 'Data-Prioritas', 'Titik POD.kmz'));
  const ptsKml = ptsZip.readAsText('doc.kml');
  const placemarksPts = ptsKml.split('<Placemark');

  for (let i = 1; i < placemarksPts.length; i++) {
    const pm = placemarksPts[i];
    const nameM = pm.match(/<name>(.*?)<\/name>/);
    const coordM = pm.match(/<coordinates>\s*([0-9\.\-]+),([0-9\.\-]+)/);
    const rows = {};
    const reg = /<tr[^>]*>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<\/tr>/gi;
    let m;
    while ((m = reg.exec(pm)) !== null) {
      let val = m[2].trim();
      if (val === '&lt;Null&gt;' || val === '<Null>') val = '';
      rows[m[1].trim()] = val;
    }

    const lat = coordM ? parseFloat(coordM[2]) : parseFloat(rows['Lat_POD'] || 0);
    const lng = coordM ? parseFloat(coordM[1]) : parseFloat(rows['Long_POD'] || 0);
    const utm = latLonToUTM(lat, lng);
    const name = (rows['Name_POD'] || (nameM ? nameM[1] : `POD ${i}`)).trim();
    const idPod = rows['ID POD'] || `POD${String(i).padStart(5, '0')}`;
    const kec = rows['SubDistrict_POD'] || 'Tapung';
    const desa = rows['Village_POD'] || '';
    const prio = rows['Priority'] || 'Priority 1';
    const mill = rows['Info Mill'] || '';

    const rawFields = {
      FID: String(i),
      ID_POD: idPod,
      Name_POD: name,
      Capacity_E: rows['Capacity_Est'] || '',
      Capacity_D: rows['Capacity_Doc'] || '',
      Lat_POD: String(lat),
      Long_POD: String(lng),
      Country_PO: rows['Country_POD'] || 'Indonesia',
      Province_P: rows['Province_POD'] || 'Riau',
      District_P: rows['District_POD'] || 'Kampar',
      SubDistric: kec,
      Village_PO: desa,
      Source_POD: rows['Source_POD'] || 'Google Street View',
      Year_POD: rows['Year_POD'] || '2025',
      Type_POD: rows['Type_POD'] || 'Ramp',
      Active: rows['Active'] || 'Dilakukan Survey',
      Weightbrid: rows['Weightbridge'] || '',
      Info_Mill: mill,
      Phone_Numb: rows['Phone Number'] || '',
      Contact_In: rows['Contact Information'] || '',
      Priority: prio,
      Survey: rows['Survey'] || 'Belum Di Survey'
    };

    tapungRawList.push({
      no: i,
      id_pod: idPod,
      fid: i,
      nama_pod: name,
      jenis_pod: rows['Type_POD'] || 'Ramp',
      status_survey: 'Belum Dikunjungi',
      status_target: 'Prioritas Minggu Ini',
      lat: lat,
      lng: lng,
      utm_zone: utm.zone,
      utm_easting: utm.easting,
      utm_northing: utm.northing,
      utm_string: utm.utmFull,
      provinsi: 'Riau',
      kabupaten: 'Kampar',
      kecamatan: kec,
      desa: desa,
      priority: prio,
      info_mill: mill,
      year: rows['Year_POD'] || '2025',
      active: rows['Active'] || 'Dilakukan Survey',
      source: rows['Source_POD'] || 'Google Street View',
      raw_fields: rawFields,
      is_tapung_prioritas: true,
      google_maps_url: `https://www.google.com/maps?q=${lat},${lng}`,
      google_nav_url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
      waze_url: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    });
  }
} catch (e) {
  console.warn('Could not parse Titik POD.kmz:', e.message);
}

// 10. Build 7-Day Target & Schedule for Tapung Raya (Prioritas Minggu Ini: 78 Titik)
const tapungScheduleDefs = [
  {
    day: 1,
    dateRange: 'Kamis, 8 Okt 2026',
    title: 'Hari 1: Tapung Tenggara & Koridor Garuda Sakti',
    corridor: 'Kec. Tapung (Karya Indah, Bencah Kelubi, Sungai Putih, Sibuak, Sari Galuh)',
    desc: 'Memulai dari gerbang masuk Jl. Garuda Sakti Km 6 (perbatasan Pekanbaru) menyusuri poros Bencah Kelubi hingga Sari Galuh.',
    filter: (p) =>
      p.kecamatan === 'Tapung' &&
      ['Karya Indah', 'Bencah Kelubi', 'Sungai Putih', 'Sibuak', 'Sari Galuh'].includes(p.desa)
  },
  {
    day: 2,
    dateRange: 'Jumat, 9 Okt 2026',
    title: 'Hari 2: Tapung Sentral & Sentra Pantai Cermin',
    corridor: 'Kec. Tapung (Pantai Cermin & Indra Sakti)',
    desc: 'Konsentrasi 11 titik di Pantai Cermin di sepanjang jalan poros utama Tapung & simpang TB, dilanjutkan ke Indra Sakti.',
    filter: (p) =>
      p.kecamatan === 'Tapung' && ['Pantai Cermin', 'Indra Sakti'].includes(p.desa)
  },
  {
    day: 3,
    dateRange: 'Sabtu, 10 Okt 2026',
    title: 'Hari 3: Tapung Barat & Kawasan Petapahan',
    corridor: 'Kec. Tapung (Tanjung Sawit, Sumber Makmur, Petapahan, Petapahan Jaya)',
    desc: 'Sentra perkebunan sawit Flamboyan, Simpang Petapahan, Tanjung Sawit & Petapahan Jaya.',
    filter: (p) =>
      p.kecamatan === 'Tapung' &&
      ['Tanjung Sawit', 'Sumber Makmur', 'Petapahan', 'Petapahan Jaya'].includes(p.desa)
  },
  {
    day: 4,
    dateRange: 'Minggu, 11 Okt 2026',
    title: 'Hari 4: Tapung Hilir & Koridor Lintas Kandis',
    corridor: 'Kec. Tapung Hilir (Koto Garo, Suka Maju, Kota Baru, Kijang Jaya, Sekijang)',
    desc: 'Koridor timur-utara Tapung Hilir dari Koto Garo menyusuri poros jalan Buana hingga Kijang Jaya dan Sekijang.',
    filter: (p) => p.kecamatan === 'Tapung Hilir'
  },
  {
    day: 5,
    dateRange: 'Senin, 12 Okt 2026',
    title: 'Hari 5: Tapung Hulu Sentral & Poros Suram',
    corridor: 'Kec. Tapung Hulu (Bukit Kemuning, Sukaramai, Kusau Makmur) & Kec. Tapung (Sungai Agung)',
    desc: 'Jalur poros Suram (Sukaramai) dan kawasan perkebunan rakyat Bukit Kemuning, Kusau Makmur & Sungai Agung.',
    filter: (p) =>
      (p.kecamatan === 'Tapung Hulu' &&
        ['Bukit Kemuning', 'Sukaramai', 'Kusau Makmur'].includes(p.desa)) ||
      (p.kecamatan === 'Tapung' && p.desa === 'Sungai Agung')
  },
  {
    day: 6,
    dateRange: 'Selasa, 13 Okt 2026',
    title: 'Hari 6: Tapung Hulu Barat (Kasikan & Rimba Jaya)',
    corridor: 'Kec. Tapung Hulu (Desa Kasikan & Rimba Jaya)',
    desc: 'Ujung barat Tapung Hulu arah perbatasan Rokan Hulu (Tandun). Termasuk alokasi sweep/kunjungan ulang bila ada kendala.',
    filter: (p) =>
      p.kecamatan === 'Tapung Hulu' && ['Kasikan', 'Rimba Jaya'].includes(p.desa)
  },
  {
    day: 7,
    dateRange: 'Rabu, 14 Okt 2026',
    title: 'Hari 7: Tapung Hulu Utara (Danau Lancang & Senama Nenek)',
    corridor: 'Kec. Tapung Hulu (Desa Danau Lancang & Senama Nenek)',
    desc: 'Kawasan perkebunan kelapa sawit terluas di Danau Lancang (10 titik) dan desa adat Senama Nenek (3 titik).',
    filter: (p) =>
      p.kecamatan === 'Tapung Hulu' && ['Danau Lancang', 'Senama Nenek'].includes(p.desa)
  }
];

let finalTapungItems = [];
const tapungScheduleSummary = [];

tapungScheduleDefs.forEach((def) => {
  const matched = tapungRawList.filter(def.filter);
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

  finalTapungItems = finalTapungItems.concat(dayItems);

  tapungScheduleSummary.push({
    hari: def.day,
    tanggal: def.dateRange,
    judul: def.title,
    koridor: def.corridor,
    deskripsi: def.desc,
    jumlah_titik: dayItems.length,
    estimasi_jarak_km: Math.round(routeDistanceKm * 10) / 10,
    titik_mulai: `${dayItems[0].nama_pod} (${dayItems[0].desa})`,
    titik_akhir: `${dayItems[dayItems.length - 1].nama_pod} (${dayItems[dayItems.length - 1].desa})`,
    desa_list: [...new Set(dayItems.map((p) => p.desa))].join(', ')
  });
});

// Group Tapung by Kecamatan
const kecTapungStats = {};
finalTapungItems.forEach((item) => {
  const kec = item.kecamatan;
  if (!kecTapungStats[kec]) {
    kecTapungStats[kec] = {
      nama_kecamatan: kec,
      total_titik: 0,
      desa_list: {},
      points: []
    };
  }
  kecTapungStats[kec].total_titik += 1;
  kecTapungStats[kec].desa_list[item.desa || 'Lainnya'] =
    (kecTapungStats[kec].desa_list[item.desa || 'Lainnya'] || 0) + 1;
  kecTapungStats[kec].points.push(item);
});
const kecamatanTapungList = Object.values(kecTapungStats).sort((a, b) => b.total_titik - a.total_titik);

// 10. Prioritas Khusus Sandy: Kecamatan Tapung (41 Titik, Target 10 / Hari)
const sandyScheduleDefs = [
  {
    day: 1,
    title: 'Hari 1: Pintu Masuk Timur (Karya Indah ➔ Bencah Kelubi ➔ Sei Putih)',
    corridor: 'Karya Indah, Bencah Kelubi, Sungai Putih, Pantai Cermin Timur',
    dateRange: 'Hari 1 • Pintu Masuk Pekanbaru (10 Titik)',
    startArea: 'Jl. Garuda Sakti Km 7 (Ramp Guston)',
    desc: 'Mulai dari titik terdekat perbatasan Pekanbaru (Jl. Garuda Sakti). Menyapu bersih 10 titik di Karya Indah, Bencah Kelubi, dan Sungai Putih tanpa perlu masuk jauh ke pedalaman.',
    filter: (p) =>
      p.kecamatan === 'Tapung' &&
      (['Karya Indah', 'Sungai Putih', 'Bencah Kelubi'].includes(p.desa) ||
        (p.desa === 'Pantai Cermin' && p.lng > 101.20))
  },
  {
    day: 2,
    title: 'Hari 2: Poros Tengah & Flamboyan (Sari Galuh ➔ Pantai Cermin ➔ Sibuak)',
    corridor: 'Desa Sari Galuh, Pantai Cermin Selatan/Tengah, Sibuak',
    dateRange: 'Hari 2 • Kawasan Sari Galuh / Flamboyan (10 Titik)',
    startArea: 'Desa Sari Galuh (Veron Ms Transport & Vero Garrusso)',
    desc: 'Menyisir kawasan kebun sawit padat di Sari Galuh (Flamboyan) dan Pantai Cermin poros tengah, lalu melambung ke Sibuak. Akses jalan bagus dan jarak antar-titik rapat (1-3 km).',
    filter: (p) =>
      p.kecamatan === 'Tapung' &&
      (['Sari Galuh', 'Sibuak'].includes(p.desa) ||
        (p.desa === 'Pantai Cermin' && p.lng >= 101.13 && p.lng <= 101.20 && p.lat < 0.575))
  },
  {
    day: 3,
    title: 'Hari 3: Koridor Poros Utara (Indra Sakti ➔ Pantai Cermin Utara ➔ Petapahan)',
    corridor: 'Desa Indra Sakti, Pantai Cermin Utara, Petapahan Timur',
    dateRange: 'Hari 3 • Poros Utara Simpang Petapahan (10 Titik)',
    startArea: 'Pantai Cermin Poros Utara (Pod_362 & Peron Simbolon)',
    desc: 'Menyusuri koridor utara dari Pantai Cermin atas ke Desa Indra Sakti dan jalan lingkar timur Petapahan. Rute melingkar satu arah yang teratur.',
    filter: (p) =>
      p.kecamatan === 'Tapung' &&
      (p.desa === 'Indra Sakti' ||
        (p.desa === 'Pantai Cermin' && p.lat >= 0.575 && p.lng < 101.20) ||
        (p.desa === 'Petapahan' && p.lng > 101.05))
  },
  {
    day: 4,
    title: 'Hari 4: Poros Barat & Target GAR (Tanjung Sawit ➔ Petapahan Jaya ➔ Sungai Agung)',
    corridor: 'Tanjung Sawit, Sumber Makmur, Petapahan Jaya, Petapahan Barat, Sungai Agung',
    dateRange: 'Hari 4 • Jalur Prioritas GAR & Pabrik (11 Titik)',
    startArea: 'Tanjung Sawit (Ramp Ads) & Sumber Makmur (Ramp Syn)',
    desc: 'Menyelesaikan wilayah barat perbatasan Tapung Hulu. Area ini memuat titik prioritas GAR dan pabrik PKS (PT Karya Cipta Nirvana), berlanjut hingga tuntas di Sungai Agung.',
    filter: (p) =>
      p.kecamatan === 'Tapung' &&
      (['Tanjung Sawit', 'Sumber Makmur', 'Petapahan Jaya', 'Sungai Agung'].includes(p.desa) ||
        (p.desa === 'Petapahan' && p.lng <= 101.05))
  }
];

let finalSandyItems = [];
const sandyScheduleSummary = [];

sandyScheduleDefs.forEach((def) => {
  const matched = tapungRawList.filter(def.filter);
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
    label_urutan: `H${def.day}-${String(idx + 1).padStart(2, '0')}`,
    cluster_sandy: def.title.split(':')[1].trim()
  }));

  finalSandyItems = finalSandyItems.concat(dayItems);

  sandyScheduleSummary.push({
    hari: def.day,
    tanggal: def.dateRange,
    judul: def.title,
    koridor: def.corridor,
    deskripsi: def.desc,
    jumlah_titik: dayItems.length,
    estimasi_jarak_km: Math.round(routeDistanceKm * 10) / 10,
    titik_mulai: `${dayItems[0].nama_pod} (${dayItems[0].desa})`,
    titik_akhir: `${dayItems[dayItems.length - 1].nama_pod} (${dayItems[dayItems.length - 1].desa})`,
    desa_list: [...new Set(dayItems.map((p) => p.desa))].join(', ')
  });
});

const masterOutput = {
  metadata: {
    total_sandy_tapung: finalSandyItems.length,
    total_tapung_prioritas: finalTapungItems.length,
    total_objek_target: finalItems.length,
    total_kampar_prioritas: kamparAll181.length,
    total_database_517: placemarks517.length - 1,
    total_kecamatan_target: kecamatanList.length,
    kabupaten: 'Kampar, Riau',
    focus_wilayah: 'Prioritas Sandy: Kec. Tapung (41 Titik) & Tapung Raya (78 Titik)',
    target_harian: '10 titik / hari (Target Khusus Sandy 4 Hari Tuntas)',
    mobile_url: 'http://192.168.100.107:3000',
    local_laragon_url: 'http://localhost/Survei-POD/',
    generated_at: new Date().toISOString()
  },
  sandy_tapung_41: finalSandyItems,
  schedule_sandy: sandyScheduleSummary,
  tapung_prioritas_78: finalTapungItems,
  schedule_tapung: tapungScheduleSummary,
  kecamatan_tapung_list: kecamatanTapungList,
  tapung_boundaries_geojson: tapungBoundariesGeojson,
  kecamatan_list: kecamatanList,
  schedule: scheduleSummary,
  pks_list: pksList,
  pod_list: finalItems,
  kampar_all_181: kamparAll181
};

const outputJs = `// Auto-generated POD Survey Mobile Master Database with 517 History & Tapung Priority
window.POD_SURVEY_MASTER_DATA = ${JSON.stringify(masterOutput, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, 'assets', 'pod_database.js'), outputJs);
fs.writeFileSync(path.join(__dirname, 'assets', 'pod_database.json'), JSON.stringify(masterOutput, null, 2));

console.log('Successfully updated assets/pod_database.js and assets/pod_database.json');
console.log('Tapung Prioritas 78:', finalTapungItems.length);
console.log('Target 63:', finalItems.length);
console.log('Kampar All 181:', kamparAll181.length);
console.log('Boundary Polygons:', tapungBoundariesGeojson.features.length);
console.log('PKS:', pksList.length);
