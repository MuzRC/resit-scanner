// 1. Pendaftaran Service Worker untuk PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW berdaftar:', reg.scope))
      .catch(err => console.log('SW gagal:', err));
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

  statusDiv.innerHTML = '<span class="loader"></span>Mengesan resit, buang background & terangkan gambar...';
  previewContainer.style.display = 'none';
  actions.style.display = 'none';
  resultCard.style.display = 'none';

  const reader = new FileReader();
  reader.onload = async function(event) {
    try {
      // Jalankan auto-crop dan penapis pencerahan dokumen
      const processedImage = await autoCropAndEnhance(event.target.result);
      capturedImageBase64 = processedImage;
      preview.src = capturedImageBase64;
      previewContainer.style.display = 'block';
      actions.style.display = 'flex';
      statusDiv.innerHTML = '✨ Resit berjaya dikemaskan & sedia diproses!';
    } catch (err) {
      console.error(err);
      capturedImageBase64 = event.target.result;
      preview.src = capturedImageBase64;
      previewContainer.style.display = 'block';
      actions.style.display = 'flex';
      statusDiv.innerHTML = 'Resit sedia untuk diproses!';
    }
  };
  reader.readAsDataURL(file);
});

// Enjin Auto-Crop (Buang Background Meja) & Terangkan Gambar (CamScanner Filter)
function autoCropAndEnhance(imageSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // 1. Analisis Sempadan Resit pada kanvas kecil supaya telefon tak 'lag'
      const maxAnalytic = 400;
      let aW = img.width;
      let aH = img.height;
      if (aW > aH && aW > maxAnalytic) {
        aH = Math.round((aH * maxAnalytic) / aW);
        aW = maxAnalytic;
      } else if (aH > maxAnalytic) {
        aW = Math.round((aW * maxAnalytic) / aH);
        aH = maxAnalytic;
      }

      const aCanvas = document.createElement('canvas');
      aCanvas.width = aW;
      aCanvas.height = aH;
      const aCtx = aCanvas.getContext('2d');
      aCtx.drawImage(img, 0, 0, aW, aH);

      const aImgData = aCtx.getImageData(0, 0, aW, aH);
      const aData = aImgData.data;

      let minX = aW, maxX = 0, minY = aH, maxY = 0;
      let totalLum = 0;
      const lumMap = new Uint8Array(aW * aH);

      for (let i = 0; i < aData.length; i += 4) {
        const lum = 0.299 * aData[i] + 0.587 * aData[i+1] + 0.114 * aData[i+2];
        lumMap[i / 4] = lum;
        totalLum += lum;
      }

      const avgLum = totalLum / (aW * aH);
      // Kertas resit kebiasaannya lebih cerah berbanding permukaan meja di bawahnya
      const threshold = Math.max(85, avgLum * 0.92);
      let detectedPixels = 0;

      for (let y = 0; y < aH; y++) {
        for (let x = 0; x < aW; x++) {
          if (lumMap[y * aW + x] > threshold) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            detectedPixels++;
          }
        }
      }

      // Tentukan koordinat Crop (dengan sedikit zon penampan 2% supaya tulisan tepi selamat)
      let cropX = 0, cropY = 0, cropW = img.width, cropH = img.height;
      if (detectedPixels > (aW * aH * 0.12) && maxX > minX && maxY > minY) {
        const scaleX = img.width / aW;
        const scaleY = img.height / aH;
        const padX = (maxX - minX) * 0.02;
        const padY = (maxY - minY) * 0.02;

        const finalMinX = Math.max(0, (minX - padX) * scaleX);
        const finalMinY = Math.max(0, (minY - padY) * scaleY);
        const finalMaxX = Math.min(img.width, (maxX + padX) * scaleX);
        const finalMaxY = Math.min(img.height, (maxY + padY) * scaleY);

        cropX = finalMinX;
        cropY = finalMinY;
        cropW = finalMaxX - finalMinX;
        cropH = finalMaxY - finalMinY;
      }

      // 2. Kanvas Resolusi Penuh untuk Potong & Terangkan Gambar
      const outCanvas = document.createElement('canvas');
      let outW = cropW;
      let outH = cropH;
      const maxRes = 1600; // Saiz ideal untuk bacaan AI & PDF yang padat
      if (outW > maxRes || outH > maxRes) {
        if (outW > outH) {
          outH = Math.round((outH * maxRes) / outW);
          outW = maxRes;
        } else {
          outW = Math.round((outW * maxRes) / outH);
          outH = maxRes;
        }
      }

      outCanvas.width = outW;
      outCanvas.height = outH;
      const outCtx = outCanvas.getContext('2d');

      // Lukis bahagian resit yang sudah dipotong (meja dibuang)
      outCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

      // 3. Penapis Pencerahan Dokumen (Tingkatkan Kontras & Buang Bayang Kertas Kelabu)
      const outImgData = outCtx.getImageData(0, 0, outW, outH);
      const d = outImgData.data;

      const contrast = 1.35; // Kuatkan ketajaman tulisan
      const brightness = 28; // Terangkan latar putih kertas
      const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));

      for (let i = 0; i < d.length; i += 4) {
        let r = d[i];
        let g = d[i+1];
        let b = d[i+2];

        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        // Jika kawasan latar (kertas kelabu/kuning/ada bayang), putihkan ia
        if (gray > 130) {
          r = Math.min(255, r * 1.18 + 25);
          g = Math.min(255, g * 1.18 + 25);
          b = Math.min(255, b * 1.18 + 25);
        } else {
          // Jika dakwat hitam (terutama tulisan resit yang pudar), gelapkan sedikit
          r = Math.max(0, r * 0.88);
          g = Math.max(0, g * 0.88);
          b = Math.max(0, b * 0.88);
        }

        // Terapkan penapis kontras akhir
        d[i]   = Math.min(255, Math.max(0, factor * (r - 128) + 128 + brightness));
        d[i+1] = Math.min(255, Math.max(0, factor * (g - 128) + 128 + brightness));
        d[i+2] = Math.min(255, Math.max(0, factor * (b - 128) + 128 + brightness));
      }

      outCtx.putImageData(outImgData, 0, 0);
      resolve(outCanvas.toDataURL('image/jpeg', 0.88));
    };
    img.src = imageSrc;
  });
}

// Jana PDF berasaskan gambar yang sudah dipotong & dicerahkan
function createReceiptPdfBlob() {
  return new Promise((resolve) => {
    const { jsPDF } = window.jspdf;
    const img = new Image();
    img.src = capturedImageBase64;
    img.onload = function() {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pageWidth - 20;
      const imgHeight = (img.height * imgWidth) / img.width;

      pdf.addImage(img, 'JPEG', 10, 10, imgWidth, Math.min(imgHeight, pageHeight - 20));
      const blob = pdf.output('blob');
      resolve(blob);
    };
  });
}

// Simpan fail PDF sahaja
async function downloadPdfDirectly() {
  if (!capturedImageBase64) return;
  statusDiv.innerHTML = '<span class="loader"></span>Menjana fail PDF...';
  const blob = await createReceiptPdfBlob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `resit_bersih_${Date.now()}.pdf`;
  link.click();
  statusDiv.innerHTML = '✅ PDF bersih berjaya disimpan di telefon!';
}

// Hantar PDF yang sudah bersih ke Gemini AI Cloud Run
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

// Paparkan data ke jadual
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
