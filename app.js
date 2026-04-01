/* ── TraceKit app.js ── */
const App = (() => {

  /* ── State ── */
  let photos = [];
  let tripActive = false;
  let tripSeconds = 0;
  let timerInterval = null;
  let notifTimeout = null;
  let pendingQueue = [];
  let pendingFile = null;
  let activeIndex = -1;

  /* ── Map ── */
  let map = null;
  let routeLine = null;
  let markers = [];

  /* ── Init ── */
  function init() {
    map = L.map('map', { zoomControl: true }).setView([37.5665, 126.9780], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Drag & drop on upload zone
    const zone = document.getElementById('uploadZone');
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('active'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('active'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('active');
      if (App.handleFiles) App.handleFiles(e.dataTransfer.files);
    });

    // Load saved data
    loadFromStorage();
    renderTimeline();
    renderMapPins();
    updateMapBadge();
  }

  /* ── Trip controls ── */
  function startTrip() {
    tripActive = true;
    tripSeconds = 0;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    updateHeaderForActiveTrip();
    showNotif('🗺️', 'Trip started!', 'You\'ll get a reminder every hour to log a photo.');

    timerInterval = setInterval(() => {
      tripSeconds++;
      const h = Math.floor(tripSeconds / 3600);
      const m = Math.floor((tripSeconds % 3600) / 60);
      const s = tripSeconds % 60;
      const el = document.getElementById('timerDisp');
      if (el) el.textContent =
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

      // Hourly reminder
      if (tripSeconds > 0 && tripSeconds % 3600 === 0) {
        showNotif('⏰', 'Time to log!', 'Upload a photo to record this moment.');
        if (Notification.permission === 'granted') {
          new Notification('⏰ TraceKit reminder', {
            body: 'Time to log a photo on your journey!',
            icon: 'https://raw.githubusercontent.com/hyemi230145-hub/TraceKit/main/icon.png'
          });
        }
      }
    }, 1000);
  }

  function endTrip() {
    tripActive = false;
    clearInterval(timerInterval);
    document.getElementById('headerRight').innerHTML =
      `<button class="btn-primary" onclick="App.startTrip()">Start Trip</button>`;
    showNotif('✈️', 'Trip ended!', `${photos.length} photo${photos.length !== 1 ? 's' : ''} recorded.`);
  }

  function updateHeaderForActiveTrip() {
    document.getElementById('headerRight').innerHTML = `
      <span class="status-badge"><span class="status-dot"></span>On a trip</span>
      <span class="timer" id="timerDisp">00:00:00</span>
      <button class="btn-end" onclick="App.endTrip()">End Trip</button>
    `;
  }

  /* ── File handling ── */
  function handleFiles(files) {
    if (!tripActive) {
      showNotif('ℹ️', 'Start a trip first', 'Press "Start Trip" to begin recording.');
      return;
    }
    pendingQueue = Array.from(files);
    processNext();
  }

  function processNext() {
    if (pendingQueue.length === 0) return;
    pendingFile = pendingQueue.shift();

    const reader = new FileReader();
    reader.onload = async (e) => {
      document.getElementById('modalPreview').src = e.target.result;

      // Parse EXIF
      let lat = null, lng = null, dateTime = null;
      try {
        const exif = await exifr.parse(pendingFile, ['DateTimeOriginal', 'GPSLatitude', 'GPSLongitude', 'latitude', 'longitude']);
        if (exif) {
          lat = exif.latitude ?? exif.GPSLatitude ?? null;
          lng = exif.longitude ?? exif.GPSLongitude ?? null;
          dateTime = exif.DateTimeOriginal ?? null;
        }
      } catch (_) {}

      // Set time field
      const now = dateTime ? new Date(dateTime) : new Date();
      const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      document.getElementById('modalTime').value = local;

      // Set coords if found
      if (lat && lng) {
        document.getElementById('modalLat').value = lat.toFixed(6);
        document.getElementById('modalLng').value = lng.toFixed(6);
        document.getElementById('locationHint').textContent = '📍 GPS found in photo.';
      } else {
        document.getElementById('modalLat').value = '';
        document.getElementById('modalLng').value = '';
        document.getElementById('locationHint').textContent = '📍 No GPS in photo — please enter location manually.';
      }

      document.getElementById('modalLocation').value = '';
      document.getElementById('modalMemo').value = '';
      document.getElementById('overlay').classList.add('open');
    };
    reader.readAsDataURL(pendingFile);
    document.getElementById('fileInput').value = '';
  }

  function closeModal() {
    document.getElementById('overlay').classList.remove('open');
    pendingFile = null;
    pendingQueue = [];
  }

  function savePhoto() {
    const src = document.getElementById('modalPreview').src;
    const time = document.getElementById('modalTime').value;
    const location = document.getElementById('modalLocation').value.trim() || 'Unknown location';
    const lat = parseFloat(document.getElementById('modalLat').value);
    const lng = parseFloat(document.getElementById('modalLng').value);
    const memo = document.getElementById('modalMemo').value.trim();

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      document.getElementById('locationHint').textContent = '⚠️ Please enter valid coordinates.';
      return;
    }

    const photo = { id: Date.now(), src, time, location, lat, lng, memo };
    photos.push(photo);
    photos.sort((a, b) => a.time.localeCompare(b.time));

    saveToStorage();
    document.getElementById('overlay').classList.remove('open');
    renderTimeline();
    renderMapPins();
    updateMapBadge();
    showNotif('📍', 'Photo saved!', location);

    // Center map on new pin
    map.setView([lat, lng], Math.max(map.getZoom(), 14));

    if (pendingQueue.length > 0) setTimeout(processNext, 300);
  }

  /* ── Render timeline ── */
  function renderTimeline() {
    const el = document.getElementById('timeline');
    document.getElementById('photoCount').textContent =
      `${photos.length} photo${photos.length !== 1 ? 's' : ''}`;

    if (photos.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>Start your trip and upload photos — your route will appear here.</p></div>';
      return;
    }

    el.innerHTML = photos.map((p, i) => `
      <div class="tl-item${activeIndex === i ? ' active' : ''}" onclick="App.selectPhoto(${i})">
        <div class="tl-connector">
          <div class="tl-dot"></div>
          <div class="tl-line"></div>
        </div>
        <img class="tl-thumb" src="${p.src}" alt="${p.location}" />
        <div class="tl-info">
          <div class="tl-location">${i + 1}. ${p.location}</div>
          <div class="tl-time">${formatTime(p.time)}</div>
          ${p.memo ? `<div class="tl-memo">${p.memo}</div>` : ''}
        </div>
      </div>
    `).join('');
  }

  /* ── Render map ── */
  function renderMapPins() {
    // Clear existing markers and route
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }

    if (photos.length === 0) return;

    // Draw route polyline
    const latlngs = photos.map(p => [p.lat, p.lng]);
    routeLine = L.polyline(latlngs, {
      color: '#C8602A',
      weight: 3,
      opacity: 0.75,
      dashArray: '8, 6',
    }).addTo(map);

    // Draw pins
    photos.forEach((p, i) => {
      const iconHtml = `
        <div class="map-pin-wrap">
          <div style="position:relative;display:inline-block">
            <div class="map-pin-bubble"><img src="${p.src}" alt="${p.location}" /></div>
            <div class="map-pin-num">${i + 1}</div>
          </div>
          <div class="map-pin-tail"></div>
        </div>`;

      const icon = L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [52, 64],
        iconAnchor: [26, 64],
        popupAnchor: [0, -66],
      });

      const popupHtml = `
        <img class="popup-img" src="${p.src}" alt="${p.location}" />
        <div class="popup-inner">
          <div class="popup-loc">${i + 1}. ${p.location}</div>
          <div class="popup-time">${formatTime(p.time)}</div>
          ${p.memo ? `<div class="popup-memo">${p.memo}</div>` : ''}
        </div>`;

      const marker = L.marker([p.lat, p.lng], { icon })
        .addTo(map)
        .bindPopup(popupHtml, { maxWidth: 220 });

      marker.on('click', () => selectPhoto(i));
      markers.push(marker);
    });

    // Fit map to show all pins
    if (photos.length === 1) {
      map.setView([photos[0].lat, photos[0].lng], 15);
    } else {
      map.fitBounds(routeLine.getBounds(), { padding: [60, 60] });
    }
  }

  function selectPhoto(i) {
    activeIndex = i;
    renderTimeline();
    markers[i]?.openPopup();
    map.panTo([photos[i].lat, photos[i].lng]);

    // Scroll timeline item into view
    setTimeout(() => {
      const items = document.querySelectorAll('.tl-item');
      if (items[i]) items[i].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }

  function updateMapBadge() {
    const el = document.getElementById('mapBadge');
    if (photos.length === 0) { el.textContent = 'No photos yet'; return; }
    el.textContent = `📍 ${photos.length} location${photos.length !== 1 ? 's' : ''} · Route connected`;
  }

  /* ── Notification ── */
  function showNotif(icon, title, body) {
    if (notifTimeout) clearTimeout(notifTimeout);
    document.getElementById('notifIcon').textContent = icon;
    document.getElementById('notifTitle').textContent = title;
    document.getElementById('notifBody').textContent = body;
    const el = document.getElementById('notif');
    el.classList.add('show');
    notifTimeout = setTimeout(() => el.classList.remove('show'), 4500);
  }

  /* ── Storage ── */
  function saveToStorage() {
    try { localStorage.setItem('tracekit_photos', JSON.stringify(photos)); } catch (_) {}
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem('tracekit_photos');
      if (raw) photos = JSON.parse(raw);
    } catch (_) { photos = []; }
  }

  /* ── Helpers ── */
  function formatTime(t) {
    if (!t) return '—';
    return new Date(t).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  /* ── Auto-init ── */
  document.addEventListener('DOMContentLoaded', init);

  /* ── Public API ── */
  return { startTrip, endTrip, handleFiles, closeModal, savePhoto, selectPhoto };

})();
