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
const preview = document.getElementById('preview');
const previewContainer = document.getElementById('preview-container');
const actions = document.getElementById('actions');
const statusDiv = document.getElementById('status');
const resultCard = document.getElementById('resultCard');
const rawJson = document.getElementById('rawJson');

let capturedImageBase64 = null;
let currentPdfBlob = null;
let currentExtractedData = null;

// Tangkap gambar dari kamera atau galeri
cameraInput.addEventListener('change', async function(e) {
  const file = e.target.files[0];
  if (!file) return;

  statusDiv.innerHTML = '<span class="loader"></span>Mencukur meja & membersihkan tepi resit...';
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
      statusDiv.innerHTML = '✨ Resit sedia! Boleh pusing atau terus proses.';
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

// Fungsi Pusing Resit 90 darjah jika gambar melintang
function rotateReceipt() {
  if (!capturedImageBase64) return;
  const img = new Image();
  img.onload = () => {
    const rCanvas = document.createElement('canvas');
    rCanvas.width = img.height;
    rCanvas.height = img.width;
    const rCtx = rCanvas.getContext('2d');
    rCtx.translate(rCanvas.width / 2, rCanvas.height / 2);
    rCtx.rotate((90 * Math.PI) / 180);
    rCtx.drawImage(img, -img.width / 2, -img.height / 2);
    capturedImageBase64 = rCanvas.toDataURL('image/jpeg', 0.92);
    preview.src = capturedImageBase64;
  };
  img.src = capturedImageBase64;
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

      const tImgData = tCtx.getImageData(0, 0, outW, outH);
      const tData = tImgData.data;

      const lumMap = new Uint8Array(outW * outH);
      for (let i = 0; i < outW * outH; i++) {
        const off = i * 4;
        lumMap[i] = Math.round(0.299 * tData[off] + 0.587 * tData[off + 1] + 0.114 * tData[off + 2]);
      }

      let trimLeft = 0;
      while (trimLeft < Math.floor(outW * 0.20)) {
        let darkPixels = 0;
        for (let y = 0; y < outH; y++) {
          if (lumMap[y * outW + trimLeft] < thresh) darkPixels++;
        }
        if (darkPixels / outH > 0.30) trimLeft++;
        else break;
      }

      let trimRight = outW - 1;
      while (trimRight > Math.floor(outW * 0.80)) {
        let darkPixels = 0;
        for (let y = 0; y < outH; y++) {
          if (lumMap[y * outW + trimRight] < thresh) darkPixels++;
        }
        if (darkPixels / outH > 0.30) trimRight--;
        else break;
      }

      let trimTop = 0;
      while (trimTop < Math.floor(outH * 0.20)) {
        let darkPixels = 0;
        for (let x = 0; x < outW; x++) {
          if (lumMap[trimTop * outW + x] < thresh) darkPixels++;
        }
        if (darkPixels / outW > 0.30) trimTop++;
        else break;
      }

      let trimBot = outH - 1;
      while (trimBot > Math.floor(outH * 0.80)) {
        let darkPixels = 0;
        for (let x = 0; x < outW; x++) {
          if (lumMap[trimBot * outW + x] < thresh) darkPixels++;
        }
        if (darkPixels / outW > 0.30) trimBot--;
        else break;
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

// Jana PDF Berasaskan Imej Resit Bersih
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

// Pembantu Muat Turun Fail Blob ke Peranti
function triggerBlobDownload(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

// Muat turun PDF sahaja (tanpa AI)
async function downloadPdfDirectly() {
  if (!capturedImageBase64) return;
  statusDiv.innerHTML = '<span class="loader"></span>Menjana fail PDF...';
  const blob = await createReceiptPdfBlob();
  currentPdfBlob = blob;
  const filename = `resit_bersih_${Date.now()}.pdf`;
  triggerBlobDownload(blob, filename);
  statusDiv.innerHTML = `✅ Fail <strong>${filename}</strong> berjaya disimpan di telefon!`;
}

// Hantar ke Gemini AI & Muat Turun Fail PDF Automatik
async function processReceipt() {
  statusDiv.innerHTML = '<span class="loader"></span>Menjana fail PDF resit...';
  const pdfBlob = await createReceiptPdfBlob();
  currentPdfBlob = pdfBlob;

  statusDiv.innerHTML = '<span class="loader"></span>Gemini AI sedang mengekstrak data...';

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
    currentExtractedData = data;
    renderResult(data);

    // BINA NAMA FAIL PINTAR: Resit_NAMA_KEDAI_TARIKH.pdf
    const cleanShop = (data.nama_kedai || 'Kedai').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanDate = (data.tarikh || '').replace(/[^a-zA-Z0-9]/g, '-');
    const smartFilename = `Resit_${cleanShop}_${cleanDate || Date.now()}.pdf`;

    // CETUSKAN MUAT TURUN PDF KE TELEFON SERTA-MERTA!
    triggerBlobDownload(pdfBlob, smartFilename);

    statusDiv.innerHTML = `✅ Selesai diekstrak & fail <strong>${smartFilename}</strong> berjaya dimuat turun ke telefon!`;
  } catch (err) {
    console.error(err);
    statusDiv.innerHTML = `<span style="color: red;">❌ Ralat: ${err.message}</span>`;
  }
}

// Butang Muat Turun Semula di Kad Keputusan
function downloadCurrentReceiptPdf() {
  if (!currentPdfBlob) {
    downloadPdfDirectly();
    return;
  }
  const cleanShop = (currentExtractedData?.nama_kedai || 'Kedai').replace(/[^a-zA-Z0-9]/g, '_');
  const cleanDate = (currentExtractedData?.tarikh || '').replace(/[^a-zA-Z0-9]/g, '-');
  const filename = `Resit_${cleanShop}_${cleanDate || Date.now()}.pdf`;
  triggerBlobDownload(currentPdfBlob, filename);
  statusDiv.innerHTML = `📥 Memuat turun fail <strong>${filename}</strong> semula...`;
}

// Paparkan jadual perbelanjaan
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
