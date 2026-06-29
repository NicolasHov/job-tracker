// Fonction serverless Vercel — /api/stats
import { Redis } from '@upstash/redis';
 
const STATUS_EXCLUDED = ['Backlog', 'À faire', 'Abandonné'];
const DATE_CUTOFF     = new Date('2025-03-01');
 
function getStatusValue(page, propName) {
  const prop = page.properties[propName];
  return prop?.select?.name ?? prop?.status?.name ?? null;
}
 
function getDateValue(page, propName) {
  const prop = page.properties[propName];
  if (prop?.type === 'date' && prop.date?.start) return new Date(prop.date.start);
  return null;
}
 
// Retourne le lundi de la semaine d'une date donnée (clé "YYYY-MM-DD")
function getWeekKey(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=dim, 1=lun...
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
 
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
 
  const NOTION_API_KEY = process.env.NOTION_API_KEY;
  const DATABASE_ID    = process.env.NOTION_DATABASE_ID;
  const DATE_PROP      = process.env.NOTION_DATE_PROPERTY   || 'Last Contact';
  const STATUS_PROP    = process.env.NOTION_STATUS_PROPERTY || 'Status';
  const STATUS_PENDING = process.env.NOTION_STATUS_VALUE    || 'En attente';
  const STATUS_EXPIRED = process.env.NOTION_EXPIRED_VALUE   || 'Périmé';
 
  if (!NOTION_API_KEY || !DATABASE_ID) {
    return res.status(500).json({ error: 'Variables NOTION_API_KEY ou NOTION_DATABASE_ID manquantes' });
  }
 
  try {
    // ── 1. Récupérer toutes les lignes ───────────────────────────────────────
    let allResults = [];
    let hasMore = true;
    let startCursor = undefined;
 
    while (hasMore) {
      const r = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ start_cursor: startCursor, page_size: 100 })
      });
      if (!r.ok) throw new Error(`Notion API ${r.status}: ${await r.text()}`);
      const data = await r.json();
      allResults = allResults.concat(data.results);
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }
 
    // ── 2. Pages actives (hors exclus + filtre mars 2025) ────────────────────
    const activePages = allResults.filter(page => {
      const status = getStatusValue(page, STATUS_PROP);
      if (STATUS_EXCLUDED.includes(status)) return false;
      const date = getDateValue(page, DATE_PROP);
      if (!date || date < DATE_CUTOFF) return false;
      return true;
    });
    const totalApplications = activePages.length;
 
    // ── 3. Candidatures "En attente" ─────────────────────────────────────────
    const pendingPages = allResults.filter(page =>
      getStatusValue(page, STATUS_PROP) === STATUS_PENDING
    );
    const pendingCount = pendingPages.length;
 
    // ── 4. Candidatures "Périmé" ─────────────────────────────────────────────
    const expiredCount = allResults.filter(page =>
      getStatusValue(page, STATUS_PROP) === STATUS_EXPIRED
    ).length;
 
    // ── 5. Plus ancienne date parmi les "En attente" ──────────────────────────
    let oldestPendingDate = null;
    for (const page of pendingPages) {
      const d = getDateValue(page, DATE_PROP);
      if (d && (!oldestPendingDate || d < oldestPendingDate)) {
        oldestPendingDate = d;
      }
    }
 
    // ── 6. Jours depuis la plus ancienne ─────────────────────────────────────
    let daysSinceOldest = 0;
    if (oldestPendingDate) {
      daysSinceOldest = Math.floor((Date.now() - oldestPendingDate) / 86_400_000);
    }
 
    // ── 7. Candidatures par semaine — basé sur created_time (date de création
    //    de la ligne Notion, proxy de la date d'envoi réelle) ─────────────────
    const weekMap = {};
    for (const page of activePages) {
      const d = page.created_time ? new Date(page.created_time) : null;
      if (!d) continue;
      const key = getWeekKey(d);
      weekMap[key] = (weekMap[key] || 0) + 1;
    }
    // Trier par date croissante et formater en tableau
    const weeklyData = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week, count }));
 
    // ── 8. Record partagé via Upstash Redis ───────────────────────────────────
    let record = 0;
    try {
      const redis = new Redis({
        url:   process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      record = (await redis.get('record_days')) || 0;
      if (daysSinceOldest > record) {
        record = daysSinceOldest;
        await redis.set('record_days', record);
      }
    } catch (redisError) {
      console.error('Redis non disponible :', redisError.message);
    }
 
    return res.status(200).json({
      oldestPendingDate:  oldestPendingDate?.toISOString() ?? null,
      daysSinceOldest,
      pendingCount,
      expiredCount,
      totalApplications,
      weeklyData,
      recordDays: record,
      updatedAt:  new Date().toISOString()
    });
 
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
