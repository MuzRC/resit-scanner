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

// Pautan Backend Cloud Run yang ditanam kekal
const BACKEND_URL = "https://resit-api-399824306056.asia-southeast1.run.app/extract";

const cameraInput = document.getElementById('cameraInput');
const preview = document.getElementById('preview');
const previewContainer = document.getElementById('preview-container');
const actions = document.getElementById('actions');
const statusDiv = document.getElementById('status');
const resultCard = document.getElementById('resultCard');
const rawJson = document.getElementById('rawJson');

let capturedImageBase64 = null;

// Tangkap imej dari kamera atau galeri telefon
cameraInput.addEventListener('change', async function(e) {
  const file = e.target.files[0];
  if (!file) return;

  statusDiv.innerHTML = '<span class="loader"></span>Membuang meja & menyamakan warna latar resit...';
  previewContainer.style.display = 'none';
  actions.style.display = 'none';
  resultCard.style.display = 'none';

  const reader = new FileReader();
  reader.onload = async function(event) {
    try {
      const croppedImage = await autoCropAndEnhance(event.target.result);
      capturedImageBase64 = croppedImage;
      preview.src = capturedImageBase64;
      previewContainer.style.display = 'block';
      actions.style.display = 'flex';
      statusDiv.innerHTML = '✨ Meja berjaya dibuang & resit sedia diproses!';
    } catch (err) {
      console.error("Ralat pemprosesan imej:", err);
      capturedImageBase64 = event.target.result;
      preview.src = capturedImageBase64;
      previewContainer.style.display = 'block';
      actions.style.display = 'flex';
      statusDiv.innerHTML = 'Resit sedia untuk diproses.';
    }
  };
  reader.readAsDataURL(file);
});

// Enjin Auto-Crop & Penyingkiran Meja (Menyamakan Latar Belakang)
function autoCropAndEnhance(imageSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // 1. Skala kecil untuk analisa sempadan kertas pantas
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

      // 2. Kira Ambang Pemisahan Otsu Optimum (Pemisah Meja vs Resit)
      const totalPixels = aW * aH;
      let sumB = 0, wB = 0, maxVar = 0;
      let bestTStart = 128, bestTEnd = 128;

      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        const wF = totalPixels - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sumTotal - sumB) / wF;
        const betweenVar = wB * wF * Math.pow(mB - mF, 2);
        if (betweenVar > maxVar) {
          maxVar = betweenVar;
          bestTStart = t;
          bestTEnd = t;
        } else if (Math.abs(betweenVar - maxVar) < 1) {
          bestTEnd = t;
        }
      }

      const rawThresh = Math.round((bestTStart + bestTEnd) / 2);
      const thresh = Math.max(80, Math.min(rawThresh, 215));

      // 3. Unjuran Garisan (Projection Profile) untuk Mengesan Kotak Resit
      const rowCounts = new Int32Array(aH);
      const colCounts = new Int32Array(aW);

      for (let y = 0; y < aH; y++) {
        const rowOffset = y * aW;
        for (let x = 0; x < aW; x++) {
          if (gray[rowOffset + x] >= thresh) {
            rowCounts[y]++;
            colCounts[x]++;
          }
        }
      }

      const rowThreshold = aW * 0.08;
      const colThreshold = aH * 0.08;

      let minY = 0;
      while (minY < aH && rowCounts[minY] < rowThreshold) minY++;

      let maxY = aH - 1;
      while (maxY >= 0 && rowCounts[maxY] < rowThreshold) maxY--;

      let minX = 0;
      while (minX < aW && colCounts[minX] < colThreshold) minX++;

      let maxX = aW - 1;
      while (maxX >= 0 && colCounts[maxX] < colThreshold) maxX--;

      const detectedW = maxX - minX;
      const detectedH = maxY - minY;

      let cropX = 0, cropY = 0, cropW = img.width, cropH = img.height;

      if (detectedW > aW * 0.12 && detectedH > aH * 0.12) {
        const scaleX = img.width / aW;
        const scaleY = img.height / aH;
        cropX = Math.max(0, minX * scaleX);
        cropY = Math.max(0, minY * scaleY);
        cropW = Math.min(img.width - cropX, detectedW * scaleX);
        cropH = Math.min(img.height - cropY, detectedH * scaleY);
      }

      // 4. Salin Bahagian Resit Sahaja ke Kanvas Output
      const maxRes = 1400;
      let outW = Math.round(cropW);
      let outH = Math.round(cropH);

      if (outW > maxRes || outH > maxRes) {
        if (outW > outH) {
          outH = Math.round((outH * maxRes) / outW);
          outW = maxRes;
        } else {
          outW = Math.round((outW * maxRes) / outH);
          outH = maxRes;
        }
      }

      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      const outCtx = outCanvas.getContext('2d');
      outCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

      const outImgData = outCtx.getImageData(0, 0, outW, outH);
      const d = outImgData.data;

      // 5. TEKNIK FLOOD-FILL DARI SEMPADAN LUAR:
      // Sebarang sisa bucu meja ditukar terus ke PUTIH RESIT!
      const totalOutPixels = outW * outH;
      const cropLum = new Uint8Array(totalOutPixels);

      for (let i = 0; i < totalOutPixels; i++) {
        const off = i * 4;
        cropLum[i] = Math.round(0.299 * d[off] + 0.587 * d[off + 1] + 0.114 * d[off + 2]);
      }

      const visited = new Uint8Array(totalOutPixels);
      const queue = new Int32Array(totalOutPixels);
      let qHead = 0, qTail = 0;

      // Imbas dari 4 sisi garisan sempadan luar
      for (let x = 0; x < outW; x++) {
        const topIdx = x;
        const botIdx = (outH - 1) * outW + x;
        if (cropLum[topIdx] < thresh) { visited[topIdx] = 1; queue[qTail++] = topIdx; }
        if (cropLum[botIdx] < thresh) { visited[botIdx] = 1; queue[qTail++] = botIdx; }
      }
      for (let y = 0; y < outH; y++) {
        const leftIdx = y * outW;
        const rightIdx = y * outW + (outW - 1);
        if (cropLum[leftIdx] < thresh && !visited[leftIdx]) { visited[leftIdx] = 1; queue[qTail++] = leftIdx; }
        if (cropLum[rightIdx] < thresh && !visited[rightIdx]) { visited[rightIdx] = 1; queue[qTail++] = rightIdx; }
      }

      // Limpahkan warna putih kertas resit ke semua sisa meja luar
      while (qHead < qTail) {
        const curIdx = queue[qHead++];
        const curX = curIdx % outW;
        const curY = Math.floor(curIdx / outW);

        // Tukar piksel meja jadi putih bersih
        const pOff = curIdx * 4;
        d[pOff] = 255;
        d[pOff + 1] = 255;
        d[pOff + 2] = 255;

        const neighbors = [
          curY > 0 ? (curY - 1) * outW + curX : -1,
          curY < outH - 1 ? (curY + 1) * outW + curX : -1,
          curX > 0 ? curY * outW + (curX - 1) : -1,
          curX < outW - 1 ? curY * outW + (curX + 1) : -1
        ];

        for (let n = 0; n < 4; n++) {
          const nIdx = neighbors[n];
          if (nIdx !== -1 && !visited[nIdx] && cropLum[nIdx] < thresh) {
            visited[nIdx] = 1;
            queue[qTail++] = nIdx;
          }
        }
      }

      // 6. Penapis Auto-Levels & Kontras Dokumen:
      // Kertas resit diputihkan sekata & tulisan hitam dipekatkan
      for (let i = 0; i < totalOutPixels; i++) {
        if (visited[i]) continue; // Bahagian meja yang sudah diputihkan diabaikan

        const off = i * 4;
        let r = d[off], g = d[off + 1], b = d[off + 2];
        const lum = cropLum[i];

        if (lum > thresh) {
          // Latar kertas resit -> diputihkan seragam sama dengan latar bucu
          d[off]     = Math.min(255, r * 1.15 + 20);
          d[off + 1] = Math.min(255, g * 1.15 + 20);
          d[off + 2] = Math.min(255, b * 1.15 + 20);
        } else {
          // Tulisan atau dakwat hitam pada resit -> dipekatkan
          d[off]     = Math.max(0, r * 0.85);
          d[off + 1] = Math.max(0, g * 0.85);
          d[off + 2] = Math.max(0, b * 0.85);
        }
      }

      outCtx.putImageData(outImgData, 0, 0);
      resolve(outCanvas.toDataURL('image/jpeg', 0.90));
    };
    img.src = imageSrc;
  });
}

// Jana PDF Berasaskan Resit Yang Telah Dipotong & Diputihkan
function createReceiptPdfBlob() {
  return new Promise((resolve) => {
    const { jsPDF } = window.jspdf;
    const img = new Image();
    img.src = capturedImageBase64;
    img.onload = function() {
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

// Simpan fail PDF
async function downloadPdfDirectly() {
  if (!capturedImageBase64) return;
  statusDiv.innerHTML = '<span class="loader"></span>Menjana fail PDF...';
  const blob = await createReceiptPdfBlob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `resit_bersih_${Date.now()}.pdf`;
  link.click();
  statusDiv.innerHTML = '✅ PDF resit bersih berjaya disimpan!';
}

// Hantar ke Gemini AI di Cloud Run
async function processReceipt() {
  statusDiv.innerHTML = '<span class="loader"></span>Menjana dokumen PDF kemas...';
  const pdfBlob = await createReceiptPdfBlob();

  statusDiv.innerHTML = '<span class="loader"></span>Gemini AI sedang membaca resit...';

  const formData = new FormData();
  formData.append('file', pdfBlob, 'receipt.pdf');

  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Ralat pelayan: ${response.status}`);
    }

    const data = await response.json();
    renderResult(data);
    statusDiv.innerHTML = '✅ Selesai diekstrak!';
  } catch (err) {
    console.error(err);
    statusDiv.innerHTML = `<span style="color: red;">❌ Ralat: ${err.message}</span>`;
  }
}

// Paparkan keputusan
function renderResult(data) {
  document.getElementById('resKedai').innerText = data.nama_kedai || 'Tidak dinyatakan';
  document.getElementById('resTarikh').innerText = data.tarikh || '-';
  document.getElementById('resNo').innerText = data.no_resit || '-';

  const totalNum = parseFloat(data.jumlah_keseluruhan || 0).toFixed(2);
  document.getElementById('resTotal').innerText = `RM ${totalNum}`;

  const tbody = document.getElementById('itemsBody');
  tbody.innerHTML = '';

  if (Array.isArray(data.senarai_barang) && data.senarai_barang.length > 0) {
    data.senarai_barang.forEach(item => {
      const tr = document.createElement('tr');
      const hargaStr = parseFloat(item.harga || 0).toFixed(2);
      tr.innerHTML = `
        <td>${item.nama || item.item || '-'}</td>
        <td class="num">${hargaStr}</td>
      `;
      tbody.appendChild(tr);
    });
  } else {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:#999;">Tiada senarai item dikesan</td></tr>';
  }

  rawJson.innerText = JSON.stringify(data, null, 2);
  resultCard.style.display = 'block';
}

function toggleRawJson() {
  rawJson.style.display = rawJson.style.display === 'block' ? 'none' : 'block';
}
