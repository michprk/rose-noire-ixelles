/**
 * ==========================================================================
 * Rose Noire — API des formulaires (devis entreprise, commande de bouquet)
 * Cloudflare Worker (offre gratuite : 100 000 requêtes par jour).
 *
 * Le site (GitHub Pages) reste 100 % statique : il envoie la demande ici,
 * et c’est ici seulement que se trouvent les clés secrètes (jamais dans le site).
 *
 * Variables (wrangler.toml ou tableau de bord Cloudflare) :
 *   ALLOWED_ORIGIN   origine(s) autorisée(s), ex. https://michprk.github.io,https://rose-noire.be
 *   SHOP_EMAIL       boîte qui reçoit les demandes, ex. rosenoire160@hotmail.com
 *   FROM_EMAIL       expéditeur vérifié chez Resend, ex. Rose Noire <site@rose-noire.be>
 * Secret (npx wrangler secret put RESEND_API_KEY) :
 *   RESEND_API_KEY   clé de l’API Resend (envoi des e-mails)
 * Liaison KV facultative :
 *   RATE_LIMIT       limite à 5 demandes par tranche de 10 minutes et par adresse IP
 * ==========================================================================
 */

const FORMS = {
  devis: { subject: 'Demande de devis', required: ['name', 'email'], own: ['besoin', 'societe', 'quand'] },
  commande: { subject: 'Commande de fleurs', required: ['name', 'email', 'phone', 'budget', 'date', 'mode'], own: ['produit', 'occasion', 'mode', 'budget', 'date', 'adresse', 'style'] },
};
const ENUMS = {
  besoin: { accueil: 'Fleurs d’accueil', evenement: 'Événement', cadeaux: 'Cadeaux d’affaires', decor: 'Décor durable' },
  occasion: { anniversaire: 'Anniversaire', amour: 'Amour', naissance: 'Naissance', merci: 'Merci', deuil: 'Deuil', plaisir: 'Pour le plaisir' },
  mode: { livraison: 'Livraison (15 €)', retrait: 'Retrait en boutique' },
  produit: { bouquets: 'Bouquet de saison', mariage: 'Fleurs de mariage', deuil: 'Gerbe ou couronne de deuil', sechees: 'Fleurs séchées', artificielles: 'Fleurs artificielles', plantes: 'Plantes & cactus', vases: 'Vases, cache-pots & bougies', livraison: 'Livraison d’un bouquet' },
};
const LABELS = { besoin: 'Besoin', societe: 'Société', quand: 'Pour quand', produit: 'Choix', occasion: 'Occasion', mode: 'Réception', budget: 'Budget', date: 'Date souhaitée', adresse: 'Adresse de livraison', style: 'Style et couleurs', name: 'Nom', email: 'E-mail', phone: 'Téléphone', message: 'Message' };
const SPECIFIC = ['besoin', 'societe', 'quand', 'produit', 'occasion', 'mode', 'budget', 'date', 'adresse', 'style'];
const MAX = { societe: 80, quand: 80, adresse: 160, style: 120, name: 80, email: 120, phone: 24, budget: 8, message: 1500 };
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;
const PHONE_RE = /^\+?[0-9 ()./-]{8,20}$/;
const MAX_BODY = 8 * 1024;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin) ? origin : allowed[0] || 'null';

    if (request.method === 'OPTIONS') return reply(204, null, cors);
    if (url.pathname !== '/contact') return reply(404, { ok: false, error: 'Adresse inconnue.' }, cors);
    if (request.method !== 'POST') return reply(405, { ok: false, error: 'Méthode non autorisée.' }, cors);
    if (!allowed.includes(origin)) return reply(403, { ok: false, error: 'Origine non autorisée.' }, cors);
    if (!(request.headers.get('Content-Type') || '').includes('application/json')) return reply(415, { ok: false, error: 'Format non pris en charge.' }, cors);
    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply(413, { ok: false, error: 'Demande trop volumineuse.' }, cors);

    let data;
    try { data = JSON.parse(raw); } catch { return reply(400, { ok: false, error: 'Demande illisible.' }, cors); }
    const form = FORMS[data.form] ? data.form : null;
    if (!form) return reply(400, { ok: false, error: 'Formulaire inconnu.' }, cors);

    // Anti-spam 1 : champ piège rempli → on répond « OK » sans rien envoyer
    if (data.website) return reply(200, { ok: true }, cors);
    // Anti-spam 2 : envoi trop rapide pour un humain
    if (!(Number(data.elapsed) >= 3000)) return reply(400, { ok: false, error: 'Envoi trop rapide. Réessayez dans quelques secondes.' }, cors);
    // Anti-spam 3 : limite par adresse IP (si la liaison KV est configurée)
    if (env.RATE_LIMIT) {
      const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
      const key = 'rl:' + (await sha256(ip + (env.RATE_SALT || 'rose-noire')));
      const count = Number(await env.RATE_LIMIT.get(key)) || 0;
      if (count >= 5) return reply(429, { ok: false, error: 'Trop de demandes. Réessayez dans quelques minutes.' }, cors);
      ctx.waitUntil(env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 600 }));
    }

    // Nettoyage + validation (la même que dans le navigateur : on ne fait jamais confiance au client)
    const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
    const oneLine = (v, max) => clean(v, max).replace(/[\r\n\t]+/g, ' ');
    const f = {};
    Object.keys(LABELS).forEach((k) => {
      if (SPECIFIC.includes(k) && !FORMS[form].own.includes(k)) return;
      if (ENUMS[k]) { const v = String(data[k] ?? ''); if (Object.prototype.hasOwnProperty.call(ENUMS[k], v)) f[k] = v; }
      else if (k === 'date') { if (/^\d{4}-\d{2}-\d{2}$/.test(data.date || '')) f.date = data.date; }
      else if (k === 'message') { const v = clean(data[k], MAX.message); if (v) f[k] = v; }
      else { const v = oneLine(data[k], MAX[k] || 200); if (v) f[k] = v; }
    });
    const fields = {};
    const required = [...FORMS[form].required];
    if (form === 'commande' && f.mode === 'livraison') required.push('adresse');
    required.forEach((k) => { if (!f[k]) fields[k] = 'Ce champ est nécessaire.'; });
    if (f.email && !EMAIL_RE.test(f.email)) fields.email = 'Cette adresse e-mail ne semble pas valide.';
    if (f.phone && !PHONE_RE.test(f.phone)) fields.phone = 'Ce numéro ne semble pas valide.';
    if (f.budget) { const n = Number(f.budget.replace(',', '.')); if (!(n > 0 && n <= 5000)) fields.budget = 'Indiquez un budget en euros (ex. 60).'; }
    if (f.date) {
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
      if (f.date < today) fields.date = 'Cette date est déjà passée.';
      else if (f.mode === 'livraison' && new Date(f.date + 'T12:00:00Z').getUTCDay() === 1) fields.date = 'Pas de livraison le lundi : la boutique est fermée.';
    }
    if (f.adresse && f.adresse.length < 6) fields.adresse = 'Indiquez l’adresse de livraison.';
    if (f.message && (f.message.match(/https?:\/\/|www\./gi) || []).length > 1) fields.message = 'Un seul lien maximum dans le message.';
    if (Object.keys(fields).length) return reply(400, { ok: false, error: 'Merci de corriger les champs indiqués.', fields }, cors);

    // E-mail à la boutique (texte brut : aucun risque d’injection HTML)
    const lines = ['Nouvelle demande depuis le site Rose Noire — ' + FORMS[form].subject, ''];
    Object.keys(LABELS).forEach((k) => {
      if (!f[k]) return;
      let v = ENUMS[k] ? ENUMS[k][f[k]] : f[k];
      if (k === 'date') v = f.date.split('-').reverse().join('/');
      if (k === 'budget') v += ' €';
      if (k === 'message') lines.push('', v); else lines.push(LABELS[k] + ' : ' + v);
    });
    lines.push('', '— Envoyé le ' + new Date().toLocaleString('fr-BE', { timeZone: 'Europe/Brussels' }));

    if (!env.RESEND_API_KEY || !env.SHOP_EMAIL || !env.FROM_EMAIL) return reply(500, { ok: false, error: 'Service momentanément indisponible.' }, cors);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: [env.SHOP_EMAIL],
        reply_to: f.email,
        subject: FORMS[form].subject + ' via le site — ' + (f.societe || f.name || ''),
        text: lines.join('\n'),
      }),
    });
    if (!res.ok) return reply(502, { ok: false, error: 'Envoi impossible pour le moment. Appelez le +32 475 61 44 58.' }, cors);
    return reply(200, { ok: true }, cors);
  },
};

function reply(status, body, origin) {
  const headers = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (body === null) return new Response(null, { status, headers });
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
