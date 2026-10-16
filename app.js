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

// Pautan API Backend Cloud Run
const BACKEND_URL = "https://resit-api-399824306056.asia-southeast1.run.app/extract";

const cameraInput = document.getElementById('cameraInput');
const preview = document.getElementById('preview');
const previewContainer = document.getElementById('preview-container');
const actions = document.getElementById('actions');
const statusDiv = document.getElementById('status');
const resultCard = document.getElementById('resultCard');
const rawJson = document.getElementById('rawJson');

let capturedImageBase64 = null;

// Tangkap gambar dari kamera/galeri
cameraInput.addEventListener('change', async function(e) {
  const file = e.target.files[0];
  if (!file) return;

  statusDiv.innerHTML = '<span class="loader"></span>Memotong sempadan meja & mencantikkan resit...';
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
      statusDiv.innerHTML = '✨ Resit berjaya dipotong kemas!';
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

// Enjin Auto-Crop Sebenar (Potong Meja) & Auto-Levels Pencerahan Dokumen
function autoCropAndEnhance(imageSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // 1. Skala kecil untuk analisa pengesanan sempadan kertas pantas
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
        const lum = Math.round(0.299 * aData[i] + 0.587 * aData[i+1] + 0.114 * aData[i+2]);
        gray[i / 4] = lum;
        hist[lum]++;
        sumTotal += lum;
      }

      // 2. Kira Ambang Pemisahan Otsu (Pisahkan Kertas Putih vs Meja)
      const totalPixels = aW * aH;
      let sumB = 0, wB = 0, maxVar = 0, bestThresh = 128;

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
          bestThresh = t;
        }
      }

      // Pastikan had ambang selamat bagi mengelakkan ralat silau lampu
      const thresh = Math.max(85, Math.min(bestThresh + 5, 210));

      // 3. Unjuran Garisan (Projection Profile) untuk Cari Sempadan Sebenar Resit
      const rowCounts = new Int32Array(aH);
      const colCounts = new Int32Array(aW);

      for (let y = 0; y < aH; y++) {
        for (let x = 0; x < aW; x++) {
          if (gray[y * aW + x] > thresh) {
            rowCounts[y]++;
            colCounts[x]++;
          }
        }
      }

      const rowThreshold = aW * 0.14; // Baris mesti sekurang-kurangnya 14% kawasan kertas
      const colThreshold = aH * 0.14;

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

      // 4. Pengiraan Koordinat Potongan Asal
      let cropX = 0, cropY = 0, cropW = img.width, cropH = img.height;

      // Jika resit sah dikesan dan menepati sekurang-kurangnya 15% saiz imej
      if (detectedW > aW * 0.15 && detectedH > aH * 0.15 && (detectedW < aW * 0.98 || detectedH < aH * 0.98)) {
        const scaleX = img.width / aW;
        const scaleY = img.height / aH;
        const padX = detectedW * 0.015; // Lebihan 1.5% agar teks di sisi tidak terpotong
        const padY = detectedH * 0.015;

        cropX = Math.max(0, (minX - padX) * scaleX);
        cropY = Math.max(0, (minY - padY) * scaleY);
        cropW = Math.min(img.width - cropX, (detectedW + padX * 2) * scaleX);
        cropH = Math.min(img.height - cropY, (detectedH + padY * 2) * scaleY);
      }

      // 5. Kanvas Output: Saiz Kanvas Ialah Saiz Resit Sahaja (Meja Terbuang Terus)
      const outCanvas = document.createElement('canvas');
      const finalW = Math.round(cropW);
      const finalH = Math.round(cropH);
      outCanvas.width = finalW;
      outCanvas.height = finalH;

      const outCtx = outCanvas.getContext('2d');
      outCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, finalW, finalH);

      // 6. Penapis Pencerahan Dokumen (Auto-Levels Kertas Putih & Tulisan Tajam)
      const outImgData = outCtx.getImageData(0, 0, finalW, finalH);
      const d = outImgData.data;
      const cropHist = new Int32Array(256);

      for (let i = 0; i < d.length; i += 4) {
        const g = Math.round(0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]);
        cropHist[g]++;
      }

      const totalCropPixels = finalW * finalH;
      let count = 0;
      let pLow = 30;
      let pHigh = 225;

      // Ambil paras dakwat hitam (~5%) dan paras kertas putih (~90%)
      for (let i = 0; i < 256; i++) {
        count += cropHist[i];
        if (count >= totalCropPixels * 0.05) {
          pLow = i;
          break;
        }
      }

      count = 0;
      for (let i = 0; i < 256; i++) {
        count += cropHist[i];
        if (count >= totalCropPixels * 0.90) {
          pHigh = i;
          break;
        }
      }

      if (pHigh <= pLow + 25) {
        pHigh = 255;
        pLow = 0;
      }

      const scale = 255 / (pHigh - pLow);
      for (let i = 0; i < d.length; i += 4) {
        d[i]   = Math.min(255, Math.max(0, (d[i]   - pLow) * scale));
        d[i+1] = Math.min(255, Math.max(0, (d[i+1] - pLow) * scale));
        d[i+2] = Math.min(255, Math.max(0, (d[i+2] - pLow) * scale));
      }

      outCtx.putImageData(outImgData, 0, 0);
      resolve(outCanvas.toDataURL('image/jpeg', 0.90));
    };
    img.src = imageSrc;
  });
}

// Jana PDF Berasaskan Resit Yang Telah Dipotong
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

// Muat turun PDF
async function downloadPdfDirectly() {
  if (!capturedImageBase64) return;
  statusDiv.innerHTML = '<span class="loader"></span>Menjana fail PDF...';
  const blob = await createReceiptPdfBlob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `resit_crop_${Date.now()}.pdf`;
  link.click();
  statusDiv.innerHTML = '✅ PDF kemas berjaya disimpan!';
}

// Hantar PDF resit ke Gemini Cloud Run
async function processReceipt() {
  statusDiv.innerHTML = '<span class="loader"></span>Menjana dokumen PDF...';
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

// Paparkan data hasil ekstrak
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
