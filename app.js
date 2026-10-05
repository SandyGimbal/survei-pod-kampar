/**
 * POD Survey Navigator - Kampar, Riau
 * Mobile-First Interactive Map & Target Navigation
 * Integrated with 517 Prioritas Database (181 Kampar Points)
 */

(function () {
  'use strict';

  const STORAGE_VISITED = 'POD_VISITED_TARGETS_V2';
  const STORAGE_NOTES = 'POD_QUICK_NOTES_V2';

  const State = {
    masterList: [], // 63 primary targets
    kamparAll181: [], // 181 Kampar points from 517 database
    kecamatanList: [],
    schedule: [],
    pksList: [],
    visited: {},
    notes: {},
    activeTab: 'map', // 'map', 'targets', 'summary'
    viewDataset: 'TARGET63', // 'TARGET63' or 'ALL181'
    selectedKecamatan: 'ALL',
    selectedVillage: 'ALL',
    selectedDay: 'ALL',
    selectedStatus: 'ALL', // 'ALL', 'PENDING', 'DONE'
    searchQuery: '',
    mapInstance: null,
    mapMarkers: {},
    userMarker: null
  };

  const KEC_COLORS = {
    'Perhentian Raja': '#059669',
    Tambang: '#2563eb',
    Kampa: '#d97706',
    Bangkinang: '#9333ea',
    'Rumbio Jaya': '#0891b2',
    'Siak Hulu': '#dc2626',
    Salo: '#4f46e5',
    Kampar: '#16a34a',
    'Kampar Utara': '#ea580c',
    'Xiii Koto Kampar': '#0284c7',
    'Bangkinang Kota': '#7c3aed',
    Kuok: '#b91c1c',
    'Koto Kampar Hulu': '#0d9488',
    Tapung: '#d97706',
    'Tapung Hulu': '#b45309',
    'Tapung Hilir': '#92400e',
    'Kampar Kiri Hilir': '#047857',
    'Gunung Sahilan': '#15803d',
    'Kampar Kiri Tengah': '#166534',
    'Kampar Kiri': '#14532d'
  };

  function showToast(msg) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>💬</span> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  function loadLocalData() {
    try {
      State.visited = JSON.parse(localStorage.getItem(STORAGE_VISITED) || '{}');
      State.notes = JSON.parse(localStorage.getItem(STORAGE_NOTES) || '{}');
    } catch (e) {
      State.visited = {};
      State.notes = {};
    }
  }

  function saveLocalData() {
    try {
      localStorage.setItem(STORAGE_VISITED, JSON.stringify(State.visited));
      localStorage.setItem(STORAGE_NOTES, JSON.stringify(State.notes));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }

  function getActiveDataset() {
    return State.viewDataset === 'ALL181' ? State.kamparAll181 : State.masterList;
  }

  function initApp() {
    if (!window.POD_SURVEY_MASTER_DATA) {
      console.error('Master data not loaded!');
      return;
    }

    const data = window.POD_SURVEY_MASTER_DATA;
    State.masterList = data.pod_list || [];
    State.kamparAll181 = data.kampar_all_181 || [];
    State.kecamatanList = data.kecamatan_list || [];
    State.schedule = data.schedule || [];
    State.pksList = data.pks_list || [];

    loadLocalData();

    setupTabs();
    setupDatasetSwitcher();
    setupKecamatanChips();
    setupSearchAndFilters();
    setupMobileModal();
    setupExportButtons();

    renderTargets();
    renderKecamatanSummary();
    updateCounterBadges();

    setTimeout(() => initLeafletMap(), 150);
  }

  function setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab-btn');
    tabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        switchTab(tab);
      });
    });
  }

  function switchTab(tabId) {
    State.activeTab = tabId;
    document.querySelectorAll('.nav-tab-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });

    document.getElementById('view-map').style.display = tabId === 'map' ? 'block' : 'none';
    document.getElementById('view-targets').style.display = tabId === 'targets' ? 'block' : 'none';
    document.getElementById('view-summary').style.display = tabId === 'summary' ? 'block' : 'none';

    if (tabId === 'map' && State.mapInstance) {
      setTimeout(() => {
        State.mapInstance.invalidateSize();
        filterMapMarkers();
      }, 100);
    } else if (tabId === 'targets') {
      renderTargets();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setupDatasetSwitcher() {
    const btn63 = document.getElementById('btn-dataset-63');
    const btn181 = document.getElementById('btn-dataset-181');

    if (btn63 && btn181) {
      btn63.addEventListener('click', () => {
        State.viewDataset = 'TARGET63';
        btn63.classList.add('active');
        btn181.classList.remove('active');
        setupKecamatanChips();
        renderTargets();
        renderMapMarkers();
        updateCounterBadges();
        showToast('Menampilkan 63 Titik Target Utama');
      });

      btn181.addEventListener('click', () => {
        State.viewDataset = 'ALL181';
        btn181.classList.add('active');
        btn63.classList.remove('active');
        setupKecamatanChips();
        renderTargets();
        renderMapMarkers();
        updateCounterBadges();
        showToast('Menampilkan Semua 181 Titik Kampar (Hasil Survei Sebelumnya)');
      });
    }
  }

  function setupKecamatanChips() {
    const container = document.getElementById('kecamatan-chips-scroll');
    if (!container) return;
    container.innerHTML = '';

    const currentData = getActiveDataset();

    // Count per kecamatan in active dataset
    const kecCounts = {};
    currentData.forEach((p) => {
      const k = p.kecamatan || 'Lainnya';
      kecCounts[k] = (kecCounts[k] || 0) + 1;
    });

    // "Semua" chip
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = `kec-chip ${State.selectedKecamatan === 'ALL' ? 'active' : ''}`;
    allChip.innerHTML = `<span>Semua</span> <span class="chip-count">${currentData.length}</span>`;
    allChip.addEventListener('click', () => {
      State.selectedKecamatan = 'ALL';
      State.selectedVillage = 'ALL';
      updateActiveChips();
      setupVillageSubfilter();
      renderTargets();
      filterMapMarkers();
    });
    container.appendChild(allChip);

    // Sorted by count
    const sortedKecs = Object.entries(kecCounts).sort((a, b) => b[1] - a[1]);
    sortedKecs.forEach(([kecName, count]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `kec-chip ${State.selectedKecamatan === kecName ? 'active' : ''}`;
      chip.innerHTML = `<span>${kecName}</span> <span class="chip-count">${count}</span>`;
      chip.addEventListener('click', () => {
        State.selectedKecamatan = kecName;
        State.selectedVillage = 'ALL';
        updateActiveChips();
        setupVillageSubfilter();
        renderTargets();
        filterMapMarkers();
        showToast(`Filter: Kec. ${kecName} (${count} titik)`);
      });
      container.appendChild(chip);
    });

    setupVillageSubfilter();
  }

  // Setup Village (Desa) Sub-Filter
  function setupVillageSubfilter() {
    const container = document.getElementById('village-subfilter-bar');
    if (!container) return;

    if (State.selectedKecamatan === 'ALL') {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    const currentData = getActiveDataset();
    const kecPoints = currentData.filter((p) => p.kecamatan === State.selectedKecamatan);

    const villageCounts = {};
    kecPoints.forEach((p) => {
      const v = p.desa || 'Lainnya';
      villageCounts[v] = (villageCounts[v] || 0) + 1;
    });

    const villages = Object.entries(villageCounts).sort((a, b) => b[1] - a[1]);
    if (villages.length <= 1 && villages[0] && villages[0][0] === 'Lainnya') {
      container.style.display = 'none';
      return;
    }

    container.innerHTML = '';
    container.style.display = 'flex';

    // "Semua Desa" chip
    const allVillChip = document.createElement('button');
    allVillChip.type = 'button';
    allVillChip.className = `village-chip ${State.selectedVillage === 'ALL' ? 'active' : ''}`;
    allVillChip.textContent = `Semua Desa (${kecPoints.length})`;
    allVillChip.addEventListener('click', () => {
      State.selectedVillage = 'ALL';
      document.querySelectorAll('.village-chip').forEach((c) => c.classList.remove('active'));
      allVillChip.classList.add('active');
      renderTargets();
      filterMapMarkers();
    });
    container.appendChild(allVillChip);

    // Individual village chips
    villages.forEach(([villName, count]) => {
      const vChip = document.createElement('button');
      vChip.type = 'button';
      vChip.className = `village-chip ${State.selectedVillage === villName ? 'active' : ''}`;
      vChip.textContent = `Desa ${villName} (${count})`;
      vChip.addEventListener('click', () => {
        State.selectedVillage = villName;
        document.querySelectorAll('.village-chip').forEach((c) => c.classList.remove('active'));
        vChip.classList.add('active');
        renderTargets();
        filterMapMarkers();
        showToast(`Filter: Desa ${villName} (${count} titik)`);
      });
      container.appendChild(vChip);
    });
  }

  function updateActiveChips() {
    document.querySelectorAll('.kec-chip').forEach((chip) => {
      const isAll = chip.textContent.includes('Semua');
      if (State.selectedKecamatan === 'ALL') {
        chip.classList.toggle('active', isAll);
      } else {
        chip.classList.toggle('active', chip.textContent.includes(State.selectedKecamatan));
      }
    });
  }

  function setupSearchAndFilters() {
    const searchInput = document.getElementById('search-target-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        State.searchQuery = e.target.value.trim().toLowerCase();
        renderTargets();
        filterMapMarkers();
      });
    }

    const statusBtns = document.querySelectorAll('.btn-status-filter');
    statusBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        statusBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        State.selectedStatus = btn.getAttribute('data-status');
        renderTargets();
        filterMapMarkers();
      });
    });
  }

  function getFilteredPoints() {
    const currentData = getActiveDataset();
    return currentData.filter((p) => {
      if (State.selectedKecamatan !== 'ALL' && p.kecamatan !== State.selectedKecamatan) {
        return false;
      }
      if (State.selectedVillage !== 'ALL' && p.desa !== State.selectedVillage) {
        return false;
      }
      if (State.selectedDay !== 'ALL' && p.hari_ke && p.hari_ke !== parseInt(State.selectedDay, 10)) {
        return false;
      }
      const isDone = !!State.visited[p.id_pod];
      if (State.selectedStatus === 'DONE' && !isDone) return false;
      if (State.selectedStatus === 'PENDING' && isDone) return false;

      if (State.searchQuery) {
        const text = `${p.nama_pod} ${p.id_pod} ${p.desa} ${p.kecamatan} ${p.label_urutan || ''}`.toLowerCase();
        if (!text.includes(State.searchQuery)) return false;
      }
      return true;
    });
  }

  function renderTargets() {
    const container = document.getElementById('target-cards-container');
    const counterText = document.getElementById('status-counter-text');
    if (!container) return;

    const points = getFilteredPoints();
    container.innerHTML = '';

    const currentData = getActiveDataset();
    if (counterText) {
      const doneTotal = Object.keys(State.visited).length;
      counterText.innerHTML = `Menampilkan: <strong>${points.length}</strong> / ${currentData.length} titik • Selesai: <strong>${doneTotal}/${State.masterList.length}</strong>`;
    }

    if (points.length === 0) {
      container.innerHTML = `
        <div style="background: #ffffff; border-radius: 12px; padding: 30px; text-align: center; color: #64748b;">
          <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
          <h4 style="color: #1e293b;">Tidak ada titik yang sesuai filter</h4>
          <p style="font-size: 13px; margin-top: 4px;">Coba ganti filter kecamatan atau hapus kata pencarian.</p>
        </div>
      `;
      return;
    }

    points.forEach((p) => {
      const isDone = !!State.visited[p.id_pod];
      const isPrimary = p.is_target_63;
      const note = State.notes[p.id_pod] || '';
      const card = document.createElement('div');
      card.className = `target-card ${isDone ? 'completed' : ''}`;
      card.id = `card-${p.id_pod}`;

      const kecCol = KEC_COLORS[p.kecamatan] || '#059669';

      card.innerHTML = `
        <div class="card-top-row">
          <div class="card-meta-badges">
            ${p.label_urutan ? `<span class="badge-code">${p.label_urutan}</span>` : ''}
            <span class="badge-kecamatan" style="background: ${kecCol}18; color: ${kecCol};">${p.kecamatan}</span>
            <span class="badge-jenis">${p.jenis_pod}</span>
            ${isPrimary ? '<span class="badge-target-flag">🎯 Target Utama</span>' : `<span class="badge-prev-flag">🏛️ Survei Lalu (${p.year || '2023'})</span>`}
          </div>
          <div style="font-size: 11px; font-family: monospace; color: #64748b; font-weight: 700;">
            ${p.id_pod}
          </div>
        </div>

        <h3 class="card-title">${p.nama_pod}</h3>
        <div class="card-village">
          <span>📍</span>
          <span>${p.desa ? `Desa ${p.desa}, ` : ''}Kec. ${p.kecamatan}</span>
          ${p.info_mill ? ` • <span style="color: #d97706; font-weight: bold;">🏭 ${p.info_mill}</span>` : ''}
        </div>

        <div class="card-coords-box">
          <span class="coords-text">📐 ${p.utm_string}</span>
          <button type="button" class="btn-copy-coords" title="Salin Koordinat UTM Avenza">
            Salin
          </button>
        </div>

        <div class="card-actions-grid">
          <a href="${p.google_nav_url}" target="_blank" rel="noopener noreferrer" class="btn-gmaps">
            <span>🧭</span>
            <span>Google Maps</span>
          </a>
          <a href="${p.waze_url}" target="_blank" rel="noopener noreferrer" class="btn-waze">
            <span>🗺️</span>
            <span>Waze</span>
          </a>
          <button type="button" class="btn-toggle-done">
            <span>${isDone ? '✅ Selesai' : '🟡 Belum'}</span>
          </button>
        </div>

        <div class="card-quick-note">
          <span>📝</span>
          <input type="text" class="note-input-inline" placeholder="Catatan lapangan (opsional, contoh: Buka, ada timbangan)..." value="${note}">
        </div>
      `;

      card.querySelector('.btn-copy-coords').addEventListener('click', () => {
        const textToCopy = `Lat: ${p.lat}, Long: ${p.lng} | UTM: ${p.utm_string} (${p.nama_pod})`;
        navigator.clipboard.writeText(textToCopy).then(() => {
          showToast('Koordinat disalin!');
        });
      });

      card.querySelector('.btn-toggle-done').addEventListener('click', () => {
        if (State.visited[p.id_pod]) {
          delete State.visited[p.id_pod];
        } else {
          State.visited[p.id_pod] = new Date().toISOString();
        }
        saveLocalData();
        renderTargets();
        updateCounterBadges();
        filterMapMarkers();
      });

      const noteInput = card.querySelector('.note-input-inline');
      noteInput.addEventListener('change', () => {
        const val = noteInput.value.trim();
        if (val) {
          State.notes[p.id_pod] = val;
        } else {
          delete State.notes[p.id_pod];
        }
        saveLocalData();
        showToast('Catatan disimpan');
      });

      container.appendChild(card);
    });
  }

  function initLeafletMap() {
    const mapEl = document.getElementById('leaflet-map');
    if (!mapEl || !window.L) return;

    if (!State.mapInstance) {
      State.mapInstance = L.map('leaflet-map', {
        zoomControl: true,
        attributionControl: false
      }).setView([0.35, 101.25], 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18
      }).addTo(State.mapInstance);

      // Add PKS Prioritas
      State.pksList.forEach((pks) => {
        const pksIcon = L.divIcon({
          className: 'custom-pks-marker',
          html: `<div style="background: #0f172a; color: #ffffff; border: 2px solid #f59e0b; width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: 0 4px 10px rgba(0,0,0,0.4);">🏭</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        });
        const m = L.marker([pks.lat, pks.lng], { icon: pksIcon }).addTo(State.mapInstance);
        m.bindPopup(`
          <div style="font-family: sans-serif; min-width: 200px;">
            <div style="color: #d97706; font-size: 11px; font-weight: 800; text-transform: uppercase;">PKS Prioritas (Pabrik)</div>
            <h4 style="margin: 4px 0; font-size: 15px; font-weight: 800;">${pks.nama_pks}</h4>
            <p style="margin: 2px 0 8px; font-size: 12px; color: #475569;">${pks.alamat || pks.kabupaten}</p>
            <a href="${pks.google_nav_url}" target="_blank" rel="noopener noreferrer" style="background: #059669; color: #ffffff; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">
              🧭 Navigasi ke PKS
            </a>
          </div>
        `);
      });

      const btnLocate = document.getElementById('btn-map-locate-me');
      if (btnLocate) {
        btnLocate.addEventListener('click', () => {
          getUserLocationOnMap();
        });
      }
    }

    renderMapMarkers();
  }

  function renderMapMarkers() {
    if (!State.mapInstance) return;

    Object.values(State.mapMarkers).forEach((m) => State.mapInstance.removeLayer(m));
    State.mapMarkers = {};

    const currentData = getActiveDataset();

    currentData.forEach((p) => {
      const isDone = !!State.visited[p.id_pod];
      const isPrimary = p.is_target_63;
      const kecCol = KEC_COLORS[p.kecamatan] || '#059669';
      const col = isDone ? '#10b981' : isPrimary ? kecCol : '#64748b';

      const label = isDone ? '✓' : p.urutan_hari ? p.urutan_hari : '•';

      const markerIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="background-color: ${col}; color: #ffffff; width: ${isPrimary ? '28px' : '22px'}; height: ${isPrimary ? '28px' : '22px'}; border-radius: 50%; border: 2px solid #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; box-shadow: 0 2px 6px rgba(0,0,0,0.35);">
                ${label}
               </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([p.lat, p.lng], { icon: markerIcon }).addTo(State.mapInstance);

      marker.bindPopup(`
        <div style="font-family: sans-serif; min-width: 220px; padding: 4px;">
          <div style="font-size: 11px; font-weight: 800; color: ${kecCol}; text-transform: uppercase;">
            ${p.label_urutan ? `${p.label_urutan} • ` : ''}Kec. ${p.kecamatan}
          </div>
          <h4 style="margin: 4px 0 2px; font-size: 15px; font-weight: 800; color: #0f172a;">${p.nama_pod}</h4>
          <p style="margin: 0 0 6px; font-size: 12px; color: #475569;">
            ${p.desa ? `Desa ${p.desa}` : ''} (${p.jenis_pod})<br>
            ${isPrimary ? '<strong style="color: #059669;">🎯 Target Utama Survei</strong>' : `<span style="color: #64748b;">🏛️ Survei Lalu (${p.year || '2023'})</span>`}
            ${p.info_mill ? `<br><span style="color: #d97706;">🏭 Mill: ${p.info_mill}</span>` : ''}
          </p>
          <div style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-family: monospace; color: #334155; margin-bottom: 8px;">
            ${p.utm_string}
          </div>
          <div style="display: flex; gap: 6px;">
            <a href="${p.google_nav_url}" target="_blank" rel="noopener noreferrer" style="flex: 2; background: #059669; color: #fff; text-decoration: none; padding: 8px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; text-align: center; display: inline-flex; align-items: center; justify-content: center; gap: 4px;">
              🧭 Google Maps
            </a>
            <button id="btn-popup-toggle-${p.id_pod}" style="flex: 1; background: ${isDone ? '#10b981' : '#ffffff'}; color: ${isDone ? '#ffffff' : '#334155'}; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
              ${isDone ? '✓ Selesai' : 'Tandai'}
            </button>
          </div>
        </div>
      `);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`btn-popup-toggle-${p.id_pod}`);
        if (btn) {
          btn.addEventListener('click', () => {
            if (State.visited[p.id_pod]) {
              delete State.visited[p.id_pod];
            } else {
              State.visited[p.id_pod] = new Date().toISOString();
            }
            saveLocalData();
            renderMapMarkers();
            renderTargets();
            updateCounterBadges();
            marker.closePopup();
            showToast('Status diperbarui!');
          });
        }
      });

      State.mapMarkers[p.id_pod] = marker;
    });

    filterMapMarkers();
  }

  function filterMapMarkers() {
    if (!State.mapInstance) return;
    const filtered = getFilteredPoints();
    const activeIds = new Set(filtered.map((p) => p.id_pod));

    const bounds = [];
    Object.keys(State.mapMarkers).forEach((id) => {
      const marker = State.mapMarkers[id];
      if (activeIds.has(id)) {
        if (!State.mapInstance.hasLayer(marker)) {
          State.mapInstance.addLayer(marker);
        }
        bounds.push(marker.getLatLng());
      } else {
        if (State.mapInstance.hasLayer(marker)) {
          State.mapInstance.removeLayer(marker);
        }
      }
    });

    if (bounds.length > 0 && State.selectedKecamatan !== 'ALL') {
      State.mapInstance.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
    }

    const infoPill = document.getElementById('map-bottom-info');
    if (infoPill) {
      infoPill.innerHTML = `<span>📍 Menampilkan <strong>${filtered.length}</strong> titik di peta (${State.viewDataset === 'ALL181' ? 'Database 181 Kampar' : 'Target 63'})</span>`;
    }
  }

  function getUserLocationOnMap() {
    if (!navigator.geolocation) {
      showToast('GPS tidak didukung oleh browser ini');
      return;
    }
    const btn = document.getElementById('btn-map-locate-me');
    if (btn) btn.textContent = '⏳ Mencari GPS...';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);

        if (State.userMarker) {
          State.mapInstance.removeLayer(State.userMarker);
        }

        const userIcon = L.divIcon({
          className: 'user-gps-marker',
          html: `<div style="background: #2563eb; width: 20px; height: 20px; border-radius: 50%; border: 3px solid #ffffff; box-shadow: 0 0 0 6px rgba(37,99,235,0.3);"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        State.userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(State.mapInstance);
        State.userMarker.bindPopup(`<b>Posisi Anda Saat Ini</b><br>Akurasi: ±${acc}m`).openPopup();
        State.mapInstance.setView([lat, lng], 13);

        if (btn) btn.textContent = '📍 Lokasi Saya';
        showToast(`Posisi GPS ditemukan! Akurasi: ±${acc}m`);
      },
      (err) => {
        if (btn) btn.textContent = '📍 Lokasi Saya';
        showToast(`Gagal membaca GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function renderKecamatanSummary() {
    const container = document.getElementById('kecamatan-summary-grid');
    if (!container) return;
    container.innerHTML = '';

    State.kecamatanList.forEach((k) => {
      const card = document.createElement('div');
      card.className = 'kecamatan-card-box';
      const kecCol = KEC_COLORS[k.nama_kecamatan] || '#059669';

      const doneInKec = k.points.filter((p) => !!State.visited[p.id_pod]).length;
      const pct = Math.round((doneInKec / k.total_titik) * 100);

      const villageBadgesHtml = Object.entries(k.desa_list)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([vName, vCount]) =>
            `<span class="village-tag-badge" data-kec="${k.nama_kecamatan}" data-desa="${vName}" style="cursor: pointer;"><span>🏡 ${vName}</span> <strong>(${vCount})</strong></span>`
        )
        .join(' ');

      card.innerHTML = `
        <div class="kec-card-top">
          <span class="kec-card-name" style="color: ${kecCol};">${k.nama_kecamatan}</span>
          <span class="kec-card-count">${k.total_titik} Titik Target</span>
        </div>
        <div class="kec-villages-list" style="margin-bottom: 8px;">
          <div style="font-weight: 700; margin-bottom: 4px; color: #1e293b;">Daftar Desa (${Object.keys(k.desa_list).length} Desa):</div>
          <div>${villageBadgesHtml}</div>
        </div>
        <div style="font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 10px;">
          Progress: <strong style="color: #059669;">${doneInKec}/${k.total_titik}</strong> Selesai (${pct}%)
        </div>
        <button type="button" class="kec-card-btn-action">
          <span>🔍</span> Buka Titik Kecamatan Ini
        </button>
      `;

      // Click on card opens kecamatan
      card.querySelector('.kec-card-btn-action').addEventListener('click', (e) => {
        e.stopPropagation();
        State.selectedKecamatan = k.nama_kecamatan;
        State.selectedVillage = 'ALL';
        updateActiveChips();
        setupVillageSubfilter();
        switchTab('targets');
      });

      card.addEventListener('click', () => {
        State.selectedKecamatan = k.nama_kecamatan;
        State.selectedVillage = 'ALL';
        updateActiveChips();
        setupVillageSubfilter();
        switchTab('targets');
      });

      // Click on individual village badge opens that specific village
      card.querySelectorAll('.village-tag-badge').forEach((vBadge) => {
        vBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          const kec = vBadge.getAttribute('data-kec');
          const desa = vBadge.getAttribute('data-desa');
          State.selectedKecamatan = kec;
          State.selectedVillage = desa;
          updateActiveChips();
          setupVillageSubfilter();
          switchTab('targets');
          showToast(`Filter: Kec. ${kec} ➔ Desa ${desa}`);
        });
      });

      container.appendChild(card);
    });

    const scheduleContainer = document.getElementById('schedule-timeline-container');
    if (scheduleContainer) {
      scheduleContainer.innerHTML = '';
      State.schedule.forEach((s) => {
        const item = document.createElement('div');
        item.className = 'day-timeline-card';
        const dayPoints = State.masterList.filter((p) => p.hari_ke === s.hari);
        const dayDone = dayPoints.filter((p) => !!State.visited[p.id_pod]).length;

        item.innerHTML = `
          <div class="day-timeline-header">
            <span class="day-timeline-tag">HARI KE-${s.hari}</span>
            <span class="day-date-label">📅 ${s.tanggal}</span>
          </div>
          <h4 class="day-timeline-title">${s.judul}</h4>
          <p class="day-timeline-corridor">${s.koridor}</p>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; padding-top: 8px; border-top: 1px solid #f1f5f9;">
            <span>🎯 <strong>${s.jumlah_titik} Titik</strong> (~${s.estimasi_jarak_km} km)</span>
            <span style="font-weight: 700; color: ${dayDone === s.jumlah_titik ? '#059669' : '#d97706'};">
              ${dayDone}/${s.jumlah_titik} Selesai
            </span>
          </div>
        `;
        item.addEventListener('click', () => {
          State.selectedDay = s.hari.toString();
          switchTab('targets');
          showToast(`Filter: Hari ke-${s.hari} (${s.jumlah_titik} titik)`);
        });
        scheduleContainer.appendChild(item);
      });
    }
  }

  function updateCounterBadges() {
    const done = Object.keys(State.visited).length;
    const total = State.masterList.length;
    const badge = document.getElementById('global-progress-badge');
    if (badge) {
      badge.textContent = `${done}/${total} Selesai`;
    }
  }

  function setupMobileModal() {
    const btnOpen = document.getElementById('btn-open-mobile-modal');
    const modal = document.getElementById('mobile-qr-modal');
    const btnClose = document.getElementById('btn-close-modal');
    const btnCopyIp = document.getElementById('btn-copy-mobile-ip');

    if (btnOpen && modal) {
      btnOpen.addEventListener('click', () => {
        modal.classList.add('active');
      });
    }
    if (btnClose && modal) {
      btnClose.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }

    if (btnCopyIp) {
      btnCopyIp.addEventListener('click', () => {
        const ip = 'http://192.168.100.107:3000';
        navigator.clipboard.writeText(ip).then(() => {
          showToast('Alamat URL disalin ke clipboard!');
        });
      });
    }
  }

  function setupExportButtons() {
    const btnExcel = document.getElementById('btn-export-excel-quick');
    const btnWa = document.getElementById('btn-export-wa-quick');
    const btnGeo = document.getElementById('btn-export-geojson-quick');

    if (btnExcel) {
      btnExcel.addEventListener('click', () => exportExcel());
    }
    if (btnWa) {
      btnWa.addEventListener('click', () => copyWhatsAppReport());
    }
    if (btnGeo) {
      btnGeo.addEventListener('click', () => exportGeoJSON());
    }
  }

  function exportExcel() {
    if (!window.XLSX) {
      showToast('Library Excel tidak tersedia');
      return;
    }
    const currentData = getActiveDataset();
    const rows = currentData.map((p) => {
      const isDone = !!State.visited[p.id_pod];
      const visitedDate = State.visited[p.id_pod];
      return {
        'No Urut': p.no || p.fid,
        'Kode Rute': p.label_urutan || '-',
        'Hari Ke': p.hari_ke || '-',
        'ID POD': p.id_pod,
        'Nama POD': p.nama_pod,
        'Jenis POD': p.jenis_pod,
        Kecamatan: p.kecamatan,
        Desa: p.desa,
        Kabupaten: p.kabupaten,
        'Target Utama 63': p.is_target_63 ? 'Ya' : 'Tidak (Database)',
        'Tahun Data': p.year || '2026',
        'Sumber Data': p.source || 'POD Survey',
        'Info Mill / PKS': p.info_mill || '',
        'Status Survei': isDone ? 'Sudah Dikunjungi' : 'Belum Dikunjungi',
        'Waktu Kunjungan': visitedDate ? new Date(visitedDate).toLocaleString('id-ID') : '',
        'Catatan Lapangan': State.notes[p.id_pod] || '',
        Latitude: p.lat,
        Longitude: p.lng,
        'UTM Avenza String': p.utm_string,
        'Google Maps URL': p.google_maps_url
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Target_POD_Kampar');
    XLSX.writeFile(wb, `Survei_POD_Kampar_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('File Excel berhasil diunduh! 📊');
  }

  function copyWhatsAppReport() {
    const total = State.masterList.length;
    const done = Object.keys(State.visited).length;
    const pct = Math.round((done / total) * 100);

    let txt = `📋 *LAPORAN PROGRESS SURVEI POD KAMPAR*\n`;
    txt += `📅 Update: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}\n`;
    txt += `------------------------------------\n`;
    txt += `🎯 *Total Kunjungan Target*: ${done} / ${total} Titik (${pct}%)\n\n`;

    txt += `📍 *Rincian per Kecamatan*:\n`;
    State.kecamatanList.forEach((k) => {
      const kDone = k.points.filter((p) => !!State.visited[p.id_pod]).length;
      txt += `• *Kec. ${k.nama_kecamatan}*: ${kDone}/${k.total_titik} titik\n`;
    });

    navigator.clipboard.writeText(txt).then(() => {
      showToast('Laporan WA disalin! Tinggal tempel di WhatsApp.');
    });
  }

  function exportGeoJSON() {
    const currentData = getActiveDataset();
    const features = currentData.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: {
        id_pod: p.id_pod,
        nama_pod: p.nama_pod,
        jenis_pod: p.jenis_pod,
        kecamatan: p.kecamatan,
        desa: p.desa,
        is_target_63: !!p.is_target_63,
        year: p.year || '2026',
        mill: p.info_mill || '',
        status: State.visited[p.id_pod] ? 'Selesai' : 'Belum',
        catatan: State.notes[p.id_pod] || ''
      }
    }));
    const geo = { type: 'FeatureCollection', features };
    const blob = new Blob([JSON.stringify(geo, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `POD_Kampar_${State.viewDataset}.geojson`;
    a.click();
    showToast('File GeoJSON untuk Avenza Maps & QGIS diunduh! 🗺️');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
