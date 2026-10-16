// 1. Mekanisma Kemas Kini Automatik Versi PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.update();
    });
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// Pautan Backend Cloud Run
const BACKEND_URL = "https://resit-api-399824306056.asia-southeast1.run.app/extract";

const cameraInput = document.getElementById('cameraInput');
const galleryInput = document.getElementById('galleryInput');
const receiptsGrid = document.getElementById('receiptsGrid');
const actionsGroup = document.getElementById('actionsGroup');
const receiptCount = document.getElementById('receiptCount');
const statusDiv = document.getElementById('status');
const grandTotalCard = document.getElementById('grandTotalCard');
const grandTotalAmount = document.getElementById('grandTotalAmount');
const grandTotalCount = document.getElementById('grandTotalCount');
const resultsContainer = document.getElementById('resultsContainer');

// Senarai simpanan resit sebelum dan selepas diproses
let receiptsQueue = [];

// Pengendali input kamera & galeri
cameraInput.addEventListener('change', (e) => handleImageFiles(e.target.files));
galleryInput.addEventListener('change', (e) => handleImageFiles(e.target.files));

async function handleImageFiles(files) {
  if (!files || files.length === 0) return;

  statusDiv.innerHTML = '<span class="loader"></span>Mencukur meja & membersihkan gambar...';

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const base64Raw = await readFileAsBase64(file);
    try {
      const enhanced = await autoCropAndEnhance(base64Raw);
      receiptsQueue.push({
        id: Date.now() + Math.random(),
        base64: enhanced,
        pdfBlob: null,
        data: null
      });
    } catch (err) {
      console.error("Ralat pembersihan:", err);
      receiptsQueue.push({
        id: Date.now() + Math.random(),
        base64: base64Raw,
        pdfBlob: null,
        data: null
      });
    }
  }

  // Reset input supaya boleh pilih gambar yang sama semula jika perlu
  cameraInput.value = '';
  galleryInput.value = '';

  renderReceiptsGrid();
  statusDiv.innerHTML = `✨ ${receiptsQueue.length} resit sedia! Boleh tambah lagi atau terus proses.`;
}

function readFileAsBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

// Paparkan gambar resit dalam bentuk grid kad kecil
function renderReceiptsGrid() {
  receiptsGrid.innerHTML = '';
  if (receiptsQueue.length === 0) {
    actionsGroup.style.display = 'none';
    return;
  }

  actionsGroup.style.display = 'flex';
  receiptCount.innerText = receiptsQueue.length;

  receiptsQueue.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'receipt-thumb-card';
    card.innerHTML = `
      <button type="button" class="delete-thumb-btn" onclick="removeReceipt(${index})">✕</button>
      <img src="${item.base64}" alt="Resit #${index + 1}">
      <button type="button" class="thumb-rotate-btn" onclick="rotateThumb(${index})">🔄 Pusing 90°</button>
    `;
    receiptsGrid.appendChild(card);
  });
}

// Padam satu resit dari giliran
function removeReceipt(index) {
  receiptsQueue.splice(index, 1);
  renderReceiptsGrid();
  if (receiptsQueue.length === 0) {
    statusDiv.innerHTML = '';
  }
}

// Pusingkan satu resit jika kedudukan senget
function rotateThumb(index) {
  const item = receiptsQueue[index];
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.height;
    canvas.height = img.width;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    item.base64 = canvas.toDataURL('image/jpeg', 0.92);
    renderReceiptsGrid();
  };
  img.src = item.base64;
}

// Kosongkan semua senarai
function clearAllReceipts() {
  receiptsQueue = [];
  renderReceiptsGrid();
  grandTotalCard.style.display = 'none';
  resultsContainer.innerHTML = '';
  statusDiv.innerHTML = 'Senarai telah dikosongkan.';
}

// Enjin Auto-Crop Presisi Tinggi, Edge-Trim & Pemutih Pinggiran
function autoCropAndEnhance(imageSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const aW = 320;
      const aH = Math.round((img.height * aW) / img.width);

      const aCanvas = document.createElement('canvas');
      aCanvas.width = aW;
      aCanvas.height = aH;
      const aCtx = aCanvas.getContext('2d');
      aCtx.drawImage(img, 0, 0, aW, aH);

      const aData = aCtx.getImageData(0, 0, aW, aH).data;
      const gray = new Uint8Array(aW * aH);
      const hist = new Int32Array(256);

      let sumTotal = 0;
      for (let i = 0; i < aData.length; i += 4) {
        const lum = Math.round(0.299 * aData[i] + 0.587 * aData[i + 1] + 0.114 * aData[i + 2]);
        gray[i / 4] = lum;
        hist[lum]++;
        sumTotal += lum;
      }

      const totalPixels = aW * aH;
      let sumB = 0, wB = 0, maxVar = 0, bestThresh = 120;
      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        const wF = totalPixels - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sumTotal - sumB) / wF;
        const v = wB * wF * Math.pow(mB - mF, 2);
        if (v > maxVar) {
          maxVar = v;
          bestThresh = t;
        }
      }

      const thresh = Math.max(80, Math.min(bestThresh, 205));
      const rowCounts = new Int32Array(aH);
      const colCounts = new Int32Array(aW);

      for (let y = 0; y < aH; y++) {
        const off = y * aW;
        for (let x = 0; x < aW; x++) {
          if (gray[off + x] >= thresh) {
            rowCounts[y]++;
            colCounts[x]++;
          }
        }
      }

      const rowMinReq = aW * 0.15;
      const colMinReq = aH * 0.20;

      let minY = 0;
      while (minY < aH && rowCounts[minY] < rowMinReq) minY++;

      let maxY = aH - 1;
      while (maxY >= 0 && rowCounts[maxY] < rowMinReq) maxY--;

      let minX = 0;
      while (minX < aW && colCounts[minX] < colMinReq) minX++;

      let maxX = aW - 1;
      while (maxX >= 0 && colCounts[maxX] < colMinReq) maxX--;

      const detectedW = maxX - minX;
      const detectedH = maxY - minY;

      let cropX = 0, cropY = 0, cropW = img.width, cropH = img.height;

      if (detectedW > aW * 0.15 && detectedH > aH * 0.15) {
        const scaleX = img.width / aW;
        const scaleY = img.height / aH;
        cropX = Math.max(0, minX * scaleX);
        cropY = Math.max(0, minY * scaleY);
        cropW = Math.min(img.width - cropX, detectedW * scaleX);
        cropH = Math.min(img.height - cropY, detectedH * scaleY);
      }

      const maxDim = 1500;
      let outW = Math.round(cropW);
      let outH = Math.round(cropH);

      if (outW > maxDim || outH > maxDim) {
        if (outW > outH) {
          outH = Math.round((outH * maxDim) / outW);
          outW = maxDim;
        } else {
          outW = Math.round((outW * maxDim) / outH);
          outH = maxDim;
        }
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = outW;
      tempCanvas.height = outH;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

      const tData = tCtx.getImageData(0, 0, outW, outH).data;
      const lumMap = new Uint8Array(outW * outH);
      for (let i = 0; i < outW * outH; i++) {
        const off = i * 4;
        lumMap[i] = Math.round(0.299 * tData[off] + 0.587 * tData[off + 1] + 0.114 * tData[off + 2]);
      }

      let trimLeft = 0;
      while (trimLeft < Math.floor(outW * 0.20)) {
        let dark = 0;
        for (let y = 0; y < outH; y++) if (lumMap[y * outW + trimLeft] < thresh) dark++;
        if (dark / outH > 0.30) trimLeft++; else break;
      }

      let trimRight = outW - 1;
      while (trimRight > Math.floor(outW * 0.80)) {
        let dark = 0;
        for (let y = 0; y < outH; y++) if (lumMap[y * outW + trimRight] < thresh) dark++;
        if (dark / outH > 0.30) trimRight--; else break;
      }

      let trimTop = 0;
      while (trimTop < Math.floor(outH * 0.20)) {
        let dark = 0;
        for (let x = 0; x < outW; x++) if (lumMap[trimTop * outW + x] < thresh) dark++;
        if (dark / outW > 0.30) trimTop++; else break;
      }

      let trimBot = outH - 1;
      while (trimBot > Math.floor(outH * 0.80)) {
        let dark = 0;
        for (let x = 0; x < outW; x++) if (lumMap[trimBot * outW + x] < thresh) dark++;
        if (dark / outW > 0.30) trimBot--; else break;
      }

      const finalW = Math.max(10, trimRight - trimLeft + 1);
      const finalH = Math.max(10, trimBot - trimTop + 1);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = finalW;
      outCanvas.height = finalH;
      const outCtx = outCanvas.getContext('2d');
      outCtx.drawImage(tempCanvas, trimLeft, trimTop, finalW, finalH, 0, 0, finalW, finalH);

      const finalImgData = outCtx.getImageData(0, 0, finalW, finalH);
      const d = finalImgData.data;

      const blockSize = 32;
      const gridW = Math.ceil(finalW / blockSize);
      const gridH = Math.ceil(finalH / blockSize);
      const bgGrid = new Uint8Array(gridW * gridH);

      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
          const startX = gx * blockSize;
          const endX = Math.min(finalW, (gx + 1) * blockSize);
          const startY = gy * blockSize;
          const endY = Math.min(finalH, (gy + 1) * blockSize);

          let maxVal = 0;
          for (let py = startY; py < endY; py += 2) {
            for (let px = startX; px < endX; px += 2) {
              const idx = (py * finalW + px) * 4;
              const val = Math.round(0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]);
              if (val > maxVal) maxVal = val;
            }
          }
          bgGrid[gy * gridW + gx] = Math.max(75, maxVal);
        }
      }

      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = gridW;
      bgCanvas.height = gridH;
      const bgCtx = bgCanvas.getContext('2d');
      const bgImg = bgCtx.createImageData(gridW, gridH);
      for (let i = 0; i < bgGrid.length; i++) {
        const val = bgGrid[i];
        bgImg.data[i * 4] = val;
        bgImg.data[i * 4 + 1] = val;
        bgImg.data[i * 4 + 2] = val;
        bgImg.data[i * 4 + 3] = 255;
      }
      bgCtx.putImageData(bgImg, 0, 0);

      const smoothCanvas = document.createElement('canvas');
      smoothCanvas.width = finalW;
      smoothCanvas.height = finalH;
      const sCtx = smoothCanvas.getContext('2d');
      sCtx.imageSmoothingEnabled = true;
      sCtx.drawImage(bgCanvas, 0, 0, finalW, finalH);
      const smoothData = sCtx.getImageData(0, 0, finalW, finalH).data;

      const marginX = Math.floor(finalW * 0.025);
      const marginY = Math.floor(finalH * 0.025);

      for (let y = 0; y < finalH; y++) {
        for (let x = 0; x < finalW; x++) {
          const idx = (y * finalW + x) * 4;
          const curLum = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2];

          if (x < marginX || x > finalW - marginX || y < marginY || y > finalH - marginY) {
            if (curLum < thresh) {
              d[idx] = 255;
              d[idx + 1] = 255;
              d[idx + 2] = 255;
              continue;
            }
          }

          const bgVal = Math.max(1, smoothData[idx]);
          let normalized = (curLum / bgVal) * 255;

          let finalVal;
          if (normalized >= 190) {
            finalVal = 255;
          } else if (normalized <= 125) {
            finalVal = normalized * 0.65;
          } else {
            finalVal = 81.25 + (normalized - 125) * (173.75 / 65);
          }

          finalVal = Math.min(255, Math.max(0, finalVal));
          d[idx] = finalVal;
          d[idx + 1] = finalVal;
          d[idx + 2] = finalVal;
        }
      }

      outCtx.putImageData(finalImgData, 0, 0);
      resolve(outCanvas.toDataURL('image/jpeg', 0.92));
    };
    img.src = imageSrc;
  });
}

// Jana fail PDF daripada Base64
function generatePdfBlob(base64Image) {
  return new Promise((resolve) => {
    const { jsPDF } = window.jspdf;
    const img = new Image();
    img.src = base64Image;
    img.onload = () => {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const maxW = pageWidth - 20;
      const maxH = pageHeight - 20;

      let renderW = maxW;
      let renderH = (img.height * renderW) / img.width;

      if (renderH > maxH) {
        renderH = maxH;
        renderW = (img.width * renderH) / img.height;
      }

      const posX = (pageWidth - renderW) / 2;
      const posY = 10;

      pdf.addImage(img, 'JPEG', posX, posY, renderW, renderH);
      const blob = pdf.output('blob');
      resolve(blob);
    };
  });
}

function triggerBlobDownload(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

// PROSES SEMUA RESIT SECARA GILIRAN (LOOP)
async function processAllReceipts() {
  if (receiptsQueue.length === 0) return;

  const processBtn = document.getElementById('processAllBtn');
  processBtn.disabled = true;
  resultsContainer.innerHTML = '';
  grandTotalCard.style.display = 'none';

  let grandTotal = 0;
  let successCount = 0;

  for (let i = 0; i < receiptsQueue.length; i++) {
    const item = receiptsQueue[i];
    statusDiv.innerHTML = `<span class="loader"></span>Memproses resit [${i + 1}/${receiptsQueue.length}]...`;

    try {
      // 1. Jana PDF bagi resit ini
      const pdfBlob = await generatePdfBlob(item.base64);
      item.pdfBlob = pdfBlob;

      // 2. Hantar ke API Cloud Run
      const formData = new FormData();
      formData.append('file', pdfBlob, 'receipt.pdf');

      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error(`Status ${response.status}`);

      const data = await response.json();
      item.data = data;

      // Kira jumlah
      const totalNum = parseFloat(data.jumlah_keseluruhan || 0);
      grandTotal += totalNum;
      successCount++;

      // Paparkan kad hasil resit ini
      appendReceiptResultCard(item, i + 1);

    } catch (err) {
      console.error(`Gagal pada resit #${i + 1}:`, err);
      appendErrorCard(i + 1, err.message);
    }
  }

  processBtn.disabled = false;
  statusDiv.innerHTML = `✅ Selesai! Sebanyak ${successCount} daripada ${receiptsQueue.length} resit berjaya diekstrak.`;

  // Paparkan Grand Total
  grandTotalAmount.innerText = `RM ${grandTotal.toFixed(2)}`;
  grandTotalCount.innerText = `${successCount} Resit Berjaya`;
  grandTotalCard.style.display = 'flex';
}

// Tambah Kad Paparan Data bagi Setiap Resit
function appendReceiptResultCard(item, index) {
  const data = item.data;
  const card = document.createElement('div');
  card.className = 'receipt-result-card';

  let itemsRows = '';
  if (Array.isArray(data.senarai_barang) && data.senarai_barang.length > 0) {
    data.senarai_barang.forEach(it => {
      const hargaStr = parseFloat(it.harga || 0).toFixed(2);
      itemsRows += `
        <tr>
          <td>${it.nama || it.item || '-'}</td>
          <td class="num">${hargaStr}</td>
        </tr>
      `;
    });
  } else {
    itemsRows = '<tr><td colspan="2" style="text-align:center; color:#999;">Tiada senarai item dikesan</td></tr>';
  }

  const cleanShop = (data.nama_kedai || `Kedai_${index}`).replace(/[^a-zA-Z0-9]/g, '_');
  const cleanDate = (data.tarikh || '').replace(/[^a-zA-Z0-9]/g, '-');
  const filename = `Resit_${cleanShop}_${cleanDate || Date.now()}.pdf`;

  card.innerHTML = `
    <div class="receipt-result-header">
      <span class="receipt-result-title">Resit #${index}: ${data.nama_kedai || 'Tidak dinyatakan'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Tarikh:</span>
      <span class="info-val">${data.tarikh || '-'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">No. Resit:</span>
      <span class="info-val">${data.no_resit || '-'}</span>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Senarai Barang</th>
          <th style="text-align: right;">Harga (RM)</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <div class="total-highlight">
      <span>JUMLAH:</span>
      <span>RM ${parseFloat(data.jumlah_keseluruhan || 0).toFixed(2)}</span>
    </div>

    <button class="btn btn-download-pdf" id="dlBtn_${index}">
      📥 Muat Turun PDF Resit #${index}
    </button>
  `;

  resultsContainer.appendChild(card);

  // Pasang butang muat turun PDF resit ini
  document.getElementById(`dlBtn_${index}`).addEventListener('click', () => {
    triggerBlobDownload(item.pdfBlob, filename);
  });
}

function appendErrorCard(index, errorMsg) {
  const card = document.createElement('div');
  card.className = 'receipt-result-card';
  card.style.borderColor = '#ef5350';
  card.innerHTML = `
    <div class="receipt-result-header">
      <span class="receipt-result-title" style="color: #c62828;">Resit #${index}: Gagal Diekstrak</span>
    </div>
    <p style="font-size: 12px; color: #d32f2f;">Ralat: ${errorMsg}</p>
  `;
  resultsContainer.appendChild(card);
}
