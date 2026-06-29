// Remplacez par l'URL de votre fonction Vercel une fois déployée
const API_URL = 'https://job-tracker-taupe-eight.vercel.app/api/stats';

let weekChart = null;

function getMessages(days) {
  if (days === 0) return "le silence vient de commencer";
  if (days < 7)  return "encore dans la marge de politesse";
  if (days < 14) return "la marge de politesse a expiré";
  if (days < 30) return "ghosting confirmé";
  if (days < 60) return "silence radio niveau expert";
  return "candidature probablement archivée dans une autre dimension";
}

function formatWeekLabel(isoDate) {
  // "2025-03-10" → "10/03"
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

function renderChart(weeklyData) {
  const ctx = document.getElementById('weekChart').getContext('2d');
  const labels = weeklyData.map(w => formatWeekLabel(w.week));
  const counts  = weeklyData.map(w => w.count);

  if (weekChart) weekChart.destroy();

  weekChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: counts,
        backgroundColor: 'rgba(43,246,255,0.25)',
        borderColor:     '#2bf6ff',
        borderWidth:     1,
        borderRadius:    2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0a0a0a',
          borderColor: '#2bf6ff',
          borderWidth: 1,
          titleColor: '#2bf6ff',
          bodyColor: '#f6ff2b',
          callbacks: {
            title: (items) => `sem. du ${items[0].label}`,
            label: (item)  => `${item.raw} candidature${item.raw > 1 ? 's' : ''}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#4a4a52',
            font: { size: 9 },
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 12,
          },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: {
            color: '#4a4a52',
            font: { size: 9 },
            stepSize: 1,
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
          beginAtZero: true,
        }
      }
    }
  });
}

async function loadStats() {
  const statusText   = document.getElementById('statusText');
  const dayCounterEl = document.getElementById('dayCounter');
  const counterSub   = document.getElementById('counterSub');
  const lastSyncEl   = document.getElementById('lastSync');

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('réponse API invalide');
    const data = await response.json();

    const days = data.daysSinceOldest ?? 0;

    dayCounterEl.textContent = days;
    counterSub.textContent   = getMessages(days);

    document.getElementById('pendingCount').textContent = data.pendingCount      ?? '--';
    document.getElementById('expiredCount').textContent = data.expiredCount      ?? '--';
    document.getElementById('totalApps').textContent    = data.totalApplications ?? '--';

    const ghostRate = data.totalApplications > 0
      ? Math.round((data.expiredCount / data.totalApplications) * 100)
      : 0;
    document.getElementById('ghostRate').textContent = ghostRate + '%';

    if (days >= 21) dayCounterEl.classList.add('alert');

    const syncTime = new Date(data.updatedAt || Date.now());
    lastSyncEl.textContent = syncTime.toLocaleString('fr-FR', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
    });

    statusText.textContent = 'connecté au CRM';

    if (data.weeklyData && data.weeklyData.length > 0) {
      renderChart(data.weeklyData);
    }

  } catch (err) {
    statusText.textContent   = 'connexion impossible';
    dayCounterEl.textContent = 'ERR';
    counterSub.textContent   = 'vérifiez la config API';
    console.error(err);
  }
}

loadStats();
setInterval(loadStats, 5 * 60 * 1000);