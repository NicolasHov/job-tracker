// Remplacez par l'URL de votre fonction Vercel une fois déployée
const API_URL = 'https://job-tracker-taupe-eight.vercel.app/api/stats';
 
function getMessages(days) {
  if (days === 0) return "le silence vient de commencer";
  if (days < 7)  return "encore dans la marge de politesse";
  if (days < 14) return "la marge de politesse a expiré";
  if (days < 30) return "ghosting confirmé";
  if (days < 60) return "silence radio niveau expert";
  return "candidature probablement archivée dans une autre dimension";
}
 
async function loadStats() {
  const statusText  = document.getElementById('statusText');
  const dayCounterEl = document.getElementById('dayCounter');
  const counterSub  = document.getElementById('counterSub');
  const lastSyncEl  = document.getElementById('lastSync');
 
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('réponse API invalide');
    const data = await response.json();
 
    const days = data.daysSinceOldest ?? 0;
 
    dayCounterEl.textContent = days;
    counterSub.textContent   = getMessages(days);
 
    document.getElementById('pendingCount').textContent = data.pendingCount    ?? '--';
    document.getElementById('expiredCount').textContent = data.expiredCount    ?? '--';
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
 
  } catch (err) {
    statusText.textContent   = 'connexion impossible';
    dayCounterEl.textContent = 'ERR';
    counterSub.textContent   = 'vérifiez la config API';
    console.error(err);
  }
}
 
loadStats();
setInterval(loadStats, 5 * 60 * 1000);
