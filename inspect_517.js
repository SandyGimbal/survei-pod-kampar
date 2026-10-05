const AdmZip = require('adm-zip');
const fs = require('fs');

const zip = new AdmZip('Data-Ada/Prioritas Area POD.kmz');
const kml = zip.readAsText('doc.kml');
const placemarks = kml.split('<Placemark');

console.log('Total placemarks in KMZ:', placemarks.length - 1);

const stats = {
  districts: {},
  provinces: {},
  surveyStatuses: {},
  priorities: {},
  activeStatuses: {},
  withPhone: 0,
  withContact: 0,
  withCapacity: 0,
  withMill: 0
};

const all517 = [];

for (let i = 1; i < placemarks.length; i++) {
  const pm = placemarks[i];
  const getField = (name) => {
    const reg = new RegExp(`${name}<\\/td>\\s*<td>(.*?)<\\/td>`, 'i');
    const m = pm.match(reg);
    return m ? m[1].trim() : '';
  };

  const coordM = pm.match(/<coordinates>\s*([0-9\.\-]+),([0-9\.\-]+)/);

  const item = {
    fid: getField('FID'),
    id_pod: getField('ID_POD'),
    name: getField('Name_POD'),
    cap_e: getField('Capacity_E'),
    cap_d: getField('Capacity_D'),
    lat: coordM ? parseFloat(coordM[2]) : parseFloat(getField('Lat_POD')),
    lng: coordM ? parseFloat(coordM[1]) : parseFloat(getField('Long_POD')),
    country: getField('Country_PO'),
    province: getField('Province_P'),
    district: getField('District_P'),
    subdistrict: getField('SubDistric'),
    village: getField('Village_PO'),
    source: getField('Source_POD'),
    year: getField('Year_POD'),
    type: getField('Type_POD'),
    active: getField('Active'),
    weightbrid: getField('Weightbrid'),
    info_mill: getField('Info_Mill'),
    phone: getField('Phone_Numb'),
    contact: getField('Contact_In'),
    priority: getField('Priority'),
    survey: getField('Survey')
  };

  all517.push(item);

  stats.districts[item.district] = (stats.districts[item.district] || 0) + 1;
  stats.provinces[item.province] = (stats.provinces[item.province] || 0) + 1;
  stats.surveyStatuses[item.survey] = (stats.surveyStatuses[item.survey] || 0) + 1;
  stats.priorities[item.priority] = (stats.priorities[item.priority] || 0) + 1;
  stats.activeStatuses[item.active] = (stats.activeStatuses[item.active] || 0) + 1;

  if (item.phone) stats.withPhone++;
  if (item.contact) stats.withContact++;
  if (item.cap_e || item.cap_d) stats.withCapacity++;
  if (item.info_mill) stats.withMill++;
}

console.log('Statistics:');
console.log('Districts:', stats.districts);
console.log('Provinces:', stats.provinces);
console.log('Survey Statuses:', stats.surveyStatuses);
console.log('Priorities:', stats.priorities);
console.log('With Phone:', stats.withPhone, 'With Contact:', stats.withContact, 'With Capacity:', stats.withCapacity, 'With Mill:', stats.withMill);

// Let's filter Kampar specifically
const kamparPoints = all517.filter(p => p.district.toLowerCase() === 'kampar');
console.log('\n--- KAMPAR SPECIFIC (Total ' + kamparPoints.length + ') ---');
const kamparSub = {};
kamparPoints.forEach(p => {
  kamparSub[p.subdistrict] = (kamparSub[p.subdistrict] || 0) + 1;
});
console.log('Kampar Subdistricts count:', kamparSub);
console.log('Kampar Survey Statuses:', [...new Set(kamparPoints.map(p => p.survey))]);
console.log('Kampar Priorities:', [...new Set(kamparPoints.map(p => p.priority))]);
console.log('Kampar with Phone:', kamparPoints.filter(p => p.phone).length);
console.log('Kampar with Contact:', kamparPoints.filter(p => p.contact).length);
console.log('Kampar with Capacity:', kamparPoints.filter(p => p.cap_e || p.cap_d).length);

// Sample some Kampar points with phone / contact / data
const sampleWithData = kamparPoints.filter(p => p.phone || p.contact || p.cap_e || p.cap_d || p.survey !== 'Belum Di Survey');
console.log('Kampar points with some filled survey data:', sampleWithData.length);
if (sampleWithData.length > 0) {
  console.log('Sample Kampar point with data:', sampleWithData[0]);
} else {
  console.log('Sample Kampar point [0]:', kamparPoints[0]);
}

// Check other districts (Asahan, Simalungun)
console.log('\n--- ASAHAN & SIMALUNGUN (Total ' + (all517.length - kamparPoints.length) + ') ---');
const sumutPoints = all517.filter(p => p.district.toLowerCase() !== 'kampar');
const sumutWithData = sumutPoints.filter(p => p.phone || p.contact || p.cap_e || p.cap_d || p.survey !== 'Belum Di Survey');
console.log('Sumut points with filled data:', sumutWithData.length);
if (sumutWithData.length > 0) {
  console.log('Sample Sumut point with data:', sumutWithData[0]);
}
