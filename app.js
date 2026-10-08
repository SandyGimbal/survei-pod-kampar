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
    sandyTapung41: [], // 41 priority points for Sandy in Tapung (4 days @ 10 points)
    scheduleSandy: [], // 4-day plan for Sandy
    masterList: [], // 63 primary targets
    kamparAll181: [], // 181 Kampar points from 517 database
    tapungPrioritas78: [], // 78 Tapung priority points from Data-Prioritas
    scheduleTapung: [], // 7-day schedule for Tapung Raya
    kecamatanTapungList: [], // Tapung subdistricts summary
    tapungBoundariesGeojson: null, // Boundary polygons from TapungPOD.kmz
    kecamatanList: [],
    schedule: [],
    pksList: [],
    visited: {},
    notes: {},
    activeTab: 'map', // 'map', 'targets', 'summary'
    viewDataset: 'SANDY41', // 'SANDY41' (Default Khusus Sandy), 'TAPUNG78', 'TARGET63', or 'ALL181'
    selectedPriority: 'ALL', // 'ALL', 'GAR', 'Priority 1', 'Priority 2'
    selectedKecamatan: 'ALL',
    selectedVillage: 'ALL',
    selectedDay: 'ALL',
    selectedStatus: 'ALL', // 'ALL', 'PENDING', 'DONE'
    searchQuery: '',
    mapInstance: null,
    mapMarkers: {},
    userMarker: null,
    currentLayer: 'osm',
    osmLayer: null,
    satelliteLayer: null,
    boundaryLayer: null,
    showBoundaries: true
  };

  const KEC_COLORS = {
    Tapung: '#ea580c',        // 🟧 Jingga / Deep Orange (41 Titik)
    'Tapung Hulu': '#2563eb', // 🟦 Biru / Royal Blue (28 Titik)
    'Tapung Hilir': '#9333ea',// 🟪 Ungu / Vivid Violet (9 Titik)
    'Perhentian Raja': '#059669',
    Tambang: '#0284c7',
    Kampa: '#d97706',
    Bangkinang: '#7c3aed',
    'Rumbio Jaya': '#0891b2',
    'Siak Hulu': '#dc2626',
    Salo: '#4f46e5',
    Kampar: '#16a34a',
    'Kampar Utara': '#f97316',
    'Xiii Koto Kampar': '#0369a1',
    'Bangkinang Kota': '#6d28d9',
    Kuok: '#b91c1c',
    'Koto Kampar Hulu': '#0d9488',
    'Kampar Kiri Hilir': '#047857',
    'Gunung Sahilan': '#15803d',
    'Kampar Kiri Tengah': '#166534',
    'Kampar Kiri': '#14532d'
  };

  const TAPUNG_RAYA_CONFIG = {
    Tapung: {
      color: '#ea580c',
      badge: '🟧',
      total: 41,
      label: 'Kecamatan Tapung'
    },
    'Tapung Hulu': {
      color: '#2563eb',
      badge: '🟦',
      total: 28,
      label: 'Kecamatan Tapung Hulu'
    },
    'Tapung Hilir': {
      color: '#9333ea',
      badge: '🟪',
      total: 9,
      label: 'Kecamatan Tapung Hilir'
    }
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
    if (State.viewDataset === 'SANDY41') return State.sandyTapung41;
    if (State.viewDataset === 'TAPUNG78') return State.tapungPrioritas78;
    if (State.viewDataset === 'ALL181') return State.kamparAll181;
    return State.masterList;
  }

  function getActiveSchedule() {
    if (State.viewDataset === 'SANDY41') return State.scheduleSandy;
    if (State.viewDataset === 'TAPUNG78') return State.scheduleTapung;
    return State.schedule;
  }

  function getActiveKecamatanList() {
    if (State.viewDataset === 'SANDY41') {
      return State.kecamatanTapungList.filter((k) => k.nama_kecamatan === 'Tapung');
    }
    if (State.viewDataset === 'TAPUNG78') return State.kecamatanTapungList;
    return State.kecamatanList;
  }

  function initApp() {
    if (!window.POD_SURVEY_MASTER_DATA) {
      console.error('Master data not loaded!');
      return;
    }

    const data = window.POD_SURVEY_MASTER_DATA;
    State.sandyTapung41 = data.sandy_tapung_41 || [];
    State.scheduleSandy = data.schedule_sandy || [];
    State.tapungPrioritas78 = data.tapung_prioritas_78 || [];
    State.scheduleTapung = data.schedule_tapung || [];
    State.kecamatanTapungList = data.kecamatan_tapung_list || [];
    State.tapungBoundariesGeojson = data.tapung_boundaries_geojson || null;
    State.masterList = data.pod_list || [];
    State.kamparAll181 = data.kampar_all_181 || [];
    State.kecamatanList = data.kecamatan_list || [];
    State.schedule = data.schedule || [];
    State.pksList = data.pks_list || [];

    loadLocalData();

    setupTabs();
    setupDatasetSwitcher();
    setupPriorityChips();
    setupKecamatanChips();
    setupLegendTapung();
    setupSearchAndFilters();
    setupDayFilterBar();
    setupMobileModal();
    setupDetailModal();
    setupExportButtons();

    renderTargets();
    renderKecamatanSummary();
    updateCounterBadges();

    setTimeout(() => {
      initLeafletMap();
      if (State.viewDataset === 'SANDY41' && State.mapInstance) {
        highlightBoundaryPolygon('Tapung');
        const pts = State.sandyTapung41.map((p) => [p.lat, p.lng]);
        if (pts.length > 0) State.mapInstance.fitBounds(L.latLngBounds(pts), { padding: [35, 35] });
      }
    }, 150);
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
    const btnSandy = document.getElementById('btn-dataset-sandy');
    const btnTapung = document.getElementById('btn-dataset-tapung');
    const btn63 = document.getElementById('btn-dataset-63');
    const btn181 = document.getElementById('btn-dataset-181');
    const subtitleEl = document.getElementById('app-subtitle-main');

    function setActiveBtn(activeBtn) {
      [btnSandy, btnTapung, btn63, btn181].forEach((b) => {
        if (b) b.classList.toggle('active', b === activeBtn);
      });
    }

    if (btnSandy) {
      btnSandy.addEventListener('click', () => {
        State.viewDataset = 'SANDY41';
        State.selectedKecamatan = 'ALL';
        State.selectedVillage = 'ALL';
        State.selectedPriority = 'ALL';
        State.selectedDay = 'ALL';
        setActiveBtn(btnSandy);
        if (subtitleEl) {
          subtitleEl.textContent = '⭐ Prioritas Khusus Sandy: Kec. Tapung • 41 Titik (4 Hari @ 10 Titik)';
        }
        const legendBox = document.getElementById('map-tapung-legend-box');
        if (legendBox) legendBox.style.display = 'flex';

        if (State.boundaryLayer && State.mapInstance && !State.mapInstance.hasLayer(State.boundaryLayer)) {
          State.boundaryLayer.addTo(State.mapInstance);
          State.showBoundaries = true;
          const bText = document.getElementById('boundary-toggle-text');
          if (bText) bText.textContent = 'Batas Wilayah';
          const btnB = document.getElementById('btn-map-boundary-toggle');
          if (btnB) btnB.classList.add('active');
        }
        highlightBoundaryPolygon('Tapung');
        setupPriorityChips();
        setupKecamatanChips();
        setupDayFilterBar();
        renderTargets();
        renderMapMarkers();
        renderKecamatanSummary();
        updateCounterBadges();
        showToast('⭐ Prioritas Khusus Sandy: Kec. Tapung (41 Titik • Target 10/Hari)');
        setTimeout(() => {
          if (State.mapInstance) {
            const pts = State.sandyTapung41.map((p) => [p.lat, p.lng]);
            if (pts.length > 0) State.mapInstance.fitBounds(L.latLngBounds(pts), { padding: [35, 35] });
          }
        }, 120);
      });
    }

    if (btnTapung) {
      btnTapung.addEventListener('click', () => {
        State.viewDataset = 'TAPUNG78';
        State.selectedKecamatan = 'ALL';
        State.selectedVillage = 'ALL';
        State.selectedPriority = 'ALL';
        State.selectedDay = 'ALL';
        setActiveBtn(btnTapung);
        if (subtitleEl) {
          subtitleEl.textContent = '🗺️ Prioritas Minggu Ini: Tapung Raya • 78 Titik POD';
        }
        const legendBox = document.getElementById('map-tapung-legend-box');
        if (legendBox) legendBox.style.display = 'flex';

        if (State.boundaryLayer && State.mapInstance && !State.mapInstance.hasLayer(State.boundaryLayer)) {
          State.boundaryLayer.addTo(State.mapInstance);
          State.showBoundaries = true;
          const bText = document.getElementById('boundary-toggle-text');
          if (bText) bText.textContent = 'Batas Wilayah';
          const btnB = document.getElementById('btn-map-boundary-toggle');
          if (btnB) btnB.classList.add('active');
        }
        highlightBoundaryPolygon('ALL');
        setupPriorityChips();
        setupKecamatanChips();
        setupDayFilterBar();
        renderTargets();
        renderMapMarkers();
        renderKecamatanSummary();
        updateCounterBadges();
        showToast('⭐ Menampilkan Prioritas Minggu Ini: Tapung Raya (78 Titik)');
        setTimeout(() => {
          if (State.mapInstance) {
            if (State.boundaryLayer) {
              State.mapInstance.fitBounds(State.boundaryLayer.getBounds(), { padding: [35, 35] });
            } else {
              const pts = State.tapungPrioritas78.map((p) => [p.lat, p.lng]);
              if (pts.length > 0) State.mapInstance.fitBounds(L.latLngBounds(pts), { padding: [35, 35] });
            }
          }
        }, 120);
      });
    }

    if (btn63) {
      btn63.addEventListener('click', () => {
        State.viewDataset = 'TARGET63';
        State.selectedKecamatan = 'ALL';
        State.selectedVillage = 'ALL';
        State.selectedPriority = 'ALL';
        State.selectedDay = 'ALL';
        setActiveBtn(btn63);
        if (subtitleEl) {
          subtitleEl.textContent = '🎯 Target Awal: 63 Titik • 13 Kecamatan • Mulai 6-7 Okt';
        }
        const legendBox = document.getElementById('map-tapung-legend-box');
        if (legendBox) legendBox.style.display = 'none';

        setupPriorityChips();
        setupKecamatanChips();
        setupDayFilterBar();
        renderTargets();
        renderMapMarkers();
        renderKecamatanSummary();
        updateCounterBadges();
        showToast('Menampilkan 63 Titik Target Awal');
        setTimeout(() => {
          if (State.mapInstance) {
            const pts = State.masterList.map((p) => [p.lat, p.lng]);
            if (pts.length > 0) State.mapInstance.fitBounds(L.latLngBounds(pts), { padding: [35, 35] });
          }
        }, 120);
      });
    }

    if (btn181) {
      btn181.addEventListener('click', () => {
        State.viewDataset = 'ALL181';
        State.selectedKecamatan = 'ALL';
        State.selectedVillage = 'ALL';
        State.selectedPriority = 'ALL';
        State.selectedDay = 'ALL';
        setActiveBtn(btn181);
        if (subtitleEl) {
          subtitleEl.textContent = '🏛️ Semua Kampar: 181 Titik POD (Database Lapangan)';
        }
        const legendBox = document.getElementById('map-tapung-legend-box');
        if (legendBox) legendBox.style.display = 'none';

        setupPriorityChips();
        setupKecamatanChips();
        setupDayFilterBar();
        renderTargets();
        renderMapMarkers();
        renderKecamatanSummary();
        updateCounterBadges();
        showToast('Menampilkan Semua 181 Titik Kampar (Database Lapangan)');
        setTimeout(() => {
          if (State.mapInstance) {
            const pts = State.kamparAll181.map((p) => [p.lat, p.lng]);
            if (pts.length > 0) State.mapInstance.fitBounds(L.latLngBounds(pts), { padding: [35, 35] });
          }
        }, 120);
      });
    }
  }

  function setupPriorityChips() {
    const container = document.getElementById('priority-chips-scroll');
    if (!container) return;
    container.innerHTML = '';

    const currentData = getActiveDataset();
    const prioCounts = {};
    currentData.forEach((p) => {
      const pr = p.priority || 'Lainnya';
      prioCounts[pr] = (prioCounts[pr] || 0) + 1;
    });

    // "Semua Prioritas" chip
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = `chip-priority ${State.selectedPriority === 'ALL' ? 'active' : ''}`;
    allChip.innerHTML = `<span>⭐ Semua</span> <strong>(${currentData.length})</strong>`;
    allChip.addEventListener('click', () => {
      State.selectedPriority = 'ALL';
      document.querySelectorAll('.chip-priority').forEach((c) => c.classList.remove('active'));
      allChip.classList.add('active');
      renderTargets();
      filterMapMarkers();
      showToast('Menampilkan semua tingkat prioritas');
    });
    container.appendChild(allChip);

    // Specific chips for GAR, Priority 1, Priority 2 if present
    const prioKeys = Object.keys(prioCounts).sort((a, b) => {
      if (a === 'GAR') return -1;
      if (b === 'GAR') return 1;
      return a.localeCompare(b);
    });

    prioKeys.forEach((k) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      let extraClass = '';
      let icon = '📌';
      if (k === 'GAR') {
        extraClass = 'gar';
        icon = '🔥';
      } else if (k === 'Priority 1') {
        extraClass = 'p1';
        icon = '⚡';
      } else if (k === 'Priority 2') {
        extraClass = 'p2';
        icon = '📍';
      }

      chip.className = `chip-priority ${extraClass} ${State.selectedPriority === k ? 'active' : ''}`;
      chip.innerHTML = `<span>${icon} ${k}</span> <strong>(${prioCounts[k]})</strong>`;
      chip.addEventListener('click', () => {
        State.selectedPriority = k;
        document.querySelectorAll('.chip-priority').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        renderTargets();
        filterMapMarkers();
        showToast(`Filter Prioritas: ${k} (${prioCounts[k]} titik)`);
      });
      container.appendChild(chip);
    });
  }

  function setupDayFilterBar() {
    const containers = [
      document.getElementById('sticky-day-filter-bar'),
      document.getElementById('day-schedule-filter-bar')
    ].filter(Boolean);

    if (containers.length === 0) return;
    containers.forEach((c) => (c.innerHTML = ''));

    const sched = getActiveSchedule();
    const currentData = getActiveDataset();
    if (!sched || sched.length === 0) {
      containers.forEach((c) => (c.style.display = 'none'));
      return;
    }
    containers.forEach((c) => (c.style.display = 'flex'));

    function syncActiveDay(dayVal) {
      document.querySelectorAll('.chip-day-filter').forEach((c) => {
        const d = c.getAttribute('data-day');
        c.classList.toggle('active', d === dayVal);
      });
    }

    containers.forEach((container) => {
      // "Semua Hari"
      const allDayBtn = document.createElement('button');
      allDayBtn.type = 'button';
      allDayBtn.setAttribute('data-day', 'ALL');
      allDayBtn.className = `chip-day-filter ${State.selectedDay === 'ALL' ? 'active' : ''}`;
      allDayBtn.innerHTML = `<span>📅 Semua Hari</span> <strong>(${currentData.length})</strong>`;
      allDayBtn.addEventListener('click', () => {
        State.selectedDay = 'ALL';
        syncActiveDay('ALL');
        renderTargets();
        filterMapMarkers();
        showToast(`Menampilkan semua target (${currentData.length} titik)`);
      });
      container.appendChild(allDayBtn);

      sched.forEach((s) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-day', s.hari.toString());
        btn.className = `chip-day-filter ${State.selectedDay === s.hari.toString() ? 'active' : ''}`;

        let dayLabel = `Hari ${s.hari}`;
        if (State.viewDataset === 'SANDY41') {
          if (s.hari === 1) dayLabel = `H1: Masuk Timur`;
          else if (s.hari === 2) dayLabel = `H2: Poros Tengah`;
          else if (s.hari === 3) dayLabel = `H3: Simp Petapahan`;
          else if (s.hari === 4) dayLabel = `H4: Barat GAR`;
        }

        btn.innerHTML = `<span>${dayLabel}</span> <strong>(${s.jumlah_titik})</strong>`;
        btn.title = `${s.judul} - ${s.koridor}`;
        btn.addEventListener('click', () => {
          State.selectedDay = s.hari.toString();
          syncActiveDay(s.hari.toString());
          renderTargets();
          filterMapMarkers();
          showToast(`🎯 Filter Hari ke-${s.hari}: ${s.judul} (${s.jumlah_titik} titik)`);
        });
        container.appendChild(btn);
      });
    });
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

  function highlightBoundaryPolygon(kecName) {
    if (!State.boundaryLayer || !State.mapInstance) return;
    State.boundaryLayer.eachLayer((layer) => {
      const name = layer.feature && layer.feature.properties ? layer.feature.properties.name : '';
      const cfg = TAPUNG_RAYA_CONFIG[name] || { color: '#059669' };
      if (!kecName || kecName === 'ALL') {
        layer.setStyle({
          color: cfg.color,
          weight: 2.8,
          opacity: 0.95,
          fillColor: cfg.color,
          fillOpacity: 0.15,
          dashArray: '6, 6'
        });
      } else if (name === kecName) {
        layer.setStyle({
          color: cfg.color,
          weight: 4.5,
          opacity: 1,
          fillColor: cfg.color,
          fillOpacity: 0.28,
          dashArray: ''
        });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
          layer.bringToFront();
        }
      } else {
        layer.setStyle({
          color: cfg.color,
          weight: 1.5,
          opacity: 0.35,
          fillColor: cfg.color,
          fillOpacity: 0.04,
          dashArray: '4, 6'
        });
      }
    });
  }

  function setupLegendTapung() {
    const legendBtns = document.querySelectorAll('.legend-kec-btn');
    legendBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const kec = btn.getAttribute('data-kec');
        if (State.selectedKecamatan === kec) {
          State.selectedKecamatan = 'ALL';
          State.selectedVillage = 'ALL';
          showToast('Menampilkan seluruh 78 titik Tapung Raya');
        } else {
          State.selectedKecamatan = kec;
          State.selectedVillage = 'ALL';
          const cfg = TAPUNG_RAYA_CONFIG[kec];
          showToast(`${cfg ? cfg.badge : '📍'} Fokus Wilayah: Kec. ${kec} (${cfg ? cfg.total : ''} titik)`);
        }
        updateActiveChips();
        setupVillageSubfilter();
        renderTargets();
        filterMapMarkers();
        highlightBoundaryPolygon(State.selectedKecamatan);

        if (State.selectedKecamatan !== 'ALL' && State.mapInstance && State.boundaryLayer) {
          State.boundaryLayer.eachLayer((layer) => {
            const name = layer.feature && layer.feature.properties ? layer.feature.properties.name : '';
            if (name === State.selectedKecamatan) {
              State.mapInstance.fitBounds(layer.getBounds(), { padding: [35, 35] });
            }
          });
        }
      });
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

    document.querySelectorAll('.legend-kec-btn').forEach((btn) => {
      const k = btn.getAttribute('data-kec');
      btn.classList.toggle('active', State.selectedKecamatan === k);
    });

    highlightBoundaryPolygon(State.selectedKecamatan);
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
      if (State.selectedPriority !== 'ALL' && p.priority !== State.selectedPriority) {
        return false;
      }
      if (State.selectedDay !== 'ALL' && p.hari_ke && p.hari_ke !== parseInt(State.selectedDay, 10)) {
        return false;
      }
      const isDone = !!State.visited[p.id_pod];
      if (State.selectedStatus === 'DONE' && !isDone) return false;
      if (State.selectedStatus === 'PENDING' && isDone) return false;

      if (State.searchQuery) {
        const text = `${p.nama_pod} ${p.id_pod} ${p.desa} ${p.kecamatan} ${p.priority || ''} ${p.info_mill || ''} ${p.label_urutan || ''}`.toLowerCase();
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
      const doneTotal = currentData.filter((p) => !!State.visited[p.id_pod]).length;
      counterText.innerHTML = `Menampilkan: <strong>${points.length}</strong> / ${currentData.length} titik • Selesai: <strong>${doneTotal}/${currentData.length}</strong>`;
    }
    updateCounterBadges();

    if (points.length === 0) {
      container.innerHTML = `
        <div style="background: #ffffff; border-radius: 12px; padding: 30px; text-align: center; color: #64748b;">
          <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
          <h4 style="color: #1e293b;">Tidak ada titik yang sesuai filter</h4>
          <p style="font-size: 13px; margin-top: 4px;">Coba ganti filter prioritas, kecamatan, atau hapus kata pencarian.</p>
        </div>
      `;
      return;
    }

    points.forEach((p) => {
      const isDone = !!State.visited[p.id_pod];
      const isPrimary = p.is_target_63 || p.is_tapung_prioritas;
      const note = State.notes[p.id_pod] || '';
      const card = document.createElement('div');
      card.className = `target-card ${isDone ? 'completed' : ''}`;
      card.id = `card-${p.id_pod}`;

      const kecCol = KEC_COLORS[p.kecamatan] || '#059669';
      card.style.borderLeft = `4.5px solid ${kecCol}`;

      let prioBadgeHtml = '';
      if (p.priority === 'GAR') {
        prioBadgeHtml = '<span class="badge-target-flag" style="background: #b45309; color: #ffffff;">🔥 GAR Prioritas</span>';
      } else if (p.priority === 'Priority 1') {
        prioBadgeHtml = '<span class="badge-target-flag" style="background: #047857; color: #ffffff;">⚡ Priority 1</span>';
      } else if (p.priority === 'Priority 2') {
        prioBadgeHtml = '<span class="badge-target-flag" style="background: #2563eb; color: #ffffff;">📌 Priority 2</span>';
      }

      const kecBadgeText = p.kecamatan === 'Tapung' ? '🟧 Tapung' : p.kecamatan === 'Tapung Hulu' ? '🟦 Tapung Hulu' : p.kecamatan === 'Tapung Hilir' ? '🟪 Tapung Hilir' : p.kecamatan;

      card.innerHTML = `
        <div class="card-top-row">
          <div class="card-meta-badges">
            ${p.label_urutan ? `<span class="badge-code" style="background: #0f172a; color: #ffffff;">${p.label_urutan}</span>` : ''}
            ${prioBadgeHtml}
            <span class="badge-kecamatan" style="background: ${kecCol}18; color: ${kecCol}; border: 1px solid ${kecCol}40; font-weight: 800;">${kecBadgeText}</span>
            <span class="badge-jenis">${p.jenis_pod}</span>
            ${p.is_tapung_prioritas ? `<span class="badge-target-flag" style="background: ${kecCol}; color: #ffffff;">⭐ Prioritas ${p.kecamatan}</span>` : isPrimary ? '<span class="badge-target-flag">🎯 Target Utama</span>' : `<span class="badge-prev-flag">🏛️ Survei Lalu (${p.year || '2023'})</span>`}
          </div>
          <div style="font-size: 11px; font-family: monospace; color: #64748b; font-weight: 700;">
            ${p.id_pod}
          </div>
        </div>

        <h3 class="card-title">${p.nama_pod}</h3>
        <div class="card-village">
          <span>📍</span>
          <span>${p.desa ? `Desa ${p.desa}, ` : ''}Kec. ${p.kecamatan}</span>
          ${p.cluster_sandy ? ` • <span style="color: #ea580c; font-weight: 700;">🧭 ${p.cluster_sandy}</span>` : ''}
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

      State.osmLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['0', '1', '2', '3']
      });

      State.satelliteLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['0', '1', '2', '3']
      });

      // Default: OSM
      State.osmLayer.addTo(State.mapInstance);

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

      // Add Boundary Polygons from Data-Prioritas/TapungPOD.kmz
      if (State.tapungBoundariesGeojson && !State.boundaryLayer) {
        State.boundaryLayer = L.geoJSON(State.tapungBoundariesGeojson, {
          style: function (f) {
            const name = f.properties.name || '';
            const cfg = TAPUNG_RAYA_CONFIG[name] || { color: '#059669' };
            const isSelected = State.selectedKecamatan === name;
            return {
              color: cfg.color,
              weight: isSelected ? 4 : 2.8,
              opacity: 0.95,
              fillColor: cfg.color,
              fillOpacity: isSelected ? 0.28 : 0.15,
              dashArray: isSelected ? '' : '6, 6'
            };
          },
          onEachFeature: function (f, layer) {
            const name = f.properties.name || '';
            const cfg = TAPUNG_RAYA_CONFIG[name] || { color: '#334155', total: 0, badge: '📍' };
            layer.bindTooltip(`
              <div style="font-family: inherit; font-size: 12px; line-height: 1.4; padding: 2px;">
                <div style="font-weight: 800; color: ${cfg.color}; font-size: 13px;">${cfg.badge} Batas Administrasi Kec. ${name}</div>
                <div style="color: #475569; font-size: 11.5px; margin-top: 2px;">
                  Wilayah Prioritas Minggu Ini • <strong>${cfg.total} Titik POD</strong>
                </div>
                <div style="font-size: 10.5px; color: #94a3b8; margin-top: 3px;">Klik poligon untuk fokus wilayah ini</div>
              </div>
            `, {
              sticky: true,
              className: 'custom-boundary-tooltip'
            });

            layer.on({
              mouseover: function (e) {
                const l = e.target;
                l.setStyle({
                  weight: 4.5,
                  fillOpacity: 0.32,
                  dashArray: ''
                });
                if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                  l.bringToFront();
                }
              },
              mouseout: function (e) {
                if (State.boundaryLayer) {
                  highlightBoundaryPolygon(State.selectedKecamatan);
                }
              },
              click: function () {
                if (State.selectedKecamatan === name) {
                  State.selectedKecamatan = 'ALL';
                  State.selectedVillage = 'ALL';
                  showToast('Menampilkan seluruh 78 titik Tapung Raya');
                } else {
                  State.selectedKecamatan = name;
                  State.selectedVillage = 'ALL';
                  showToast(`${cfg.badge} Fokus Wilayah: Kec. ${name} (${cfg.total} titik)`);
                }
                updateActiveChips();
                setupVillageSubfilter();
                renderTargets();
                filterMapMarkers();
                highlightBoundaryPolygon(State.selectedKecamatan);

                if (State.selectedKecamatan !== 'ALL' && State.mapInstance) {
                  State.mapInstance.fitBounds(layer.getBounds(), { padding: [35, 35] });
                }
              }
            });
          }
        });

        if (State.showBoundaries) {
          State.boundaryLayer.addTo(State.mapInstance);
        }
      }

      const btnLocate = document.getElementById('btn-map-locate-me');
      if (btnLocate) {
        btnLocate.addEventListener('click', () => {
          getUserLocationOnMap();
        });
      }

      const btnBoundary = document.getElementById('btn-map-boundary-toggle');
      if (btnBoundary) {
        btnBoundary.addEventListener('click', () => {
          if (!State.boundaryLayer) return;
          const bText = document.getElementById('boundary-toggle-text');
          if (State.showBoundaries) {
            State.mapInstance.removeLayer(State.boundaryLayer);
            State.showBoundaries = false;
            btnBoundary.classList.remove('active');
            if (bText) bText.textContent = 'Batas: OFF';
            showToast('Batas Wilayah disembunyikan');
          } else {
            State.boundaryLayer.addTo(State.mapInstance);
            State.showBoundaries = true;
            btnBoundary.classList.add('active');
            if (bText) bText.textContent = 'Batas Wilayah';
            showToast('Batas Wilayah Tapung Raya ditampilkan 🗺️');
          }
        });
      }

      const btnLayer = document.getElementById('btn-map-layer-toggle');
      if (btnLayer) {
        btnLayer.addEventListener('click', () => {
          const icon = document.getElementById('layer-toggle-icon');
          const text = document.getElementById('layer-toggle-text');
          if (State.currentLayer === 'osm') {
            State.mapInstance.removeLayer(State.osmLayer);
            State.satelliteLayer.addTo(State.mapInstance);
            State.currentLayer = 'satellite';
            if (icon) icon.textContent = '🗺️';
            if (text) text.textContent = 'Peta Jalan';
            btnLayer.classList.add('active');
            showToast('Citra Satelit Kebun Sawit aktif! 🛰️');
          } else {
            State.mapInstance.removeLayer(State.satelliteLayer);
            State.osmLayer.addTo(State.mapInstance);
            State.currentLayer = 'osm';
            if (icon) icon.textContent = '🛰️';
            if (text) text.textContent = 'Citra Satelit';
            btnLayer.classList.remove('active');
            showToast('Peta Jalan aktif! 🗺️');
          }
        });
      }

      const btnFit = document.getElementById('btn-map-fit-bounds');
      if (btnFit) {
        btnFit.addEventListener('click', () => {
          const filtered = getFilteredPoints();
          if (filtered.length > 0) {
            const bounds = filtered.map((p) => [p.lat, p.lng]);
            State.mapInstance.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
            showToast('Tampilan dipusatkan ke titik terpilih 🎯');
          }
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
      const isPrimary = p.is_target_63 || p.is_tapung_prioritas;
      const kecCol = KEC_COLORS[p.kecamatan] || '#059669';

      let pinHtml = '';
      if (isDone) {
        pinHtml = `<div style="background-color: ${kecCol}; color: #ffffff; width: 30px; height: 30px; border-radius: 50%; border: 3px solid #10b981; box-shadow: 0 0 0 2.5px rgba(16, 185, 129, 0.55), 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 13px;">
          ✓
        </div>`;
      } else {
        const label = p.urutan_hari ? p.urutan_hari : '•';
        pinHtml = `<div style="background-color: ${kecCol}; color: #ffffff; width: ${isPrimary ? '28px' : '22px'}; height: ${isPrimary ? '28px' : '22px'}; border-radius: 50%; border: 2.5px solid #ffffff; box-shadow: 0 3px 8px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px;">
          ${label}
        </div>`;
      }

      const markerIcon = L.divIcon({
        className: 'custom-map-pin',
        html: pinHtml,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const marker = L.marker([p.lat, p.lng], { icon: markerIcon }).addTo(State.mapInstance);

      let prioTagPopup = '';
      if (p.priority === 'GAR') {
        prioTagPopup = '<span style="background: #b45309; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">🔥 GAR Prioritas</span>';
      } else if (p.priority === 'Priority 1') {
        prioTagPopup = '<span style="background: #047857; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">⚡ Priority 1</span>';
      } else if (p.priority === 'Priority 2') {
        prioTagPopup = '<span style="background: #2563eb; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">📌 Priority 2</span>';
      }

      const kecBadgeInfo = p.kecamatan === 'Tapung' ? '🟧 41 Titik' : p.kecamatan === 'Tapung Hulu' ? '🟦 28 Titik' : p.kecamatan === 'Tapung Hilir' ? '🟪 9 Titik' : '';

      marker.bindPopup(`
        <div style="font-family: sans-serif; min-width: 235px; padding: 4px;">
          <div style="font-size: 11px; font-weight: 800; color: ${kecCol}; text-transform: uppercase; margin-bottom: 3px; display: flex; align-items: center; justify-content: space-between;">
            <span>${p.label_urutan ? `${p.label_urutan} • ` : ''}Kec. ${p.kecamatan}</span>
            ${kecBadgeInfo ? `<span style="font-size: 10px; background: ${kecCol}20; color: ${kecCol}; padding: 2px 6px; border-radius: 4px; font-weight: 800;">${kecBadgeInfo}</span>` : ''}
          </div>
          <div style="margin-bottom: 4px;">${prioTagPopup}</div>
          <h4 style="margin: 4px 0 2px; font-size: 15px; font-weight: 800; color: #0f172a;">
            ${p.nama_pod}
          </h4>
          <p style="margin: 0 0 6px; font-size: 12px; color: #475569;">
            ${p.desa ? `Desa ${p.desa}` : ''} (${p.jenis_pod})<br>
            ${p.is_tapung_prioritas ? `<strong style="color: ${kecCol};">⭐ Prioritas Tapung Raya (${p.kecamatan})</strong>` : isPrimary ? '<strong style="color: #059669;">🎯 Target Utama Survei</strong>' : `<span style="color: #64748b;">🏛️ Survei Lalu (${p.year || '2023'})</span>`}
            ${p.info_mill ? `<br><span style="color: #d97706; font-weight: bold;">🏭 Mill: ${p.info_mill}</span>` : ''}
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
        const btnToggle = document.getElementById(`btn-popup-toggle-${p.id_pod}`);
        if (btnToggle) {
          btnToggle.addEventListener('click', () => {
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
      const dsLabel = State.viewDataset === 'SANDY41'
        ? 'Prioritas Sandy: Kec. Tapung (41 Titik • 4 Hari)'
        : State.viewDataset === 'TAPUNG78'
        ? 'Prioritas Minggu Ini: Tapung Raya'
        : State.viewDataset === 'ALL181'
        ? 'Database 181 Kampar'
        : 'Target 63 Titik';
      infoPill.innerHTML = `<span>📍 Menampilkan <strong>${filtered.length}</strong> titik di peta (${dsLabel})</span>`;
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

    const kecTitleEl = document.getElementById('summary-kecamatan-title');
    if (kecTitleEl) {
      kecTitleEl.textContent = State.viewDataset === 'SANDY41'
        ? 'Rincian Prioritas Sandy: Kecamatan Tapung (12 Desa • 41 Titik)'
        : State.viewDataset === 'TAPUNG78'
        ? 'Rincian Titik Fokus Tapung Raya (3 Kecamatan • 24 Desa)'
        : 'Rincian Titik per Kecamatan (13 Kecamatan Target Awal)';
    }

    const schedTitleEl = document.getElementById('summary-schedule-title');
    if (schedTitleEl) {
      schedTitleEl.textContent = State.viewDataset === 'SANDY41'
        ? 'Jadwal Rute Operasional Khusus Sandy (4 Hari • Target 10 Titik/Hari)'
        : State.viewDataset === 'TAPUNG78'
        ? 'Jadwal Target & Rute Operasional Tapung Raya (78 Titik • Hari 1 - 7)'
        : 'Jadwal Rute Survei (Mulai 6 - 7 Oktober 2026)';
    }

    const currentKecList = getActiveKecamatanList();
    const currentData = getActiveDataset();

    currentKecList.forEach((k) => {
      const card = document.createElement('div');
      card.className = 'kecamatan-card-box';
      const kecCol = KEC_COLORS[k.nama_kecamatan] || '#059669';
      card.style.borderLeft = `5px solid ${kecCol}`;

      const cfg = TAPUNG_RAYA_CONFIG[k.nama_kecamatan];
      const emojiBadge = cfg ? cfg.badge + ' ' : '';

      const doneInKec = k.points.filter((p) => !!State.visited[p.id_pod]).length;
      const pct = k.total_titik > 0 ? Math.round((doneInKec / k.total_titik) * 100) : 0;

      const villageBadgesHtml = Object.entries(k.desa_list)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([vName, vCount]) =>
            `<span class="village-tag-badge" data-kec="${k.nama_kecamatan}" data-desa="${vName}" style="cursor: pointer;"><span>🏡 ${vName}</span> <strong>(${vCount})</strong></span>`
        )
        .join(' ');

      card.innerHTML = `
        <div class="kec-card-top">
          <span class="kec-card-name" style="color: ${kecCol};">${emojiBadge}${k.nama_kecamatan}</span>
          <span class="kec-card-count" style="background: ${kecCol}18; color: ${kecCol}; font-weight: 800;">${k.total_titik} Titik Target</span>
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
      const activeSched = getActiveSchedule();
      activeSched.forEach((s) => {
        const item = document.createElement('div');
        item.className = 'day-timeline-card';
        const dayPoints = currentData.filter((p) => p.hari_ke === s.hari);
        const dayDone = dayPoints.filter((p) => !!State.visited[p.id_pod]).length;

        item.innerHTML = `
          <div class="day-timeline-header">
            <span class="day-timeline-tag">HARI KE-${s.hari}</span>
            <span class="day-date-label">📅 ${s.tanggal}</span>
          </div>
          <h4 class="day-timeline-title">${s.judul}</h4>
          <p class="day-timeline-corridor">${s.koridor}</p>
          <div style="font-size: 11.5px; color: #64748b; margin-bottom: 6px;">
            <span>📍 Mulai: <strong>${s.titik_mulai || '-'}</strong> ➔ Selesai: <strong>${s.titik_akhir || '-'}</strong></span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; padding-top: 8px; border-top: 1px solid #f1f5f9;">
            <span>🎯 <strong>${s.jumlah_titik} Titik</strong> (~${s.estimasi_jarak_km} km)</span>
            <span style="font-weight: 700; color: ${dayDone === s.jumlah_titik ? '#059669' : '#d97706'};">
              ${dayDone}/${s.jumlah_titik} Selesai
            </span>
          </div>
        `;
        item.addEventListener('click', () => {
          State.selectedDay = s.hari.toString();
          document.querySelectorAll('.chip-day-filter').forEach((c) => {
            c.classList.toggle('active', c.textContent.includes(`Hari ${s.hari}`));
          });
          switchTab('targets');
          showToast(`Filter: Hari ke-${s.hari} (${s.jumlah_titik} titik)`);
        });
        scheduleContainer.appendChild(item);
      });
    }
  }

  function updateCounterBadges() {
    const currentData = getActiveDataset();
    const done = currentData.filter((p) => !!State.visited[p.id_pod]).length;
    const total = currentData.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const badge = document.getElementById('global-progress-badge');
    if (badge) {
      badge.textContent = `${done}/${total}`;
    }

    const pctVal = document.getElementById('progress-percentage-val');
    if (pctVal) {
      pctVal.textContent = `${pct}% (${done}/${total} Selesai)`;
    }

    const progressBar = document.getElementById('progress-meter-bar');
    if (progressBar) {
      progressBar.style.width = `${pct}%`;
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

  const RAW_ATTR_KEYS = [
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

  function findPointById(id_pod) {
    if (!id_pod) return null;
    let p = State.masterList.find((item) => item.id_pod === id_pod);
    if (!p) {
      p = State.kamparAll181.find((item) => item.id_pod === id_pod);
    }
    return p;
  }

  function openDetailModal(id_pod) {
    const p = findPointById(id_pod);
    if (!p) {
      showToast('Data titik tidak ditemukan');
      return;
    }

    const modal = document.getElementById('pod-detail-modal');
    if (!modal) return;

    const isDone = !!State.visited[p.id_pod];

    // Set Header
    const nameEl = document.getElementById('modal-detail-name');
    const subEl = document.getElementById('modal-detail-sub');
    const tableNameEl = document.getElementById('kmz-table-header-name');
    const tbodyEl = document.getElementById('kmz-table-tbody');

    if (nameEl) nameEl.textContent = p.nama_pod;
    if (tableNameEl) tableNameEl.textContent = p.nama_pod;
    if (subEl) {
      subEl.innerHTML = `${p.label_urutan ? `<strong>${p.label_urutan}</strong> • ` : ''}Kec. ${p.kecamatan}${p.desa ? `, Desa ${p.desa}` : ''} • ID: ${p.id_pod}`;
    }

    // Build raw attributes dictionary
    const raw = p.raw_fields || {};
    const latStr = p.lat ? (p.lat.toFixed ? p.lat.toFixed(5) : String(p.lat)) : '';
    const lngStr = p.lng ? (p.lng.toFixed ? p.lng.toFixed(5) : String(p.lng)) : '';

    const attrData = {
      FID: raw.FID !== undefined ? raw.FID : (p.fid !== undefined ? p.fid : ''),
      ID_POD: raw.ID_POD || p.id_pod || '',
      Name_POD: raw.Name_POD || p.nama_pod || '',
      Capacity_E: raw.Capacity_E || p.capacity_e || '',
      Capacity_D: raw.Capacity_D || p.capacity_d || '',
      Lat_POD: raw.Lat_POD || latStr,
      Long_POD: raw.Long_POD || lngStr,
      Country_PO: raw.Country_PO || 'Indonesia',
      Province_P: raw.Province_P || p.provinsi || 'Riau',
      District_P: raw.District_P || p.kabupaten || 'Kampar',
      SubDistric: raw.SubDistric || p.kecamatan || '',
      Village_PO: raw.Village_PO || p.desa || '',
      Source_POD: raw.Source_POD || p.source || 'POD Survey',
      Year_POD: raw.Year_POD || p.year || '2026',
      Type_POD: raw.Type_POD || p.jenis_pod || 'Ramp',
      Active: raw.Active || p.active || 'Dilakukan Survey',
      Weightbrid: raw.Weightbrid || p.weightbrid || '',
      Info_Mill: raw.Info_Mill || p.info_mill || '',
      Phone_Numb: raw.Phone_Numb || p.phone || '',
      Contact_In: raw.Contact_In || p.contact || '',
      Priority: raw.Priority || p.priority || 'Priority 1',
      Survey: raw.Survey || p.survey_status || (isDone ? 'Sudah Dikunjungi' : 'Belum Di Survey')
    };

    if (tbodyEl) {
      tbodyEl.innerHTML = '';
      RAW_ATTR_KEYS.forEach((key, idx) => {
        const val = attrData[key] !== undefined ? attrData[key] : '';
        const tr = document.createElement('tr');
        // Alternating row background matching Image 1 (odd index: 1, 3, 5... highlighted)
        if (idx % 2 === 1) {
          tr.className = 'highlight-row';
        }

        const tdKey = document.createElement('td');
        tdKey.className = 'attr-key';
        tdKey.textContent = key;

        const tdVal = document.createElement('td');
        tdVal.className = `attr-val ${!val ? 'empty-val' : ''}`;
        tdVal.textContent = val || '';

        tr.appendChild(tdKey);
        tr.appendChild(tdVal);
        tbodyEl.appendChild(tr);
      });
    }

    // Set Footer Buttons
    const btnGmaps = document.getElementById('btn-detail-gmaps');
    const btnWaze = document.getElementById('btn-detail-waze');
    const btnCopy = document.getElementById('btn-detail-copy');
    const btnToggle = document.getElementById('btn-detail-toggle-done');
    const btnToggleIcon = document.getElementById('btn-detail-toggle-icon');
    const btnToggleText = document.getElementById('btn-detail-toggle-text');

    if (btnGmaps) {
      btnGmaps.href = p.google_nav_url || `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
    }
    if (btnWaze) {
      btnWaze.href = p.waze_url || `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;
    }

    function updateModalDoneBtn() {
      const currentDone = !!State.visited[p.id_pod];
      if (btnToggle) {
        btnToggle.classList.toggle('is-done', currentDone);
      }
      if (btnToggleIcon) {
        btnToggleIcon.textContent = currentDone ? '✅' : '🟡';
      }
      if (btnToggleText) {
        btnToggleText.textContent = currentDone ? 'Selesai Dikunjungi' : 'Tandai Selesai';
      }
    }
    updateModalDoneBtn();

    if (btnToggle) {
      btnToggle.onclick = () => {
        if (State.visited[p.id_pod]) {
          delete State.visited[p.id_pod];
        } else {
          State.visited[p.id_pod] = new Date().toISOString();
        }
        saveLocalData();
        renderTargets();
        renderMapMarkers();
        updateCounterBadges();
        updateModalDoneBtn();
        showToast('Status survei diperbarui!');
      };
    }

    if (btnCopy) {
      btnCopy.onclick = () => {
        let text = `📋 INFORMASI TITIK POD: ${p.nama_pod}\n`;
        text += `------------------------------------\n`;
        RAW_ATTR_KEYS.forEach((k) => {
          text += `${k}: ${attrData[k] || '-'}\n`;
        });
        text += `Google Maps: ${p.google_maps_url || ''}\n`;
        navigator.clipboard.writeText(text).then(() => {
          showToast('Seluruh data atribut disalin!');
        });
      };
    }

    modal.classList.add('active');
  }

  function setupDetailModal() {
    const modal = document.getElementById('pod-detail-modal');
    const btnClose = document.getElementById('btn-close-detail-modal');
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
        'Prioritas': p.priority || '-',
        'Info Mill / PKS': p.info_mill || '-',
        Kecamatan: p.kecamatan,
        Desa: p.desa,
        Kabupaten: p.kabupaten,
        'Kategori': p.is_tapung_prioritas ? 'Prioritas Tapung Raya' : p.is_target_63 ? 'Target Awal 63' : 'Database Lapangan',
        'Tahun Data': p.year || '2026',
        'Sumber Data': p.source || 'POD Survey',
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
    const sheetName = State.viewDataset === 'SANDY41'
      ? 'Prioritas_Sandy_Tapung_41'
      : State.viewDataset === 'TAPUNG78'
      ? 'Prioritas_Tapung_78'
      : 'Target_POD_Kampar';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const filename = State.viewDataset === 'SANDY41'
      ? `Prioritas_Sandy_Tapung_${new Date().toISOString().slice(0, 10)}.xlsx`
      : State.viewDataset === 'TAPUNG78'
      ? `Prioritas_78_Tapung_Raya_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `Survei_POD_Kampar_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast('File Excel berhasil diunduh! 📊');
  }

  function copyWhatsAppReport() {
    const currentData = getActiveDataset();
    const total = currentData.length;
    const done = currentData.filter((p) => !!State.visited[p.id_pod]).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const currentKec = getActiveKecamatanList();
    const currentSched = getActiveSchedule();

    let txt = `📋 *LAPORAN PROGRESS SURVEI POD KAMPAR*\n`;
    if (State.viewDataset === 'SANDY41') {
      txt += `⭐ *FOKUS OPERASIONAL SANDY: KEC. TAPUNG (41 TITIK - TARGET 10/HARI)*\n`;
    } else if (State.viewDataset === 'TAPUNG78') {
      txt += `⭐ *FOKUS: PRIORITAS TAPUNG RAYA (78 TITIK)*\n`;
    }
    txt += `📅 Update: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}\n`;
    txt += `------------------------------------\n`;
    txt += `🎯 *Total Target Selesai*: ${done} / ${total} Titik (${pct}%)\n`;
    txt += `⏳ *Sisa Belum Selesai*: ${total - done} Titik\n\n`;

    txt += `📍 *Progress per Kecamatan*:\n`;
    currentKec.forEach((k) => {
      const kDone = k.points.filter((p) => !!State.visited[p.id_pod]).length;
      txt += `• *Kec. ${k.nama_kecamatan}*: ${kDone}/${k.total_titik} titik (${k.total_titik > 0 ? Math.round(kDone / k.total_titik * 100) : 0}%)\n`;
    });

    if (currentSched && currentSched.length > 0) {
      txt += `\n🗓️ *Progress Jadwal Harian*:\n`;
      currentSched.forEach((s) => {
        const dPoints = currentData.filter((p) => p.hari_ke === s.hari);
        const dDone = dPoints.filter((p) => !!State.visited[p.id_pod]).length;
        txt += `• *Hari ${s.hari}* (${s.tanggal.split(',')[0]}): ${dDone}/${s.jumlah_titik} titik\n`;
      });
    }

    const garDone = currentData.filter((p) => p.priority === 'GAR' && !!State.visited[p.id_pod]).length;
    const garTotal = currentData.filter((p) => p.priority === 'GAR').length;
    if (garTotal > 0) {
      txt += `\n🔥 *Prioritas GAR*: ${garDone}/${garTotal} selesai\n`;
    }

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
