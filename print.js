/* ── TraceKit print.js — 10×15 cm kiosk layout ── */
const Printer = (() => {

  /* 
    10 cm × 15 cm at 300 DPI → 1181 × 1772 px
    12 images per sheet: 4 columns × 3 rows
    Each image: 2.5 cm × 5 cm → 295 × 591 px at 300 DPI
    Margin: 0.4 cm → 47 px | Gap: 0.2 cm → 24 px
  */
  const DPI       = 300;
  const CM        = DPI / 2.54;          // px per cm at 300 dpi
  const SHEET_W   = Math.round(10 * CM); // 1181
  const SHEET_H   = Math.round(15 * CM); // 1772
  const IMG_W     = Math.round(2.5 * CM);// 295
  const IMG_H     = Math.round(5.0 * CM);// 591
  const COLS      = 4;
  const ROWS      = 3;
  const MARGIN_X  = Math.round((SHEET_W - COLS * IMG_W) / 2); // auto-center
  const MARGIN_Y  = Math.round((SHEET_H - ROWS * IMG_H) / 2);
  const GAP_X     = 0; // images touch — cut guides separate them
  const GAP_Y     = 0;
  const GUIDE_W   = 2; // px — cut guide line thickness

  let selectedIndexes = [];
  let allPhotos = [];

  /* ── Open print modal ── */
  function open(photos) {
    allPhotos = photos;
    selectedIndexes = photos.map((_, i) => i).slice(0, 12);
    renderModal();
    document.getElementById('printOverlay').classList.add('open');
  }

  function close() {
    document.getElementById('printOverlay').classList.remove('open');
  }

  /* ── Render selection modal ── */
  function renderModal() {
    const grid = document.getElementById('printSelectGrid');
    grid.innerHTML = allPhotos.map((p, i) => `
      <div class="ps-item${selectedIndexes.includes(i) ? ' selected' : ''}" onclick="Printer.toggleSelect(${i})" title="${p.location}">
        <img src="${p.src}" alt="${p.location}" />
        <div class="ps-check">${selectedIndexes.indexOf(i) !== -1 ? selectedIndexes.indexOf(i) + 1 : ''}</div>
        <div class="ps-loc">${p.location}</div>
      </div>`).join('');
    updateCount();
  }

  function toggleSelect(i) {
    const idx = selectedIndexes.indexOf(i);
    if (idx !== -1) {
      selectedIndexes.splice(idx, 1);
    } else {
      if (selectedIndexes.length >= 12) {
        selectedIndexes.shift(); // drop oldest if over 12
      }
      selectedIndexes.push(i);
    }
    renderModal();
  }

  function updateCount() {
    const el = document.getElementById('printSelCount');
    if (el) el.textContent = `${selectedIndexes.length} / 12 selected`;
    const btn = document.getElementById('printGenBtn');
    if (btn) btn.disabled = selectedIndexes.length === 0;
  }

  /* ── Draw sheet on canvas ── */
  async function drawSheet(canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width  = SHEET_W;
    canvas.height = SHEET_H;

    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, SHEET_W, SHEET_H);

    const slots = selectedIndexes.slice(0, 12);

    // Draw images
    for (let idx = 0; idx < slots.length; idx++) {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const x = MARGIN_X + col * IMG_W;
      const y = MARGIN_Y + row * IMG_H;
      const photo = allPhotos[slots[idx]];
      await drawImageContain(ctx, photo.src, x, y, IMG_W, IMG_H);
    }

    // Draw cut guides
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = GUIDE_W;
    ctx.setLineDash([8, 6]);

    // Vertical guides
    for (let c = 0; c <= COLS; c++) {
      const x = MARGIN_X + c * IMG_W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, SHEET_H);
      ctx.stroke();
    }

    // Horizontal guides
    for (let r = 0; r <= ROWS; r++) {
      const y = MARGIN_Y + r * IMG_H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SHEET_W, y);
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Corner marks
    ctx.strokeStyle = '#AAAAAA';
    ctx.lineWidth = 1;
    const TICK = 20;
    [[MARGIN_X, MARGIN_Y], [MARGIN_X + COLS * IMG_W, MARGIN_Y],
     [MARGIN_X, MARGIN_Y + ROWS * IMG_H], [MARGIN_X + COLS * IMG_W, MARGIN_Y + ROWS * IMG_H]].forEach(([cx, cy]) => {
      ctx.beginPath(); ctx.moveTo(cx - TICK, cy); ctx.lineTo(cx + TICK, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - TICK); ctx.lineTo(cx, cy + TICK); ctx.stroke();
    });
  }

  /* Draw image cover-fit into rect without distortion */
  function drawImageContain(ctx, src, x, y, w, h) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.max(w / img.width, h / img.height);
        const sw = img.width * scale;
        const sh = img.height * scale;
        const sx = x + (w - sw) / 2;
        const sy = y + (h - sh) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh);
        ctx.restore();
        resolve();
      };
      img.onerror = resolve;
      img.src = src;
    });
  }

  /* ── Generate & download PNG ── */
  async function downloadPNG() {
    if (!selectedIndexes.length) return;
    setLoading(true);
    const canvas = document.createElement('canvas');
    await drawSheet(canvas);
    const link = document.createElement('a');
    link.download = `tracekit-photos-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setLoading(false);
    showToast('PNG downloaded — ready for photo kiosk!');
  }

  /* ── Generate & download PDF ── */
  async function downloadPDF() {
    if (!selectedIndexes.length) return;
    setLoading(true);
    const canvas = document.createElement('canvas');
    await drawSheet(canvas);
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    // Use jsPDF (loaded via CDN in index.html)
    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'cm',
        format: [10, 15],
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, 10, 15);
      pdf.save(`tracekit-photos-${Date.now()}.pdf`);
      showToast('PDF downloaded — ready to print!');
    } catch (e) {
      showToast('PDF failed — downloading PNG instead.');
      const link = document.createElement('a');
      link.download = `tracekit-photos-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
    setLoading(false);
  }

  /* ── Preview ── */
  async function updatePreview() {
    const canvas = document.getElementById('printPreviewCanvas');
    if (!canvas || !selectedIndexes.length) return;
    await drawSheet(canvas);
  }

  /* ── UI helpers ── */
  function setLoading(on) {
    const btn1 = document.getElementById('printPNGBtn');
    const btn2 = document.getElementById('printPDFBtn');
    if (btn1) btn1.disabled = on;
    if (btn2) btn2.disabled = on;
    const spinner = document.getElementById('printSpinner');
    if (spinner) spinner.style.display = on ? 'block' : 'none';
  }

  function showToast(msg) {
    const el = document.getElementById('printToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3500);
  }

  return { open, close, toggleSelect, downloadPNG, downloadPDF, updatePreview };
})();
