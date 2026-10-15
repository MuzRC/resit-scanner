// 1. Register Service Worker untuk PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW berdaftar:', reg.scope))
      .catch(err => console.log('SW gagal:', err));
  });
}

const cameraInput = document.getElementById('cameraInput');
const preview = document.getElementById('preview');
const previewContainer = document.getElementById('preview-container');
const actions = document.getElementById('actions');
const statusDiv = document.getElementById('status');
const resultCard = document.getElementById('resultCard');
const rawJson = document.getElementById('rawJson');
const backendUrlInput = document.getElementById('backendUrl');

// Simpan url backend ke localStorage supaya tak hilang bila buka balik
if (localStorage.getItem('resit_backend_url')) {
  backendUrlInput.value = localStorage.getItem('resit_backend_url');
}
backendUrlInput.addEventListener('change', () => {
  localStorage.setItem('resit_backend_url', backendUrlInput.value.trim());
});

let capturedImageBase64 = null;
let generatedPdfBlob = null;

// Tangkap dan paparkan imej resit
cameraInput.addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    capturedImageBase64 = event.target.result;
    preview.src = capturedImageBase64;
    previewContainer.style.display = 'block';
    actions.style.display = 'flex';
    resultCard.style.display = 'none';
    statusDiv.innerHTML = 'Resit sedia untuk diproses!';
  };
  reader.readAsDataURL(file);
});

// Fungsi pembantu jana PDF guna jsPDF
function createReceiptPdfBlob() {
  return new Promise((resolve) => {
    const { jsPDF } = window.jspdf;
    const img = new Image();
    img.src = capturedImageBase64;
    img.onload = function() {
      // Orientasi dokumen A4
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Kira nisbah aspek imej
      const imgWidth = pageWidth - 20; // Margin 10mm kiri kanan
      const imgHeight = (img.height * imgWidth) / img.width;

      pdf.addImage(img, 'JPEG', 10, 10, imgWidth, Math.min(imgHeight, pageHeight - 20));
      const blob = pdf.output('blob');
      resolve(blob);
    };
  });
}

// Muat turun PDF secara terus
async function downloadPdfDirectly() {
  if (!capturedImageBase64) return;
  statusDiv.innerHTML = '<span class="loader"></span>Menjana PDF...';
  const blob = await createReceiptPdfBlob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `resit_${Date.now()}.pdf`;
  link.click();
  statusDiv.innerHTML = '✅ PDF berjaya dimuat turun!';
}

// Hantar PDF ke Backend AI untuk ekstraksi data
async function processReceipt() {
  const backendUrl = backendUrlInput.value.trim();
  if (!backendUrl) {
    alert('Sila masukkan URL backend Cloud Run anda di ruangan atas terlebih dahulu!');
    backendUrlInput.focus();
    return;
  }

  statusDiv.innerHTML = '<span class="loader"></span>Menjana fail PDF di telefon...';
  const pdfBlob = await createReceiptPdfBlob();

  statusDiv.innerHTML = '<span class="loader"></span>Menghantar ke Google Gemini AI...';

  const formData = new FormData();
  formData.append('file', pdfBlob, 'receipt.pdf');

  try {
    const endpoint = backendUrl.endsWith('/') ? `${backendUrl}extract` : `${backendUrl}/extract`;
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Ralat pelayan: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    renderResult(data);
    statusDiv.innerHTML = '✅ Ekstraksi AI Selesai!';
  } catch (err) {
    console.error(err);
    statusDiv.innerHTML = `<span style="color: red;">❌ Ralat: ${err.message}</span>`;
  }
}

// Paparkan data JSON ke dalam kad keputusan
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
