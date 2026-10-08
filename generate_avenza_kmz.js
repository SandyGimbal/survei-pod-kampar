const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets', 'pod_database.json'), 'utf8'));

function createTapung78KML(items, boundariesGeojson) {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Prioritas 78 POD Tapung Raya &amp; Batas Administrasi (Avenza Maps)</name>
    <description>Prioritas Survei Lapangan: Kec. Tapung (41 titik - Orange), Kec. Tapung Hulu (28 titik - Biru), Kec. Tapung Hilir (9 titik - Ungu)</description>

    <!-- Point Styles per Kecamatan -->
    <Style id="pinTapung">
      <IconStyle>
        <color>ff0c58ea</color>
        <scale>1.25</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/orange-circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <color>ff0c58ea</color>
        <scale>0.9</scale>
      </LabelStyle>
    </Style>

    <Style id="pinTapungHulu">
      <IconStyle>
        <color>ffeb6325</color>
        <scale>1.25</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/blu-circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <color>ffeb6325</color>
        <scale>0.9</scale>
      </LabelStyle>
    </Style>

    <Style id="pinTapungHilir">
      <IconStyle>
        <color>ffea3393</color>
        <scale>1.25</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/paddle/purple-circle.png</href>
        </Icon>
      </IconStyle>
      <LabelStyle>
        <color>ffea3393</color>
        <scale>0.9</scale>
      </LabelStyle>
    </Style>

    <!-- Boundary Polygon Styles -->
    <Style id="polyTapung">
      <LineStyle>
        <color>ff0c58ea</color>
        <width>3.5</width>
      </LineStyle>
      <PolyStyle>
        <color>280c58ea</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>

    <Style id="polyTapungHulu">
      <LineStyle>
        <color>ffeb6325</color>
        <width>3.5</width>
      </LineStyle>
      <PolyStyle>
        <color>28eb6325</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>

    <Style id="polyTapungHilir">
      <LineStyle>
        <color>ffea3393</color>
        <width>3.5</width>
      </LineStyle>
      <PolyStyle>
        <color>28ea3393</color>
        <fill>1</fill>
        <outline>1</outline>
      </PolyStyle>
    </Style>

    <!-- Folder Batas Administrasi -->
    <Folder>
      <name>Batas Administrasi Kecamatan Tapung Raya</name>
`;

  if (boundariesGeojson && boundariesGeojson.features) {
    boundariesGeojson.features.forEach((feat) => {
      const name = feat.properties.name || '';
      let styleId = '#polyTapung';
      let totalPts = 41;
      let badge = '🟧';
      if (name === 'Tapung Hulu') {
        styleId = '#polyTapungHulu';
        totalPts = 28;
        badge = '🟦';
      } else if (name === 'Tapung Hilir') {
        styleId = '#polyTapungHilir';
        totalPts = 9;
        badge = '🟪';
      }

      kml += `      <Placemark>
        <name>${badge} Batas Administrasi Kec. ${name} (${totalPts} Titik POD)</name>
        <description><![CDATA[
          <b>Kecamatan:</b> ${name}<br>
          <b>Jumlah Titik POD Prioritas:</b> ${totalPts} Titik<br>
          <b>Kategori:</b> Prioritas Minggu Ini
        ]]></description>
        <styleUrl>${styleId}</styleUrl>
`;

      if (feat.geometry.type === 'Polygon') {
        const ringStr = feat.geometry.coordinates[0].map((c) => `${c[0]},${c[1]},0`).join(' ');
        kml += `        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>${ringStr}</coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
`;
      } else if (feat.geometry.type === 'MultiPolygon') {
        kml += `        <MultiGeometry>
`;
        feat.geometry.coordinates.forEach((poly) => {
          const ringStr = poly[0].map((c) => `${c[0]},${c[1]},0`).join(' ');
          kml += `          <Polygon>
            <outerBoundaryIs>
              <LinearRing>
                <coordinates>${ringStr}</coordinates>
              </LinearRing>
            </outerBoundaryIs>
          </Polygon>
`;
        });
        kml += `        </MultiGeometry>
`;
      }

      kml += `      </Placemark>
`;
    });
  }

  kml += `    </Folder>

    <!-- Folder 78 Titik Prioritas POD -->
    <Folder>
      <name>78 Titik Prioritas POD Tapung Raya</name>
`;

  items.forEach((p) => {
    let styleId = '#pinTapung';
    let badge = '🟧';
    if (p.kecamatan === 'Tapung Hulu') {
      styleId = '#pinTapungHulu';
      badge = '🟦';
    } else if (p.kecamatan === 'Tapung Hilir') {
      styleId = '#pinTapungHilir';
      badge = '🟪';
    }

    const tag = p.label_urutan ? `[${p.label_urutan}]` : `[POD]`;
    const prioTag = p.priority ? ` • ${p.priority}` : '';

    kml += `      <Placemark>
        <name>${badge} ${tag} ${p.nama_pod}${prioTag}</name>
        <description><![CDATA[
          <b>ID POD:</b> ${p.id_pod}<br>
          <b>Kecamatan:</b> ${p.kecamatan}<br>
          <b>Desa:</b> ${p.desa || '-'}<br>
          <b>Jenis POD:</b> ${p.jenis_pod}<br>
          <b>Prioritas:</b> ${p.priority || '-'}<br>
          <b>Info Mill / PKS:</b> ${p.info_mill || '-'}<br>
          <b>Rute:</b> Hari ke-${p.hari_ke} (Urutan ke-${p.urutan_hari})<br>
          <b>UTM Avenza:</b> ${p.utm_string}<br>
          <b>Koordinat:</b> ${p.lat}, ${p.lng}<br>
          <b>Navigasi Google Maps:</b> <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving">Buka Navigasi</a>
        ]]></description>
        <styleUrl>${styleId}</styleUrl>
        <Point>
          <coordinates>${p.lng},${p.lat},0</coordinates>
        </Point>
      </Placemark>
`;
  });

  kml += `    </Folder>
  </Document>
</kml>`;

  return kml;
}

function createGeneralKML(items, title) {
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
    const isTarget = !!p.is_target_63 || !!p.is_tapung_prioritas;
    const style = isTarget ? '#targetPin' : '#prevPin';
    const tag = p.label_urutan ? `[${p.label_urutan}]` : isTarget ? `[TARGET #${p.urutan_hari || idx + 1}]` : `[DATABASE]`;
    const prioTag = p.priority ? ` • ${p.priority}` : '';

    kml += `    <Placemark>
      <name>${tag} ${p.nama_pod}${prioTag}</name>
      <description><![CDATA[
        <b>ID POD:</b> ${p.id_pod}<br>
        <b>Kecamatan:</b> ${p.kecamatan}<br>
        <b>Desa:</b> ${p.desa || '-'}<br>
        <b>Jenis:</b> ${p.jenis_pod}<br>
        <b>Prioritas:</b> ${p.priority || '-'}<br>
        <b>Info Mill / PKS:</b> ${p.info_mill || '-'}<br>
        <b>Jadwal:</b> ${p.label_urutan ? 'Hari ke-' + p.hari_ke : '-'}<br>
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

// 1. KMZ 78 Prioritas Tapung Raya Minggu Ini (With Boundary Polygons and Colors!)
if (db.tapung_prioritas_78 && db.tapung_prioritas_78.length > 0) {
  const kml78 = createTapung78KML(db.tapung_prioritas_78, db.tapung_boundaries_geojson);
  const zip78 = new AdmZip();
  zip78.addFile('doc.kml', Buffer.from(kml78, 'utf8'));
  zip78.writeZip(path.join(__dirname, 'Prioritas_78_Tapung_Avenza.kmz'));
  console.log('Successfully generated Prioritas_78_Tapung_Avenza.kmz with colored subdistrict boundaries & points!');
}

// 2. KMZ 63 Target Utama
const kml63 = createGeneralKML(db.pod_list, 'Target 63 POD Kampar (Avenza Maps)');
const zip63 = new AdmZip();
zip63.addFile('doc.kml', Buffer.from(kml63, 'utf8'));
zip63.writeZip(path.join(__dirname, 'Target_63_POD_Kampar_Avenza.kmz'));

// 3. KMZ 181 Semua Kampar
const kml181 = createGeneralKML(db.kampar_all_181, 'Semua 181 POD Kampar (Avenza Maps)');
const zip181 = new AdmZip();
zip181.addFile('doc.kml', Buffer.from(kml181, 'utf8'));
zip181.writeZip(path.join(__dirname, 'Semua_181_POD_Kampar_Avenza.kmz'));

console.log('KMZ Generation completed successfully.');
