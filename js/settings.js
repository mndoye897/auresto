function load() {
  const data = AurestoStore.load();
  if (!data.onboardingComplete) { location.href = 'onboarding.html'; return; }

  document.getElementById('sName').value = data.restaurant.name || '';
  document.getElementById('sAddress').value = data.restaurant.address || '';
  document.getElementById('sDesc').value = data.restaurant.description || '';
  document.getElementById('sColorPrimary').value = data.branding?.colors?.primary || '#124d58';
  document.getElementById('sColorAccent').value = data.branding?.colors?.accent || '#e8a878';
  document.getElementById('sEmail').value = data.account.email || '';
  document.getElementById('currentPlan').textContent = data.plan;
  document.getElementById('tableCount').textContent = `${data.tables.length} table${data.tables.length > 1 ? 's' : ''} configurée${data.tables.length > 1 ? 's' : ''}`;
  document.getElementById('sQrHeader').value = data.qrConfig?.headerTemplate || 'Table {name}';
  document.getElementById('sQrFooter').value = data.qrConfig?.footerText || 'Scannez pour commander';
  document.getElementById('sQrLayout').value = data.qrConfig?.printLayout || 'chevalet';

  // Populate sub details
  const subDetails = document.getElementById('settingsSubDetails');
  if (subDetails && data.subInfo) {
    const sub = data.subInfo;
    if (sub.expiresAt) {
      const expDate = new Date(sub.expiresAt).toLocaleDateString('fr-FR');
      subDetails.innerHTML = `Statut : <strong>${sub.status}</strong> • Expiration le <strong>${expDate}</strong> (${sub.daysRemaining !== null ? sub.daysRemaining + ' jours restants' : ''}).`;
    } else {
      subDetails.innerHTML = `Offre permanente Free sans date d'expiration. Passez à Silver (25 000 FCFA/mois) ou Gold (40 000 FCFA/mois) pour les fonctionnalités avancées.`;
    }
  }

  const renewBtn = document.getElementById('settingsRenewBtn');
  if (renewBtn) {
    renewBtn.addEventListener('click', async () => {
      const rid = localStorage.getItem('auresto_restaurant_id');
      if (!rid) return alert('Restaurant non synchronisé avec le serveur.');
      try {
        const res = await fetch((window.AURESTO_API_BASE || 'http://localhost:4000') + '/api/payments/wave/create-checkout', {
          method: 'POST',
          headers: getRestaurantAuthHeaders(),
          body: JSON.stringify({
            restaurantId: rid,
            type: 'SUBSCRIPTION',
            plan: (data.plan || 'Silver').toUpperCase(),
            amount: (data.plan || '').toUpperCase() === 'GOLD' ? 40000 : 25000,
            title: `Renouvellement Abonnement Auresto ${data.plan || 'Silver'}`,
            account: data.account || null,
            successUrl: location.origin + '/dashboard.html?payment=success',
            cancelUrl: location.origin + '/settings.html'
          })
        });
        const waveRes = await res.json();
        if (waveRes.checkoutUrl) {
          location.href = waveRes.checkoutUrl;
        } else {
          alert(waveRes.message || 'L\'architecture Wave est prête ! Le paiement en ligne s\'activera dès réception de votre clé API Wave Business.');
        }
      } catch (e) {
        alert('Paiement Wave prêt pour intégration API.');
      }
    });
  }

  HoursPicker.init('settingsHoursGrid', 'settingsHoursSummary');
  if (data.restaurant?.hoursSchedule && Object.keys(data.restaurant.hoursSchedule).length) {
    HoursPicker.load(data.restaurant.hoursSchedule);
  }
}

function saveQrSettings() {
  const data = AurestoStore.load();
  data.qrConfig = {
    ...data.qrConfig,
    headerTemplate: document.getElementById('sQrHeader').value.trim() || 'Table {name}',
    footerText: document.getElementById('sQrFooter').value.trim() || 'Scannez pour commander',
    printLayout: document.getElementById('sQrLayout').value || 'chevalet'
  };
  AurestoStore.save(data);
}

async function generateQrCanvas(url, size = 120) {
  const canvas = document.createElement('canvas');
  if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
    try {
      await new Promise((resolve, reject) => {
        QRCode.toCanvas(canvas, url, { width: size, margin: 1 }, err => {
          if (err) reject(err); else resolve();
        });
      });
      return canvas;
    } catch (e) {
      console.warn('QRCode JS failed, using fallback:', e);
    }
  }
  return new Promise(resolve => {
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas);
    };
    img.onerror = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#124d58';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('QR Code', size / 2, size / 2);
      resolve(canvas);
    };
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
  });
}

async function downloadSettingsPdf() {
  saveQrSettings();
  const { jsPDF } = window.jspdf;
  const data = AurestoStore.load();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const formatLabels = { chevalet: 'Chevalet de table', autocollant: 'Autocollant', affiche: 'Affiche' };
  doc.setFontSize(16);
  doc.text(data.restaurant.name || 'Auresto', 105, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`${formatLabels[data.qrConfig.printLayout] || 'QR Codes'}`, 105, 28, { align: 'center' });
  let y = 38;
  for (const table of data.tables) {
    const canvas = await generateQrCanvas(AurestoStore.getTableUrl(table.id), 120);
    const imgData = canvas.toDataURL('image/png');
    if (y > 250) { doc.addPage(); y = 20; }
    doc.addImage(imgData, 'PNG', 20, y, 45, 45);
    doc.setFontSize(12);
    doc.text((data.qrConfig.headerTemplate || 'Table {name}').replace('{name}', table.name), 70, y + 12);
    doc.setFontSize(9);
    doc.text(data.qrConfig.footerText || 'Scannez pour commander', 70, y + 22);
    y += 60;
  }
  doc.save(`auresto-qr-${data.restaurant.name || 'restaurant'}.pdf`);
}

async function downloadSettingsWord() {
  saveQrSettings();
  const data = AurestoStore.load();
  const rows = await Promise.all(data.tables.map(async table => {
    const canvas = await generateQrCanvas(AurestoStore.getTableUrl(table.id), 200);
    const imgData = canvas.toDataURL('image/png');
    return `
      <div style="margin-bottom:30px;padding:16px;border:1px solid #ddd;border-radius:14px;max-width:480px;">
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${(data.qrConfig.headerTemplate || 'Table {name}').replace('{name}', table.name)}</div>
        <div style="font-size:13px;color:#555;margin-bottom:10px;">${data.restaurant.name}</div>
        <img src="${imgData}" style="width:200px;height:200px;object-fit:contain;margin-bottom:10px;" />
        <div style="font-size:12px;color:#444;">${data.qrConfig.footerText || 'Scannez pour commander'}</div>
      </div>
    `;
  }));
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>QR Codes Auresto</title></head><body>${rows.join('')}</body></html>`;
  const blob = new Blob([html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auresto-qr-${data.restaurant.name || 'restaurant'}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('saveBtn').addEventListener('click', () => {
  const data = AurestoStore.load();
  const hoursData = HoursPicker.getData();
  data.restaurant.name = document.getElementById('sName').value.trim();
  data.restaurant.address = document.getElementById('sAddress').value.trim();
  data.restaurant.description = document.getElementById('sDesc').value.trim();
  data.restaurant.hours = hoursData.summary;
  data.restaurant.hoursSchedule = hoursData.schedule;
  data.branding.colors.primary = document.getElementById('sColorPrimary').value;
  data.branding.colors.accent = document.getElementById('sColorAccent').value;
  saveQrSettings();
  AurestoStore.save(data);
  const t = document.getElementById('toast');
  t.textContent = 'Paramètres enregistrés !';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
});

document.getElementById('downloadQrPdfBtn').addEventListener('click', downloadSettingsPdf);
document.getElementById('downloadQrWordBtn').addEventListener('click', downloadSettingsWord);

document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('Réinitialiser toutes les données ? Cette action est irréversible.')) {
    AurestoStore.reset();
    location.href = 'onboarding.html';
  }
});

AurestoStore.init().then(load);
