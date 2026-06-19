// Fonction serverless Vercel — /api/stats
// Interroge la base Notion et renvoie :
//   - daysSinceContact : jours depuis le dernier "Last Contact" parmi les candidatures "En attente"
//   - totalApplications : candidatures hors statuts "Backlog" et "À faire"
//   - recordDays : record de silence partagé, stocké dans Upstash Redis
// La clé API Notion reste secrète côté serveur, jamais exposée au navigateur.

import { Redis } from '@upstash/redis';

const STATUS_EXCLUDED = ['Backlog', 'À faire'];

function getStatusValue(page, propName) {
  const prop = page.properties[propName];
  return prop?.select?.name ?? prop?.status?.name ?? null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const NOTION_API_KEY    = process.env.NOTION_API_KEY;
  const DATABASE_ID       = process.env.NOTION_DATABASE_ID;
  const DATE_PROP         = process.env.NOTION_DATE_PROPERTY   || 'Last Contact';
  const STATUS_PROP       = process.env.NOTION_STATUS_PROPERTY || 'Status';
  const STATUS_PENDING    = process.env.NOTION_STATUS_VALUE    || 'En attente';

  if (!NOTION_API_KEY || !DATABASE_ID) {
    return res.status(500).json({ error: 'Variables NOTION_API_KEY ou NOTION_DATABASE_ID manquantes' });
  }

  try {
    // ── 1. Récupérer toutes les lignes de la base Notion ─────────────────────
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

    // ── 2. Total candidatures : tous statuts sauf Backlog et "À faire" ───────
    const totalApplications = allResults.filter(page => {
      const status = getStatusValue(page, STATUS_PROP);
      return !STATUS_EXCLUDED.includes(status);
    }).length;

    // ── 3. Dernier "Last Contact" parmi les candidatures "En attente" ─────────
    let mostRecentPendingDate = null;

    for (const page of allResults) {
      if (getStatusValue(page, STATUS_PROP) !== STATUS_PENDING) continue;
      const dateProp = page.properties[DATE_PROP];
      if (dateProp?.type === 'date' && dateProp.date?.start) {
        const d = new Date(dateProp.date.start);
        if (!mostRecentPendingDate || d > mostRecentPendingDate) {
          mostRecentPendingDate = d;
        }
      }
    }

    // ── 4. Calcul des jours depuis ce dernier contact ─────────────────────────
    let daysSinceContact = 0;
    if (mostRecentPendingDate) {
      daysSinceContact = Math.floor((Date.now() - mostRecentPendingDate) / 86_400_000);
    }

    // ── 5. Record partagé via Upstash Redis ───────────────────────────────────
    // Variables d'environnement attendues : UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN
    // (ajoutées automatiquement par l'intégration Vercel <> Upstash)
    let record = 0;
    try {
      const redis = new Redis({
        url:   process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      record = (await redis.get('record_days')) || 0;
      if (daysSinceContact > record) {
        record = daysSinceContact;
        await redis.set('record_days', record);
      }
    } catch (redisError) {
      // Upstash non configuré → record reste à 0, l'API continue de fonctionner
      console.error('Redis non disponible :', redisError.message);
    }

    return res.status(200).json({
      lastResponseDate:  mostRecentPendingDate?.toISOString() ?? null,
      daysSinceContact,
      totalApplications,
      recordDays:        record,
      updatedAt:         new Date().toISOString()
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
