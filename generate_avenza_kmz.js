const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'pod_database.json'), 'utf8'));

function createKML(items, title) {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${title}</name>
    <description>Hasil olahan data survei POD Kampar Riau untuk Avenza Maps</description>
    <Style id="targetPin">
      <IconStyle>
        <color>ff00aa00</color>
        <scale>1.2</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>
    <Style id="prevPin">
      <IconStyle>
        <color>ff0055ff</color>
        <scale>1.0</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/blu-circle.png</href>
        </Icon>
      </IconStyle>
    </Style>
`;

  items.forEach((p, idx) => {
    const isTarget = !!p.is_target_63;
    const style = isTarget ? '#targetPin' : '#prevPin';
    const tag = isTarget ? `[TARGET #${p.urutan_hari || idx+1}]` : `[DATABASE]`;

    kml += `    <Placemark>
      <name>${tag} ${p.nama_pod}</name>
      <description><![CDATA[
        <b>ID POD:</b> ${p.id_pod}<br>
        <b>Kecamatan:</b> ${p.kecamatan}<br>
        <b>Desa:</b> ${p.desa || '-'}<br>
        <b>Jenis:</b> ${p.jenis_pod}<br>
        <b>UTM Avenza:</b> ${p.utm_string}<br>
        <b>Koordinat:</b> ${p.lat}, ${p.lng}<br>
        <b>Navigasi:</b> <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving">Buka Rute Google Maps</a>
      ]]></description>
      <styleUrl>${style}</styleUrl>
      <Point>
        <coordinates>${p.lng},${p.lat},0</coordinates>
      </Point>
    </Placemark>
`;
  });

  kml += `  </Document>
</kml>`;
  return kml;
}

// 1. KMZ 63 Target Utama
const kml63 = createKML(db.pod_list, 'Target 63 POD Kampar (Avenza Maps)');
const zip63 = new AdmZip();
zip63.addFile('doc.kml', Buffer.from(kml63, 'utf8'));
zip63.writeZip(path.join(__dirname, 'Target_63_POD_Kampar_Avenza.kmz'));

// 2. KMZ 181 Semua Kampar
const kml181 = createKML(db.kampar_all_181, 'Semua 181 POD Kampar (Avenza Maps)');
const zip181 = new AdmZip();
zip181.addFile('doc.kml', Buffer.from(kml181, 'utf8'));
zip181.writeZip(path.join(__dirname, 'Semua_181_POD_Kampar_Avenza.kmz'));

console.log('Successfully generated Target_63_POD_Kampar_Avenza.kmz and Semua_181_POD_Kampar_Avenza.kmz');
