/* ── TraceKit app.js v3 ── */
const App = (() => {

  let photos = [];
  let tripActive = false;
  let tripSeconds = 0;
  let tripStartTime = null;
  let tripEndTime = null;
  let timerInterval = null;
  let notifTimeout = null;
  let pendingQueue = [];
  let pendingFile = null;
  let activeIndex = -1;
  let currentTab = 'map';

  let map = null;
  let summaryMap = null;
  let routeLine = null;
  let markers = [];

  /* ── Init ── */
  function init() {
    map = L.map('map', { zoomControl: true }).setView([37.5665, 126.9780], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const zone = document.getElementById('uploadZone');
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('active'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('active'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('active'); handleFiles(e.dataTransfer.files); });

    loadFromStorage();
    renderTimeline(); renderMapPins(); renderGallery(); updateMapBadge();
  }

  /* ── Tabs ── */
  function switchTab(tab) {
    currentTab = tab;
    const views = { map: 'viewMap', gallery: 'viewGallery', summary: 'viewSummary', print: 'viewPrint' };
    const tabs  = { map: 'tabMap',  gallery: 'tabGallery',  summary: 'tabSummary',  print: 'tabPrint' };
    Object.keys(views).forEach(t => {
      document.getElementById(views[t]).classList.toggle('hidden', t !== tab);
      document.getElementById(tabs[t]).classList.toggle('active', t === tab);
    });
    if (tab === 'map')     setTimeout(() => map.invalidateSize(), 50);
    if (tab === 'summary') renderSummary();
    if (tab === 'print')   renderPrintPanel();
  }

  /* ── Trip ── */
  function startTrip() {
    tripActive = true;
    tripSeconds = 0;
    tripStartTime = new Date();
    tripEndTime = null;
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    updateHeaderForActiveTrip();
    showNotif('🗺️', 'Trip started!', 'You\'ll get a reminder every hour to log a photo.');
    timerInterval = setInterval(() => {
      tripSeconds++;
      const h = Math.floor(tripSeconds / 3600), m = Math.floor((tripSeconds % 3600) / 60), s = tripSeconds % 60;
      const el = document.getElementById('timerDisp');
      if (el) el.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
      if (tripSeconds > 0 && tripSeconds % 3600 === 0) {
        showNotif('⏰', 'Time to log!', 'Upload a photo to record this moment.');
        if (Notification.permission === 'granted') new Notification('⏰ TraceKit reminder', { body: 'Time to log a photo!' });
      }
    }, 1000);
  }

  function endTrip() {
    tripActive = false;
    tripEndTime = new Date();
    clearInterval(timerInterval);
    document.getElementById('headerRight').innerHTML = `<button class="btn-primary" onclick="App.startTrip()">Start Trip</button>`;
    saveToStorage();
    showNotif('✈️', 'Trip ended!', `${photos.length} photo${photos.length !== 1 ? 's' : ''} recorded.`);
    switchTab('summary');
  }

  function updateHeaderForActiveTrip() {
    document.getElementById('headerRight').innerHTML = `
      <span class="status-badge"><span class="status-dot"></span>On a trip</span>
      <span class="timer" id="timerDisp">00:00:00</span>
      <button class="btn-end" onclick="App.endTrip()">End Trip</button>`;
  }

  /* ── Address search ── */
  async function searchAddress() {
    const query = document.getElementById('modalAddress').value.trim();
    if (!query) return;
    document.getElementById('locationHint').textContent = 'Searching…';
    document.getElementById('addrSuggestions').innerHTML = '';
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=4`, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      if (!data.length) { document.getElementById('locationHint').textContent = '⚠️ No results. Try a different address.'; return; }
      document.getElementById('locationHint').textContent = '';
      const box = document.getElementById('addrSuggestions');
      box.innerHTML = data.map((r, i) => `<div class="addr-suggestion" onclick="App.pickSuggestion(${i})">${r.display_name}</div>`).join('');
      box._results = data;
    } catch { document.getElementById('locationHint').textContent = '⚠️ Search failed. Check your connection.'; }
  }

  function pickSuggestion(i) {
    const data = document.getElementById('addrSuggestions')._results;
    if (!data) return;
    const r = data[i];
    document.getElementById('modalLat').value = parseFloat(r.lat).toFixed(6);
    document.getElementById('modalLng').value = parseFloat(r.lon).toFixed(6);
    if (!document.getElementById('modalLocation').value) document.getElementById('modalLocation').value = r.display_name.split(',')[0].trim();
    document.getElementById('locationHint').textContent = '📍 Location set!';
    document.getElementById('addrSuggestions').innerHTML = '';
  }

  /* ── File handling ── */
  function handleFiles(files) {
    if (!tripActive) { showNotif('ℹ️', 'Start a trip first', 'Press "Start Trip" to begin.'); return; }
    pendingQueue = Array.from(files);
    processNext();
  }

  function processNext() {
    if (!pendingQueue.length) return;
    pendingFile = pendingQueue.shift();
    const reader = new FileReader();
    reader.onload = async (e) => {
      document.getElementById('modalPreview').src = e.target.result;
      let lat = null, lng = null, dateTime = null;
      try {
        const exif = await exifr.parse(pendingFile, ['DateTimeOriginal','latitude','longitude']);
        if (exif) { lat = exif.latitude ?? null; lng = exif.longitude ?? null; dateTime = exif.DateTimeOriginal ?? null; }
      } catch (_) {}
      const now = dateTime ? new Date(dateTime) : new Date();
      document.getElementById('modalTime').value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,16);
      document.getElementById('modalAddress').value = '';
      document.getElementById('modalLocation').value = '';
      document.getElementById('modalMemo').value = '';
      document.getElementById('addrSuggestions').innerHTML = '';
      if (lat && lng) {
        document.getElementById('modalLat').value = lat.toFixed(6);
        document.getElementById('modalLng').value = lng.toFixed(6);
        document.getElementById('locationHint').textContent = '📍 GPS found — you can also search an address to override.';
      } else {
        document.getElementById('modalLat').value = '';
        document.getElementById('modalLng').value = '';
        document.getElementById('locationHint').textContent = '📍 No GPS found — search an address above.';
      }
      document.getElementById('overlay').classList.add('open');
    };
    reader.readAsDataURL(pendingFile);
    document.getElementById('fileInput').value = '';
  }

  function closeModal() { document.getElementById('overlay').classList.remove('open'); pendingFile = null; pendingQueue = []; }

  function savePhoto() {
    const src = document.getElementById('modalPreview').src;
    const time = document.getElementById('modalTime').value;
    const location = document.getElementById('modalLocation').value.trim() || document.getElementById('modalAddress').value.trim() || 'Unknown location';
    const lat = parseFloat(document.getElementById('modalLat').value);
    const lng = parseFloat(document.getElementById('modalLng').value);
    const memo = document.getElementById('modalMemo').value.trim();
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) { document.getElementById('locationHint').textContent = '⚠️ Please search an address or enter coordinates.'; return; }
    photos.push({ id: Date.now(), src, time, location, lat, lng, memo });
    photos.sort((a, b) => a.time.localeCompare(b.time));
    saveToStorage();
    document.getElementById('overlay').classList.remove('open');
    renderTimeline(); renderMapPins(); renderGallery(); updateMapBadge();
    showNotif('📍', 'Photo saved!', location);
    map.setView([lat, lng], Math.max(map.getZoom(), 14));
    if (pendingQueue.length) setTimeout(processNext, 300);
  }

  /* ── Timeline ── */
  function renderTimeline() {
    const el = document.getElementById('timeline');
    document.getElementById('photoCount').textContent = `${photos.length} photo${photos.length !== 1 ? 's' : ''}`;
    if (!photos.length) { el.innerHTML = '<div class="empty-state">Start your trip and upload photos — your route will appear here.</div>'; return; }
    el.innerHTML = photos.map((p, i) => `
      <div class="tl-item${activeIndex === i ? ' active' : ''}" onclick="App.selectPhoto(${i})">
        <div class="tl-connector"><div class="tl-dot"></div><div class="tl-line"></div></div>
        <img class="tl-thumb" src="${p.src}" alt="${p.location}" />
        <div class="tl-info">
          <div class="tl-location">${i+1}. ${p.location}</div>
          <div class="tl-time">${formatTime(p.time)}</div>
          ${p.memo ? `<div class="tl-memo">${p.memo}</div>` : ''}
        </div>
      </div>`).join('');
  }

  /* ── Map ── */
  function renderMapPins() {
    markers.forEach(m => map.removeLayer(m)); markers = [];
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (!photos.length) return;
    routeLine = L.polyline(photos.map(p => [p.lat, p.lng]), { color: '#C8602A', weight: 3, opacity: .75, dashArray: '8,6' }).addTo(map);
    photos.forEach((p, i) => {
      const icon = L.divIcon({ html: `<div class="map-pin-wrap"><div style="position:relative;display:inline-block"><div class="map-pin-bubble"><img src="${p.src}" alt=""/></div><div class="map-pin-num">${i+1}</div></div><div class="map-pin-tail"></div></div>`, className: '', iconSize: [52,64], iconAnchor: [26,64], popupAnchor: [0,-66] });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(map)
        .bindPopup(`<img class="popup-img" src="${p.src}"/><div class="popup-inner"><div class="popup-loc">${i+1}. ${p.location}</div><div class="popup-time">${formatTime(p.time)}</div>${p.memo ? `<div class="popup-memo">${p.memo}</div>` : ''}</div>`, { maxWidth: 220 });
      marker.on('click', () => selectPhoto(i));
      markers.push(marker);
    });
    photos.length === 1 ? map.setView([photos[0].lat, photos[0].lng], 15) : map.fitBounds(routeLine.getBounds(), { padding: [60,60] });
  }

  function selectPhoto(i) {
    activeIndex = i; renderTimeline(); markers[i]?.openPopup(); map.panTo([photos[i].lat, photos[i].lng]);
    setTimeout(() => { const items = document.querySelectorAll('.tl-item'); if (items[i]) items[i].scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100);
  }

  function updateMapBadge() {
    document.getElementById('mapBadge').textContent = photos.length ? `📍 ${photos.length} location${photos.length !== 1 ? 's' : ''} · Route connected` : 'No photos yet';
  }

  /* ── Gallery ── */
  function renderGallery() {
    const empty = document.getElementById('galleryEmpty'), grid = document.getElementById('galleryGrid');
    if (!photos.length) { empty.style.display = 'block'; grid.innerHTML = ''; return; }
    empty.style.display = 'none';
    grid.innerHTML = photos.map((p, i) => `
      <div class="gallery-item" onclick="App.openLightbox(${i})">
        <img src="${p.src}" alt="${p.location}" loading="lazy" />
        <div class="gallery-item-info">
          <div class="gallery-item-loc">${p.location}</div>
          <div class="gallery-item-time">${formatTime(p.time)}</div>
        </div>
      </div>`).join('');
  }

  function openLightbox(i) {
    const p = photos[i];
    document.getElementById('lightboxImg').src = p.src;
    document.getElementById('lightboxInfo').textContent = `${p.location} · ${formatTime(p.time)}${p.memo ? ' · ' + p.memo : ''}`;
    document.getElementById('lightbox').classList.add('open');
  }
  function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }

  /* ── Summary ── */
  function renderSummary() {
    const empty = document.getElementById('summaryEmpty'), card = document.getElementById('summaryCard');
    if (!tripEndTime || !photos.length) { empty.classList.remove('hidden'); card.classList.add('hidden'); return; }
    empty.classList.add('hidden'); card.classList.remove('hidden');
    const ms = tripEndTime - tripStartTime;
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    document.getElementById('statDuration').textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
    document.getElementById('statDistance').textContent = calcDistance() + ' km';
    document.getElementById('statPhotos').textContent = photos.length;
    document.getElementById('statPlaces').textContent = photos.length;
    document.getElementById('summaryDate').textContent = tripStartTime.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    if (!summaryMap) {
      summaryMap = L.map('summaryMap', { zoomControl: false, dragging: false, scrollWheelZoom: false }).setView([photos[0].lat, photos[0].lng], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(summaryMap);
    } else { summaryMap.eachLayer(l => { if (!(l instanceof L.TileLayer)) summaryMap.removeLayer(l); }); }
    const line = L.polyline(photos.map(p => [p.lat, p.lng]), { color: '#C8602A', weight: 4, opacity: .85 }).addTo(summaryMap);
    photos.forEach((p, i) => L.circleMarker([p.lat, p.lng], { radius: 7, fillColor: '#C8602A', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(summaryMap).bindTooltip(`${i+1}. ${p.location}`));
    setTimeout(() => { summaryMap.invalidateSize(); summaryMap.fitBounds(line.getBounds(), { padding: [30,30] }); }, 100);
    document.getElementById('summaryTimeline').innerHTML = photos.map((p, i) => `
      <div class="sum-item">
        <div class="sum-num">${i+1}</div>
        <img class="sum-thumb" src="${p.src}" alt="${p.location}" />
        <div class="sum-info"><div class="sum-loc">${p.location}</div><div class="sum-time">${formatTime(p.time)}${p.memo ? ' · ' + p.memo : ''}</div></div>
      </div>`).join('');
  }

  /* ── Print panel ── */
  function renderPrintPanel() {
    const grid = document.getElementById('printSelectGrid');
    if (!photos.length) { grid.innerHTML = '<div class="print-empty">No photos yet — upload photos first.</div>'; document.getElementById('printSelCount').textContent = '0 / 12 selected'; return; }
    Printer.open(photos);
    // Don't show the modal — just populate the panel
    document.getElementById('printOverlay') && document.getElementById('printOverlay').classList.remove('open');
  }

  /* ── Helpers ── */
  function calcDistance() {
    if (photos.length < 2) return '0.0';
    let total = 0;
    for (let i = 1; i < photos.length; i++) total += haversine(photos[i-1], photos[i]);
    return total.toFixed(1);
  }
  function haversine(a, b) {
    const R = 6371, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const x = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  }
  function rad(d) { return d * Math.PI / 180; }
  function pad(n) { return String(n).padStart(2,'0'); }
  function formatTime(t) {
    if (!t) return '—';
    return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function showNotif(icon, title, body) {
    if (notifTimeout) clearTimeout(notifTimeout);
    document.getElementById('notifIcon').textContent = icon;
    document.getElementById('notifTitle').textContent = title;
    document.getElementById('notifBody').textContent = body;
    const el = document.getElementById('notif');
    el.classList.add('show');
    notifTimeout = setTimeout(() => el.classList.remove('show'), 4500);
  }
  function saveToStorage() {
    try {
      localStorage.setItem('tracekit_photos', JSON.stringify(photos));
      if (tripStartTime) localStorage.setItem('tracekit_start', tripStartTime.toISOString());
      if (tripEndTime) localStorage.setItem('tracekit_end', tripEndTime.toISOString());
    } catch (_) {}
  }
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem('tracekit_photos');
      if (raw) photos = JSON.parse(raw);
      const s = localStorage.getItem('tracekit_start'), e = localStorage.getItem('tracekit_end');
      if (s) tripStartTime = new Date(s);
      if (e) tripEndTime = new Date(e);
    } catch (_) { photos = []; }
  }

  document.addEventListener('DOMContentLoaded', init);

  return { startTrip, endTrip, handleFiles, closeModal, savePhoto, selectPhoto, switchTab, searchAddress, pickSuggestion, openLightbox, closeLightbox };
})();
