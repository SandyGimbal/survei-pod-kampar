const fs = require('fs');
const points = JSON.parse(fs.readFileSync('pod_data_raw.json', 'utf8'));

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

// Order points using Nearest Neighbor TSP
function orderPointsNearestNeighbor(pts) {
  if (pts.length <= 1) return pts;
  const remaining = [...pts];
  const ordered = [];
  
  // Pick starting point: the one with lowest or highest longitude depending on direction
  // Let's start with the easternmost or westernmost
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

// Let's look at geographic distribution by kecamatan and coordinates:
// Grouping logic:
// East to West strategy:
// Cluster A: Siak Hulu (4) & Perhentian Raja Timur (Lubuk Sakat, Sialang Kubang, Kampung Pinang) -> ~9-10
// Cluster B: Perhentian Raja Barat (Pantai Raja) -> 9
// Cluster C: Tambang (Kuapan, Rimbo Panjang, Kualu, Padang Luas, Parit Baru) -> 12 points, split or keep 10-12
// Cluster D: Kampa (Pulau Rambai, Pulau Birandang, Sungai Putih) + Kampar (Pulau Sarak, Rumbio) -> 10
// Cluster E: Rumbio Jaya (Bukit Kratai, Teratak) + Kampar Utara (Muara Jalai, Sawah) + sisa Tambang -> ~8-9
// Cluster F: Bangkinang (Bukit Payung, Pasir Sialang) + Bangkinang Kota (Ridan Permai) -> 8
// Cluster G: Salo (3) + Kuok (1) + XIII Koto Kampar (2) + Koto Kampar Hulu (1) -> 7

// Let's test a k-means or constrained clustering:
console.log('Districts and counts:');
const dCount = {};
points.forEach(p => dCount[p.kecamatan] = (dCount[p.kecamatan] || 0) + 1);
console.log(dCount);

// Let's assign initial days based on natural geographic corridors
// 7 Hari Schedule:
// Day 1: Siak Hulu + Perhentian Raja bagian Timur (Lubuk Sakat, Sialang Kubang, Kampung Pinang) -> 9 titik
// Day 2: Perhentian Raja bagian Barat / Pantai Raja -> 10 titik
// Day 3: Tambang (Kuapan, Rimbo Panjang, Kualu, Padang Luas, Parit Baru) -> 10 titik (Kuapan 8 + Rimbo Panjang + Kualu)
// Day 4: Tambang sisa (2) + Kampa (Pulau Birandang, Sungai Putih, Pulau Rambai) -> 10 titik
// Day 5: Kampar (Pulau Sarak, Rumbio) + Rumbio Jaya (Bukit Kratai, Teratak) + Kampar Utara (Muara Jalai, Sawah) -> 9 titik
// Day 6: Bangkinang (Bukit Payung, Pasir Sialang) + Bangkinang Kota (Ridan Permai) -> 8 titik
// Day 7: Salo (3) + Kuok (1) + XIII Koto Kampar (2) + Koto Kampar Hulu (1) -> 7 titik

const dayPlans = {
  1: {
    nama_hari: 'Hari 1: Siak Hulu & Perhentian Raja Timur',
    fokus_area: 'Kec. Siak Hulu & Kec. Perhentian Raja (Lubuk Sakat, Sialang Kubang, Kampung Pinang)',
    deskripsi: 'Mulai dari area paling timur (dekat perbatasan Pekanbaru/Kampar). Akses jalan relatif mulus lewat Jalan Pasir Putih & Koridor Marpoyan.',
    filter: p => (p.kecamatan === 'Siak Hulu') || 
                 (p.kecamatan === 'Perhentian Raja' && ['Lubuk Sakat', 'Sialang Kubang', 'Kampung Pinang'].includes(p.desa))
  },
  2: {
    nama_hari: 'Hari 2: Perhentian Raja (Pantai Raja)',
    fokus_area: 'Kec. Perhentian Raja (Desa Pantai Raja)',
    deskripsi: 'Fokus di sentra perkebunan & RAM/Peron di Desa Pantai Raja. Titik-titik saling berdekatan di koridor Lintas Pekanbaru - Teluk Kuantan.',
    filter: p => (p.kecamatan === 'Perhentian Raja' && p.desa === 'Pantai Raja')
  },
  3: {
    nama_hari: 'Hari 3: Tambang Sentral (Kuapan & Rimbo Panjang)',
    fokus_area: 'Kec. Tambang (Desa Kuapan, Rimbo Panjang, Kualu)',
    deskripsi: 'Menyusuri koridor Tambang bagian timur dan konsentrasi RAM sawit Desa Kuapan (jalan poros kebun).',
    filter: p => (p.kecamatan === 'Tambang' && ['Kuapan', 'Rimbo Panjang', 'Kualu'].includes(p.desa))
  },
  4: {
    nama_hari: 'Hari 4: Tambang Barat & Kampa (Pulau Rambai & Sungai Putih)',
    fokus_area: 'Kec. Tambang (Padang Luas, Parit Baru) & Kec. Kampa',
    deskripsi: 'Menghubungkan Tambang barat ke Kampa sepanjang jalan Lintas Pekanbaru - Bangkinang dan Pulau Rambai.',
    filter: p => (p.kecamatan === 'Tambang' && ['Padang Luas', 'Parit Baru'].includes(p.desa)) ||
                 (p.kecamatan === 'Kampa' && ['Pulau Rambai', 'Sungai Putih'].includes(p.desa))
  },
  5: {
    nama_hari: 'Hari 5: Kampa Barat, Rumbio Jaya & Kampar Utara',
    fokus_area: 'Kec. Kampa (Pulau Birandang), Kampar (Pulau Sarak, Rumbio), Rumbio Jaya & Kampar Utara',
    deskripsi: 'Menyusuri koridor seberang Sungai Kampar (Bukit Kratai, Teratak, Muara Jalai, Sawah).',
    filter: p => (p.kecamatan === 'Kampa' && p.desa === 'Pulau Birandang') ||
                 (p.kecamatan === 'Kampar') ||
                 (p.kecamatan === 'Rumbio Jaya') ||
                 (p.kecamatan === 'Kampar Utara')
  },
  6: {
    nama_hari: 'Hari 6: Bangkinang & Bangkinang Kota',
    fokus_area: 'Kec. Bangkinang (Bukit Payung, Pasir Sialang) & Kec. Bangkinang Kota',
    deskripsi: 'Sentra POD di sentra transmigrasi & perkebunan Bukit Payung serta Pasir Sialang.',
    filter: p => (p.kecamatan === 'Bangkinang' || p.kecamatan === 'Bangkinang Kota')
  },
  7: {
    nama_hari: 'Hari 7: Salo, Kuok & Kampar Hulu (Ujung Barat)',
    fokus_area: 'Kec. Salo, Kuok, XIII Koto Kampar & Koto Kampar Hulu',
    deskripsi: 'Menuju koridor barat Lintas Riau-Sumbar (Salo, PLTA Koto Panjang / Batu Bersurat, Gunung Bungsu, Tanjung).',
    filter: p => ['Salo', 'Kuok', 'Xiii Koto Kampar', 'Koto Kampar Hulu'].includes(p.kecamatan)
  }
};

let assignedCount = 0;
const dailyData = {};

for (let d = 1; d <= 7; d++) {
  const plan = dayPlans[d];
  const matched = points.filter(plan.filter);
  const ordered = orderPointsNearestNeighbor(matched);
  
  // Calculate total route distance
  let totalDistKm = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    totalDistKm += haversine(ordered[i].lat, ordered[i].lng, ordered[i+1].lat, ordered[i+1].lng);
  }

  dailyData[d] = {
    dayNumber: d,
    title: plan.nama_hari,
    focusArea: plan.fokus_area,
    description: plan.deskripsi,
    count: ordered.length,
    estimatedDistanceKm: Math.round(totalDistKm * 10) / 10,
    points: ordered.map((p, idx) => ({
      ...p,
      day: d,
      order_in_day: idx + 1
    }))
  };
  assignedCount += ordered.length;
}

console.log('Total assigned:', assignedCount, '/ 63 points');
for (let d = 1; d <= 7; d++) {
  console.log(`Day ${d}: ${dailyData[d].count} titik | Jarak antar titik: ~${dailyData[d].estimatedDistanceKm} km | ${dailyData[d].title}`);
}
