/* ── TraceKit print.js v2 ── */
const Printer = (() => {

  /*
    Photo sheet: 10×15cm @ 300DPI = 1181×1772px
    12 images: 4 cols × 3 rows, each 2.5×5cm = 295×591px

    Info label sheet: 10×15cm
    Each label: 2.5×5cm — shows location (line1), date (line2), time (line3)
    Same 4×3 grid, cut guides included
  */
  const DPI     = 300;
  const CM      = DPI / 2.54;
  const SHEET_W = Math.round(10 * CM);   // 1181
  const SHEET_H = Math.round(15 * CM);   // 1772
  const IMG_W   = Math.round(2.5 * CM);  // 295
  const IMG_H   = Math.round(5.0 * CM);  // 591
  const COLS    = 4;
  const ROWS    = 3;
  const MARGIN_X = Math.round((SHEET_W - COLS * IMG_W) / 2);
  const MARGIN_Y = Math.round((SHEET_H - ROWS * IMG_H) / 2);

  let selectedIndexes = [];
  let allPhotos = [];

  /* ── Open / populate print panel ── */
  function open(photos) {
    allPhotos = photos;
    // default: first 12
    selectedIndexes = photos.map((_, i) => i).slice(0, 12);
    renderGrid();
  }

  function renderGrid() {
    const grid = document.getElementById('printSelectGrid');
    grid.innerHTML = allPhotos.map((p, i) => {
      const pos = selectedIndexes.indexOf(i);
      const sel = pos !== -1;
      return `
        <div class="ps-item${sel ? ' selected' : ''}" onclick="Printer.toggleSelect(${i})" title="${p.location}">
          <img src="${p.src}" alt="${p.location}" />
          <div class="ps-check">${sel ? pos + 1 : ''}</div>
          <div class="ps-loc">${p.location}</div>
        </div>`;
    }).join('');
    updateCount();
  }

  function toggleSelect(i) {
    const idx = selectedIndexes.indexOf(i);
    if (idx !== -1) {
      selectedIndexes.splice(idx, 1);
    } else {
      if (selectedIndexes.length >= 12) selectedIndexes.shift();
      selectedIndexes.push(i);
    }
    renderGrid();
  }

  function updateCount() {
    const el = document.getElementById('printSelCount');
    if (el) el.textContent = `${selectedIndexes.length} / 12 selected`;
  }

  /* ── Draw photo sheet ── */
  async function drawPhotoSheet(canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = SHEET_W; canvas.height = SHEET_H;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, SHEET_W, SHEET_H);

    for (let idx = 0; idx < selectedIndexes.slice(0, 12).length; idx++) {
      const col = idx % COLS, row = Math.floor(idx / COLS);
      const x = MARGIN_X + col * IMG_W, y = MARGIN_Y + row * IMG_H;
      await drawImageCover(ctx, allPhotos[selectedIndexes[idx]].src, x, y, IMG_W, IMG_H);
    }
    drawCutGuides(ctx);
  }

  /* ── Draw info label sheet ── */
  async function drawInfoSheet(canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = SHEET_W; canvas.height = SHEET_H;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, SHEET_W, SHEET_H);

    const slots = selectedIndexes.slice(0, 12);
    for (let idx = 0; idx < slots.length; idx++) {
      const col = idx % COLS, row = Math.floor(idx / COLS);
      const x = MARGIN_X + col * IMG_W;
      const y = MARGIN_Y + row * IMG_H;
      const photo = allPhotos[slots[idx]];

      /* Light gray cell background */
      ctx.fillStyle = '#F5F5F5';
      ctx.fillRect(x, y, IMG_W, IMG_H);

      /* Parse date & time */
      const dt = photo.time ? new Date(photo.time) : null;
      const dateStr = dt ? dt.toLocaleDateString('en-US', { year:'numeric', month:'2-digit', day:'2-digit' }) : '—';
      const timeStr = dt ? dt.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: false }) : '—';
      const locStr  = photo.location || '—';

      /* Text layout — centred vertically in cell */
      const cx = x + IMG_W / 2;        // horizontal centre
      const cellMid = y + IMG_H / 2;   // vertical centre of cell

      const LINE_GAP = Math.round(0.55 * CM); // ~65px gap between lines
      const FONT_LOC  = Math.round(0.38 * CM); // ~45px  location (larger)
      const FONT_DT   = Math.round(0.30 * CM); // ~35px  date / time

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      /* Location — bold */
      ctx.fillStyle = '#1A1714';
      ctx.font = `600 ${FONT_LOC}px "Helvetica Neue", Arial, sans-serif`;
      drawWrappedText(ctx, locStr, cx, cellMid - LINE_GAP, IMG_W - 20, FONT_LOC * 1.3);

      /* Date */
      ctx.fillStyle = '#5A5550';
      ctx.font = `400 ${FONT_DT}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText(dateStr, cx, cellMid + LINE_GAP * 0.6);

      /* Time */
      ctx.fillStyle = '#7A7269';
      ctx.font = `400 ${FONT_DT}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText(timeStr, cx, cellMid + LINE_GAP * 1.5);
    }

    drawCutGuides(ctx);
  }

  /* Wrap long text to fit width */
  function drawWrappedText(ctx, text, cx, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let lines = [];
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line); line = word;
      } else { line = test; }
    }
    if (line) lines.push(line);
    lines = lines.slice(0, 2); // max 2 lines for location
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
  }

  /* ── Cut guides ── */
  function drawCutGuides(ctx) {
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    for (let c = 0; c <= COLS; c++) {
      const x = MARGIN_X + c * IMG_W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SHEET_H); ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      const y = MARGIN_Y + r * IMG_H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SHEET_W, y); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Corner ticks
    ctx.strokeStyle = '#AAAAAA'; ctx.lineWidth = 1;
    const TICK = 20;
    [[MARGIN_X, MARGIN_Y],[MARGIN_X+COLS*IMG_W,MARGIN_Y],[MARGIN_X,MARGIN_Y+ROWS*IMG_H],[MARGIN_X+COLS*IMG_W,MARGIN_Y+ROWS*IMG_H]].forEach(([cx,cy])=>{
      ctx.beginPath(); ctx.moveTo(cx-TICK,cy); ctx.lineTo(cx+TICK,cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx,cy-TICK); ctx.lineTo(cx,cy+TICK); ctx.stroke();
    });
  }

  function drawImageCover(ctx, src, x, y, w, h) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.max(w / img.width, h / img.height);
        const sw = img.width * scale, sh = img.height * scale;
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.drawImage(img, x + (w-sw)/2, y + (h-sh)/2, sw, sh);
        ctx.restore();
        resolve();
      };
      img.onerror = resolve;
      img.src = src;
    });
  }

  /* ── Downloads ── */
  async function downloadPNG() {
    if (!selectedIndexes.length) return;
    setLoading(true);
    const canvas = document.createElement('canvas');
    await drawPhotoSheet(canvas);
    triggerDownload(canvas.toDataURL('image/png'), `tracekit-photos-${Date.now()}.png`);
    setLoading(false);
    showToast('📸 Photo PNG downloaded — ready for kiosk!');
  }

  async function downloadInfoPNG() {
    if (!selectedIndexes.length) return;
    setLoading(true);
    const canvas = document.createElement('canvas');
    await drawInfoSheet(canvas);
    triggerDownload(canvas.toDataURL('image/png'), `tracekit-info-${Date.now()}.png`);
    setLoading(false);
    showToast('📋 Info sheet PNG downloaded!');
  }

  async function downloadPDF() {
    if (!selectedIndexes.length) return;
    setLoading(true);
    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation:'portrait', unit:'cm', format:[10,15] });

      // Page 1 — photos
      const c1 = document.createElement('canvas');
      await drawPhotoSheet(c1);
      pdf.addImage(c1.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 10, 15);

      // Page 2 — info labels
      pdf.addPage([10,15], 'portrait');
      const c2 = document.createElement('canvas');
      await drawInfoSheet(c2);
      pdf.addImage(c2.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 10, 15);

      pdf.save(`tracekit-${Date.now()}.pdf`);
      showToast('✅ PDF downloaded — 2 pages: photos + info labels!');
    } catch (e) {
      console.error(e);
      showToast('PDF failed — try downloading PNG instead.');
    }
    setLoading(false);
  }

  async function updatePreview() {
    const canvas = document.getElementById('printPreviewCanvas');
    const placeholder = document.getElementById('printPreviewPlaceholder');
    if (!selectedIndexes.length) return;
    if (placeholder) placeholder.style.display = 'none';
    await drawPhotoSheet(canvas);
    canvas.setAttribute('data-ready','1');
  }

  function setLoading(on) {
    ['printPNGBtn','printInfoBtn','printPDFBtn'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.disabled = on;
    });
    const sp = document.getElementById('printSpinner');
    if (sp) sp.style.display = on ? 'block' : 'none';
  }

  function showToast(msg) {
    const el = document.getElementById('printToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3500);
  }

  function triggerDownload(dataUrl, filename) {
    const a = document.createElement('a');
    a.download = filename; a.href = dataUrl; a.click();
  }

  return { open, toggleSelect, updatePreview, downloadPNG, downloadInfoPNG, downloadPDF };
})();
