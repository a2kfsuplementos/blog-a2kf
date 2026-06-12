const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL || 'SUPABASE_URL_AQUI';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'SUPABASE_ANON_KEY_AQUI';
const SITE_URL = process.env.SITE_URL || 'https://blog.a2kfsuplementos.com.br';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_LIST_ID = parseInt(process.env.BREVO_LIST_ID || '5');
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const YAMPI_API_KEY = process.env.YAMPI_API_KEY || '';
const YAMPI_TOKEN = process.env.YAMPI_TOKEN || '';
const YAMPI_ALIAS = process.env.YAMPI_ALIAS || 'a2kf-suplementos2';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── FUNÇÃO REUTILIZÁVEL DE NOTIFICAÇÃO ──────────────────────────────────────
async function sendNewsletterNotification({ postTitle, postSlug, postExcerpt, postCategory, coverUrl }) {
  const postUrl = `${SITE_URL}/post/${postSlug}`;
  const categoryLabel = postCategory ? `<span style="background:#FFD400;color:#000;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:3px 10px;font-family:sans-serif;">${postCategory}</span>` : '';
  const coverHtml = coverUrl ? `<img src="${coverUrl}" alt="${postTitle}" style="width:100%;max-height:300px;object-fit:cover;display:block;margin-bottom:0;" />` : '';
  const excerptHtml = postExcerpt ? `<p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 1.5rem;">${postExcerpt}</p>` : '';

  const htmlContent = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background:#fff;border-top:4px solid #FFD400;">
        <tr><td style="background:#0A0A0A;padding:20px 32px;border-bottom:3px solid #FFD400;text-align:center;">
          <img src="https://blog.a2kfsuplementos.com.br/logo.png" alt="A2KF Suplementos" style="height:60px;width:auto;" />
        </td></tr>
        ${coverHtml ? `<tr><td style="padding:0;">${coverHtml}</td></tr>` : ''}
        <tr><td style="padding:32px;">
          <p style="color:#888;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Novo artigo publicado</p>
          ${categoryLabel ? `<div style="margin-bottom:16px;">${categoryLabel}</div>` : ''}
          <h1 style="font-family:Arial,sans-serif;font-size:28px;font-weight:900;color:#0A0A0A;line-height:1.1;margin:0 0 16px;">${postTitle}</h1>
          ${excerptHtml}
          <a href="${postUrl}" style="display:inline-block;background:#FFD400;color:#000;font-weight:700;font-size:14px;letter-spacing:1px;text-transform:uppercase;padding:14px 28px;text-decoration:none;margin-bottom:32px;">Ler artigo completo →</a>
          <hr style="border:none;border-top:1px solid #e5e5e0;margin:24px 0;" />
          <p style="color:#aaa;font-size:12px;line-height:1.6;margin:0;">Você está recebendo este email porque se inscreveu na newsletter da A2KF Suplementos.</p>
        </td></tr>
        <tr><td style="background:#0A0A0A;padding:20px 32px;text-align:center;">
          <p style="color:#444;font-size:11px;margin:0;">© 2026 <span style="color:#FFD400;">A2KF Suplementos</span> · Todos os direitos reservados</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const listRes = await new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.brevo.com',
      path: `/v3/contacts/lists/${BREVO_LIST_ID}/contacts?limit=500&offset=0`,
      method: 'GET',
      headers: { 'api-key': BREVO_API_KEY, 'Accept': 'application/json' },
    };
    const r = https.request(opts, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve({ status: response.statusCode, body: data }));
    });
    r.on('error', reject);
    r.end();
  });

  const parsed = JSON.parse(listRes.body || '{}');
  const contacts = (parsed.contacts || []).filter(c => c.email && !c.emailBlacklisted);
  if (!contacts.length) return { sent: 0, errors: 0 };

  let sent = 0, errors = 0;
  const BATCH_SIZE = 10;
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (contact) => {
      const payload = JSON.stringify({
        sender: { name: 'A2KF Suplementos', email: 'no-reply@a2kfsuplementos.com.br' },
        to: [{ email: contact.email }],
        subject: `📢 Novo artigo: ${postTitle}`,
        htmlContent,
      });
      try {
        const result = await new Promise((resolve, reject) => {
          const opts = {
            hostname: 'api.brevo.com',
            path: '/v3/smtp/email',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY, 'Content-Length': Buffer.byteLength(payload) },
          };
          const r = https.request(opts, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve({ status: response.statusCode }));
          });
          r.on('error', reject);
          r.write(payload);
          r.end();
        });
        if (result.status === 201) sent++; else errors++;
      } catch { errors++; }
    }));
  }
  return { sent, errors };
}

// ─── CRON: Publica posts agendados ───────────────────────────────────────────
async function checkScheduledPosts() {
  try {
    const now = new Date().toISOString();
    console.log(`[scheduler] Verificando posts agendados... (${now})`);

    const { data: posts, error } = await supabase
      .from('posts')
      .select('*')
      .eq('published', false)
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now);

    if (error) { console.error('[scheduler] Erro na query:', error.message); return; }
    if (!posts || !posts.length) { console.log('[scheduler] Nenhum post para publicar.'); return; }

    console.log(`[scheduler] ${posts.length} post(s) para publicar.`);

    for (const post of posts) {
      // ── CORREÇÃO: created_at recebe a data/hora real de publicação ──
      const publishedAt = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('posts')
        .update({
          published: true,
          scheduled_at: null,
          created_at: publishedAt   // ← data exibida no post = data de publicação
        })
        .eq('id', post.id);

      if (updateError) {
        console.error(`[scheduler] Erro ao publicar "${post.title}":`, updateError.message);
        continue;
      }

      console.log(`[scheduler] ✓ Post publicado: "${post.title}" em ${publishedAt}`);

      try {
        await sendNewsletterNotification({
          postTitle: post.title,
          postSlug: post.slug || post.id,
          postExcerpt: post.excerpt || '',
          postCategory: post.category || '',
          coverUrl: post.cover_url || '',
        });
        console.log(`[scheduler] ✓ Inscritos notificados para: "${post.title}"`);
      } catch (e) {
        console.error(`[scheduler] Erro ao notificar inscritos:`, e.message);
      }
    }
  } catch (e) {
    console.error('[scheduler] Erro geral:', e.message);
  }
}

checkScheduledPosts();
setInterval(checkScheduledPosts, 60 * 1000);
console.log('[scheduler] Agendamento de posts ativo ✓');

// ─── PRODUTOS DESTAQUE (Yampi) ───────────────────────────────────────────────
app.get('/api/produtos-destaque', async (req, res) => {
  if (!YAMPI_API_KEY) return res.status(503).json({ error: 'YAMPI_API_KEY não configurada.' });

  try {
    const result = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.dooki.com.br',
        path: `/v2/${YAMPI_ALIAS}/catalog/products?include=images,skus&limit=8&page=1&sortBy=total_sold&sortDirection=desc`,
        method: 'GET',
        headers: {
          'User-Token': YAMPI_TOKEN,
          'User-Secret-Key': YAMPI_API_KEY,
          'Accept': 'application/json',
        },
      };
      const r = https.request(opts, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve({ status: response.statusCode, body: data }));
      });
      r.on('error', reject);
      r.end();
    });

    console.log(`[yampi] Status: ${result.status}`);

    if (result.status !== 200) {
      console.error('[yampi] Erro:', result.body.substring(0, 300));
      return res.status(502).json({ error: 'Erro ao buscar produtos.' });
    }

    const parsed = JSON.parse(result.body);

    const products = (parsed.data || []).map(p => {
      const skus = p.skus?.data || [];
      const price = skus.length
        ? Math.min(...skus.map(s => parseFloat(s.price_sale || s.price || 0)))
        : 0;
      const originalPrice = skus.length
        ? Math.min(...skus.map(s => parseFloat(s.price || 0)))
        : 0;
      const images = p.images?.data || [];
      const image = images.length
        ? (images[0].thumb?.url || images[0].small?.url || images[0].large?.url || images[0].url || '')
        : '';
      const productUrl = p.url?.startsWith('http')
        ? p.url
        : `https://www.a2kfsuplementos.com.br/${p.url || p.slug || p.id}`;
      return { id: p.id, name: p.name, slug: p.slug || '', image, price, originalPrice, url: productUrl };
    }).filter(p => p.name && p.price > 0);

    res.set('Cache-Control', 'public, max-age=600');
    res.json({ success: true, products });
  } catch (e) {
    console.error('[yampi] Erro:', e.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ─── GROQ KEY ────────────────────────────────────────────────────────────────
app.get('/api/groq-key', (req, res) => {
  if (!GROQ_API_KEY) return res.status(503).json({ error: 'GROQ_API_KEY não configurada.' });
  res.json({ key: GROQ_API_KEY });
});

// ─── NEWSLETTER (Brevo) ──────────────────────────────────────────────────────
app.post('/api/newsletter', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email inválido.' });
  }

  const payload = JSON.stringify({
    email,
    listIds: [BREVO_LIST_ID],
    updateEnabled: true,
  });

  const options = {
    hostname: 'api.brevo.com',
    path: '/v3/contacts',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY,
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  try {
    const result = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve({ status: response.statusCode, body: data }));
      });
      request.on('error', reject);
      request.write(payload);
      request.end();
    });

    if (result.status === 201 || result.status === 204) {
      return res.json({ success: true });
    }
    const parsed = JSON.parse(result.body || '{}');
    if (parsed.code === 'duplicate_parameter') {
      return res.json({ success: true, already: true });
    }
    console.error('Brevo error:', result.status, result.body);
    return res.status(500).json({ error: 'Erro ao cadastrar.' });
  } catch (e) {
    console.error('Newsletter error:', e);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// ─── NOTIFICAR INSCRITOS ─────────────────────────────────────────────────────
app.post('/api/notify-subscribers', async (req, res) => {
  const { postTitle, postSlug, postExcerpt, postCategory, coverUrl } = req.body;

  if (!postTitle || !postSlug) {
    return res.status(400).json({ error: 'postTitle e postSlug são obrigatórios.' });
  }

  const postUrl = `${SITE_URL}/post/${postSlug}`;
  const categoryLabel = postCategory ? `<span style="background:#FFD400;color:#000;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:3px 10px;font-family:sans-serif;">${postCategory}</span>` : '';
  const coverHtml = coverUrl ? `<img src="${coverUrl}" alt="${postTitle}" style="width:100%;max-height:300px;object-fit:cover;display:block;margin-bottom:0;" />` : '';
  const excerptHtml = postExcerpt ? `<p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 1.5rem;">${postExcerpt}</p>` : '';

  const htmlContent = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f2;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background:#fff;border-top:4px solid #FFD400;">
        <tr><td style="background:#0A0A0A;padding:20px 32px;border-bottom:3px solid #FFD400;text-align:center;">
          <img src="https://blog.a2kfsuplementos.com.br/logo.png" alt="A2KF Suplementos" style="height:60px;width:auto;" />
        </td></tr>
        ${coverHtml ? `<tr><td style="padding:0;">${coverHtml}</td></tr>` : ''}
        <tr><td style="padding:32px;">
          <p style="color:#888;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Novo artigo publicado</p>
          ${categoryLabel ? `<div style="margin-bottom:16px;">${categoryLabel}</div>` : ''}
          <h1 style="font-family:Arial,sans-serif;font-size:28px;font-weight:900;color:#0A0A0A;line-height:1.1;margin:0 0 16px;">${postTitle}</h1>
          ${excerptHtml}
          <a href="${postUrl}" style="display:inline-block;background:#FFD400;color:#000;font-weight:700;font-size:14px;letter-spacing:1px;text-transform:uppercase;padding:14px 28px;text-decoration:none;margin-bottom:32px;">Ler artigo completo →</a>
          <hr style="border:none;border-top:1px solid #e5e5e0;margin:24px 0;" />
          <p style="color:#aaa;font-size:12px;line-height:1.6;margin:0;">Você está recebendo este email porque se inscreveu na newsletter da A2KF Suplementos.</p>
        </td></tr>
        <tr><td style="background:#0A0A0A;padding:20px 32px;text-align:center;">
          <p style="color:#444;font-size:11px;margin:0;">© 2026 <span style="color:#FFD400;">A2KF Suplementos</span> · Todos os direitos reservados</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  let contacts = [];
  try {
    const listRes = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.brevo.com',
        path: `/v3/contacts/lists/${BREVO_LIST_ID}/contacts?limit=500&offset=0`,
        method: 'GET',
        headers: { 'api-key': BREVO_API_KEY, 'Accept': 'application/json' },
      };
      const r = https.request(opts, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve({ status: response.statusCode, body: data }));
      });
      r.on('error', reject);
      r.end();
    });
    const parsed = JSON.parse(listRes.body || '{}');
    contacts = (parsed.contacts || []).filter(c => c.email && !c.emailBlacklisted);
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao buscar inscritos.' });
  }

  if (!contacts.length) return res.json({ success: true, sent: 0 });

  let sent = 0, errors = 0;
  const BATCH_SIZE = 10;
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (contact) => {
      const payload = JSON.stringify({
        sender: { name: 'A2KF Suplementos', email: 'no-reply@a2kfsuplementos.com.br' },
        to: [{ email: contact.email }],
        subject: `📢 Novo artigo: ${postTitle}`,
        htmlContent,
      });
      try {
        const result = await new Promise((resolve, reject) => {
          const opts = {
            hostname: 'api.brevo.com',
            path: '/v3/smtp/email',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY, 'Content-Length': Buffer.byteLength(payload) },
          };
          const r = https.request(opts, (response) => {
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve({ status: response.statusCode }));
          });
          r.on('error', reject);
          r.write(payload);
          r.end();
        });
        if (result.status === 201) sent++; else errors++;
      } catch { errors++; }
    }));
  }

  return res.json({ success: true, sent, errors });
});

// ─── REAÇÕES ─────────────────────────────────────────────────────────────────
// GET /api/reactions/:slug — retorna contagem de likes e dislikes
app.get('/api/reactions/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const { data, error } = await supabase
      .from('reactions')
      .select('type')
      .eq('post_slug', slug);

    if (error) return res.status(500).json({ error: error.message });

    const likes    = (data || []).filter(r => r.type === 'like').length;
    const dislikes = (data || []).filter(r => r.type === 'dislike').length;
    res.json({ success: true, likes, dislikes });
  } catch (e) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// POST /api/reactions — registra uma reação
app.post('/api/reactions', async (req, res) => {
  const { slug, type } = req.body;
  if (!slug || !['like', 'dislike'].includes(type)) {
    return res.status(400).json({ error: 'slug e type (like|dislike) são obrigatórios.' });
  }
  try {
    const { error } = await supabase
      .from('reactions')
      .insert([{ post_slug: slug, type }]);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ─── HOME ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── POST PAGE ───────────────────────────────────────────────────────────────
app.get('/post/:slug', async (req, res) => {
  const { slug } = req.params;

  const { data: post, error } = await supabase
    .from('posts')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single();

  if (error || !post) return res.status(404).send(notFoundPage());

  supabase.rpc('increment_views', { post_slug: slug }).then(() => {}).catch(() => {});
  const views = (post.views || 0) + 1;

  const plainText = (post.content || '').replace(/<[^>]*>/g, '').trim();
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const readMins = Math.max(1, Math.round(wordCount / 200));
  const readingTime = readMins === 1 ? '1 min de leitura' : readMins + ' min de leitura';

  const excerpt = post.excerpt || post.title;
  const image = post.cover_url || `${SITE_URL}/logo.png`;
  const url = `${SITE_URL}/post/${slug}`;
  const date = new Date(post.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${post.title} – A2KF Suplementos</title>
  <meta name="description" content="${excerpt}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${post.title}" />
  <meta property="og:description" content="${excerpt}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="A2KF Suplementos" />
  <meta property="article:published_time" content="${post.created_at}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${post.title}" />
  <meta name="twitter:description" content="${excerpt}" />
  <meta name="twitter:image" content="${image}" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/png" href="/logo.png" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "${post.title.replace(/"/g, '\\"')}",
    "description": "${(post.excerpt || post.title).replace(/"/g, '\\"')}",
    "image": "${image}",
    "datePublished": "${new Date(post.created_at).toISOString()}",
    "dateModified": "${new Date(post.updated_at || post.created_at).toISOString()}",
    "mainEntityOfPage": { "@type": "WebPage", "@id": "${url}" },
    "author": { "@type": "Organization", "name": "A2KF Suplementos", "url": "https://a2kfsuplementos.com.br" },
    "publisher": { "@type": "Organization", "name": "A2KF Suplementos", "logo": { "@type": "ImageObject", "url": "${SITE_URL}/logo.png", "width": 200, "height": 200 } }
    ${post.category ? `,"articleSection": "${post.category}"` : ''}
    ${post.cover_url ? `,"thumbnailUrl": "${post.cover_url}"` : ''}
  }
  </script>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-TN3RMJHTKX"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-TN3RMJHTKX');</script>
  <style>
    :root{--yellow:#FFD400;--black:#0A0A0A;--white:#fff;--gray:#F4F4F2;--border:#E5E5E0;--muted:#6B6B6B;}
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:'DM Sans',sans-serif;background:var(--white);color:var(--black);}
    nav{position:sticky;top:0;z-index:100;background:var(--black);border-bottom:3px solid var(--yellow);padding:0 1.25rem;display:flex;align-items:center;justify-content:space-between;height:110px;}
    .nav-logo{text-decoration:none;}.nav-logo img{height:95px;width:auto;display:block;}
    .nav-links{display:flex;gap:1.25rem;align-items:center;}
    .nav-links a{color:#ccc;text-decoration:none;font-size:14px;font-weight:500;transition:color .2s;}
    .nav-links a:hover{color:var(--yellow);}
    .nav-social{display:flex;gap:.5rem;align-items:center;}
    .nav-social-icon{color:#888;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border:1px solid #222;transition:all .2s;}
    .nav-social-icon:hover{color:var(--yellow);border-color:var(--yellow);background:#111;}
    .post-hero{background:var(--black);color:var(--white);padding:1.5rem 1.25rem 1.75rem;border-bottom:3px solid var(--yellow);}
    .post-hero-inner{max-width:800px;margin:0 auto;}
    .post-meta{display:flex;gap:.75rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap;}
    .post-category{background:var(--yellow);color:var(--black);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:3px 10px;}
    .post-date{font-size:12px;color:#888;}
    .post-read-time{font-size:12px;color:#FFD400;display:flex;align-items:center;gap:4px;font-weight:600;}
    .post-views{font-size:12px;color:#888;display:flex;align-items:center;gap:4px;}
    .post-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(1.8rem,7vw,4rem);line-height:1;letter-spacing:1px;}
    .post-excerpt{color:#aaa;font-size:clamp(.9rem,3.5vw,1.1rem);line-height:1.6;margin-top:.75rem;max-width:640px;}
    .post-cover-wrap{position:relative;background:#111;overflow:hidden;}
    .post-cover-wrap::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.05) 50%,transparent 100%);animation:shimmer 1.4s infinite;z-index:1;}
    .post-cover-wrap.loaded::before{display:none;}
    .post-cover{width:100%;max-height:480px;object-fit:cover;display:block;opacity:0;transition:opacity .5s ease;}
    .post-cover.loaded{opacity:1;}
    @keyframes shimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
    .post-search{background:var(--gray);border-bottom:1px solid var(--border);padding:.75rem 1.25rem;display:flex;justify-content:center;}
    .post-search-inner{display:flex;gap:0;width:100%;max-width:560px;}
    .post-search input{flex:1;padding:10px 14px;border:2px solid var(--border);border-right:none;font-family:'DM Sans',sans-serif;font-size:16px;outline:none;transition:border-color .2s;}
    .post-search input:focus{border-color:var(--yellow);}
    .post-search button{background:var(--yellow);color:var(--black);border:none;padding:10px 16px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;}
    .post-body{max-width:800px;margin:0 auto;padding:2rem 1.25rem;}
    .post-body h2{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;letter-spacing:1px;margin:2rem 0 .75rem;}
    .post-body h3{font-size:1.1rem;font-weight:700;margin:1.5rem 0 .5rem;}
    .post-body p{font-size:16px;line-height:1.85;color:#222;margin-bottom:1.25rem;}
    .post-body ul,.post-body ol{padding-left:1.5rem;margin-bottom:1.25rem;}
    .post-body li{font-size:16px;line-height:1.85;color:#222;margin-bottom:.4rem;}
    .post-body blockquote{border-left:4px solid var(--yellow);padding:1rem 1.25rem;background:var(--gray);margin:1.5rem 0;font-style:italic;color:#444;}
    .post-body img{width:100%;height:auto;margin:1.5rem 0;}
    .post-body a{color:var(--black);font-weight:700;border-bottom:2px solid var(--yellow);text-decoration:none;}
    .newsletter-box{background:var(--black);color:var(--white);padding:2rem 1.25rem;margin-top:3rem;text-align:center;border-top:4px solid var(--yellow);}
    .newsletter-box h3{font-family:'Bebas Neue',sans-serif;font-size:clamp(1.6rem,5vw,2rem);letter-spacing:1px;margin-bottom:.5rem;}
    .newsletter-box p{color:#aaa;font-size:14px;margin-bottom:1.5rem;}
    .newsletter-form{display:flex;flex-wrap:wrap;gap:.75rem;max-width:460px;margin:0 auto;}
    .newsletter-form input{flex:1;min-width:200px;padding:12px 18px;border:none;font-family:'DM Sans',sans-serif;font-size:16px;outline:none;background:#1a1a1a;color:#fff;border:2px solid #333;transition:border-color .2s;}
    .newsletter-form input:focus{border-color:var(--yellow);}
    .newsletter-form button{width:100%;background:var(--yellow);color:var(--black);border:none;padding:12px 22px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:13px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:opacity .2s;}
    .newsletter-form button:hover{opacity:.9;}
    .newsletter-msg{margin-top:1rem;font-size:13px;min-height:20px;}
    .share-box{border-top:2px solid var(--border);margin-top:3rem;padding-top:2rem;}
    .share-box h4{font-family:'Bebas Neue',sans-serif;font-size:1.4rem;letter-spacing:1px;margin-bottom:1rem;}
    /* REAÇÕES */
    .reactions-box{border-top:2px solid var(--border);margin-top:3rem;padding-top:2rem;display:flex;flex-direction:column;align-items:center;gap:1rem;text-align:center;}
    .reactions-label{font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);}
    .reactions-btns{display:flex;gap:1rem;}
    .rx-btn{display:flex;flex-direction:column;align-items:center;gap:6px;background:var(--gray);border:2px solid var(--border);border-radius:0;padding:14px 32px;cursor:pointer;transition:all .2s;min-width:110px;font-family:'DM Sans',sans-serif;}
    .rx-btn:hover{border-color:#aaa;background:#eee;}
    .rx-btn.voted-like{background:#fff8e1;border-color:var(--yellow);}
    .rx-btn.voted-dislike{background:#fff0f0;border-color:#e53e3e;}
    .rx-btn:disabled{cursor:default;}
    .rx-icon{font-size:26px;line-height:1;}
    .rx-count{font-family:'Bebas Neue',sans-serif;font-size:1.6rem;line-height:1;color:var(--black);}
    .rx-text{font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);}
    .rx-bar-wrap{width:100%;max-width:240px;background:var(--border);height:5px;border-radius:99px;overflow:hidden;}
    .rx-bar{height:100%;background:var(--yellow);border-radius:99px;transition:width .4s ease;}
    .rx-pct{font-size:12px;color:var(--muted);}
    @media(max-width:480px){.rx-btn{padding:12px 22px;min-width:90px;}.reactions-btns{gap:.75rem;}}
    .share-btns{display:flex;gap:.75rem;flex-wrap:wrap;}
    .share-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;cursor:pointer;border:none;text-decoration:none;transition:opacity .2s;flex:1;min-width:110px;justify-content:center;}
    .share-btn:hover{opacity:.85;}
    .share-btn-wpp{background:#25D366;color:#fff;}
    .share-btn-fb{background:#1877F2;color:#fff;}
    .share-btn-ig{background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);color:#fff;}
    .share-btn-copy{background:var(--black);color:#fff;}
    .share-btn-copy.copied{background:var(--yellow);color:var(--black);}
    .promo-banner{background:var(--yellow);padding:1.5rem 1.25rem;margin-top:3rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
    .promo-banner-text h3{font-family:'Bebas Neue',sans-serif;font-size:1.4rem;letter-spacing:1px;}
    .promo-banner-text p{font-size:14px;color:#333;margin-top:.25rem;}
    .related{background:var(--gray);padding:2rem 1.25rem;border-top:2px solid var(--border);}
    .related-inner{max-width:1100px;margin:0 auto;}
    .related h2{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;letter-spacing:1px;margin-bottom:1.25rem;}
    .related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1.25rem;}
    .related-card{background:var(--white);border:1.5px solid var(--border);text-decoration:none;color:inherit;display:block;transition:border-color .2s,transform .2s;}
    .related-card:hover{border-color:var(--yellow);transform:translateY(-3px);}
    .related-card-img{width:100%;height:160px;object-fit:cover;display:block;background:var(--black);}
    .related-card-placeholder{width:100%;height:160px;background:var(--black);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:2rem;color:var(--yellow);}
    .related-card-body{padding:1rem;}
    .related-card-cat{background:var(--yellow);color:var(--black);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:2px 8px;display:inline-block;margin-bottom:.5rem;}
    .related-card-title{font-family:'Bebas Neue',sans-serif;font-size:1.2rem;line-height:1.1;}
    footer{background:var(--black);border-top:3px solid var(--yellow);}
    .footer-inner{max-width:1100px;margin:0 auto;padding:2rem 1.25rem;display:flex;flex-direction:column;align-items:center;gap:1.25rem;}
    .footer-social{display:flex;gap:.75rem;flex-wrap:wrap;justify-content:center;}
    .footer-social-icon{display:flex;align-items:center;gap:8px;color:#666;text-decoration:none;font-size:13px;font-weight:500;padding:8px 12px;border:1px solid #222;transition:all .2s;}
    .footer-social-icon:hover{color:var(--yellow);border-color:var(--yellow);background:#111;}
    .footer-copy{color:#444;font-size:12px;text-align:center;}
    .footer-copy span{color:var(--yellow);}
    #read-progress{position:fixed;top:0;left:0;z-index:9999;height:3px;width:0%;background:var(--yellow);transition:width .1s linear;box-shadow:0 0 8px rgba(255,212,0,.6);}
    #backToTop{position:fixed;bottom:2rem;right:2rem;z-index:998;width:48px;height:48px;background:#FFD400;color:#0A0A0A;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.25);opacity:0;visibility:hidden;transform:translateY(12px);transition:opacity .3s ease,transform .3s ease,visibility .3s ease,background .2s;}
    #backToTop.visible{opacity:1;visibility:visible;transform:translateY(0);}
    #backToTop:hover{background:#e6be00;}
    @media(max-width:600px){
      nav{height:56px;}.nav-logo img{height:44px;}.nav-links{gap:.75rem;}.nav-social{display:none;}
      .post-title{font-size:clamp(1.6rem,9vw,2.5rem);}
      .share-btns{gap:.4rem;}
      .post-search{padding:.75rem 1rem;}
      .post-body{padding:1.25rem 1rem;}
      .newsletter-form{flex-direction:column;}
      .newsletter-form input{min-width:0;}
      .newsletter-form button{width:100%;}
      .related-grid{grid-template-columns:1fr;}
      .post-cover{max-height:220px;}
      #backToTop{bottom:1.25rem;right:1.25rem;width:42px;height:42px;}
    }
  </style>
</head>
<body>
<div id="read-progress"></div>
<nav>
  <a href="/" class="nav-logo"><img src="/logo.png" alt="A2KF Suplementos" /></a>
  <div class="nav-links">
    <a href="/">Blog</a>
    <a href="https://a2kfsuplementos.com.br">Loja</a>
    <div class="nav-social">
      <a href="https://www.instagram.com/a2kfsuplementos" target="_blank" rel="noopener" aria-label="Instagram" class="nav-social-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a>
      <a href="https://wa.me/5521977377802" target="_blank" rel="noopener" aria-label="WhatsApp" class="nav-social-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.134.558 4.133 1.535 5.865L.057 23.535a.75.75 0 00.908.908l5.67-1.478A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.92 0-3.72-.504-5.27-1.385l-.378-.219-3.924 1.022 1.022-3.924-.219-.378A9.952 9.952 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg></a>
      <a href="https://www.youtube.com/@A2KFSuplementos" target="_blank" rel="noopener" aria-label="YouTube" class="nav-social-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>
    </div>
  </div>
</nav>

<div class="post-search">
  <div class="post-search-inner">
    <input type="text" id="postSearchInput" placeholder="Buscar outros artigos..." onkeydown="if(event.key==='Enter') searchPosts()" />
    <button onclick="searchPosts()">Buscar</button>
  </div>
</div>

${post.cover_url ? `
<div class="post-cover-wrap" id="cover-wrap">
  <img src="${post.cover_url}" class="post-cover" alt="${post.title}" loading="eager" width="1200" height="480"
    onload="this.classList.add('loaded');this.parentElement.classList.add('loaded')"
    onerror="this.parentElement.style.display='none'" />
</div>` : ''}

<div class="post-hero">
  <div class="post-hero-inner">
    <div class="post-meta">
      ${post.category ? `<span class="post-category">${post.category}</span>` : ''}
      <span class="post-date">${date}</span>
      <span class="post-read-time">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${readingTime}
      </span>
      <span class="post-views">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        ${views.toLocaleString('pt-BR')} visualizações
      </span>
    </div>
    <h1 class="post-title">${post.title}</h1>
    ${post.excerpt ? `<p class="post-excerpt">${post.excerpt}</p>` : ''}
  </div>
</div>

<div class="post-body">
  ${post.content || ''}

  <!-- REAÇÕES -->
  <div class="reactions-box" id="reactionsBox">
    <p class="reactions-label">Este artigo foi útil?</p>
    <div class="reactions-btns">
      <button class="rx-btn" id="btnLike" onclick="sendReaction('like')" aria-label="Gostei">
        <span class="rx-icon">👍</span>
        <span class="rx-count" id="rxLikeCount">—</span>
        <span class="rx-text">Gostei</span>
      </button>
      <button class="rx-btn" id="btnDislike" onclick="sendReaction('dislike')" aria-label="Não gostei">
        <span class="rx-icon">👎</span>
        <span class="rx-count" id="rxDislikeCount">—</span>
        <span class="rx-text">Não gostei</span>
      </button>
    </div>
    <div class="rx-bar-wrap"><div class="rx-bar" id="rxBar" style="width:0%"></div></div>
    <p class="rx-pct" id="rxPct"></p>
  </div>

  <div class="share-box">
    <h4>GOSTOU? COMPARTILHE!</h4>
    <div class="share-btns">
      <a class="share-btn share-btn-wpp" href="https://wa.me/?text=${encodeURIComponent(post.title + ' - ' + url)}" target="_blank">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.134.558 4.133 1.535 5.865L.057 23.535a.75.75 0 00.908.908l5.67-1.478A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.92 0-3.72-.504-5.27-1.385l-.378-.219-3.924 1.022 1.022-3.924-.219-.378A9.952 9.952 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
        WhatsApp
      </a>
      <a class="share-btn share-btn-fb" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        Facebook
      </a>
      <a class="share-btn share-btn-ig" href="https://www.instagram.com/a2kfsuplementos" target="_blank">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
        Instagram
      </a>
      <button class="share-btn share-btn-copy" id="copyBtn" onclick="copyLink()">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copiar Link
      </button>
    </div>
  </div>

  <div class="promo-banner">
    <div class="promo-banner-text">
      <h3>ENCONTRE OS MELHORES SUPLEMENTOS</h3>
      <p>Qualidade garantida, preço justo e entrega rápida para todo o Brasil.</p>
    </div>
    <a href="https://a2kfsuplementos.com.br" target="_blank" style="background:#000;color:#FFD400;padding:12px 28px;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:1px;text-decoration:none;display:inline-block;">VISITAR LOJA →</a>
  </div>

  <div class="newsletter-box">
    <h3>FIQUE POR DENTRO DE TUDO</h3>
    <p>Receba artigos sobre treino, nutrição e suplementação diretamente no seu email.</p>
    <div class="newsletter-form">
      <input type="email" id="newsletterEmail" placeholder="seu@email.com" onkeydown="if(event.key==='Enter') subscribeNewsletter()" />
      <button onclick="subscribeNewsletter()">Quero receber</button>
    </div>
    <div class="newsletter-msg" id="newsletterMsg"></div>
  </div>
</div>

<div class="related" id="related">
  <div class="related-inner">
    <h2>ARTIGOS RELACIONADOS</h2>
    <div class="related-grid" id="relatedGrid">Carregando...</div>
  </div>
</div>

<footer>
  <div class="footer-inner">
    <div class="footer-social">
      <a href="https://www.instagram.com/a2kfsuplementos" target="_blank" rel="noopener" class="footer-social-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg> Instagram</a>
      <a href="https://wa.me/5521977377802" target="_blank" rel="noopener" class="footer-social-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.134.558 4.133 1.535 5.865L.057 23.535a.75.75 0 00.908.908l5.67-1.478A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.92 0-3.72-.504-5.27-1.385l-.378-.219-3.924 1.022 1.022-3.924-.219-.378A9.952 9.952 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg> WhatsApp</a>
      <a href="https://www.youtube.com/@A2KFSuplementos" target="_blank" rel="noopener" class="footer-social-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> YouTube</a>
    </div>
    <p class="footer-copy">© 2026 <span>A2KF Suplementos</span> · Todos os direitos reservados</p>
  </div>
</footer>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  const _sb = window.supabase.createClient('${SUPABASE_URL}', '${SUPABASE_ANON_KEY}');
  function searchPosts() {
    const q = document.getElementById('postSearchInput').value.trim();
    if (q) window.location.href = '/?q=' + encodeURIComponent(q);
  }
  async function subscribeNewsletter() {
    const email = document.getElementById('newsletterEmail').value.trim();
    const msg = document.getElementById('newsletterMsg');
    if (!email) { msg.style.color='#ff8888'; msg.textContent='Digite seu email.'; return; }
    msg.style.color='#aaa'; msg.textContent='Enviando...';
    try {
      const res = await fetch('/api/newsletter', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email}) });
      const data = await res.json();
      if (data.success) { msg.style.color='#FFD400'; msg.textContent=data.already?'✓ Você já está cadastrado!':'✓ Cadastrado com sucesso!'; document.getElementById('newsletterEmail').value=''; }
      else { msg.style.color='#ff8888'; msg.textContent='Erro ao cadastrar. Tente novamente.'; }
    } catch { msg.style.color='#ff8888'; msg.textContent='Erro de conexão.'; }
  }
  async function loadRelated() {
    const { data } = await _sb.from('posts').select('id,title,slug,category,cover_url').eq('published',true).neq('slug','${slug}').eq('category','${post.category || ''}').limit(3);
    const grid = document.getElementById('relatedGrid');
    if (!data || !data.length) { document.getElementById('related').style.display='none'; return; }
    grid.innerHTML = data.map(p => \`
      <a href="/post/\${p.slug}" class="related-card">
        \${p.cover_url ? \`<img src="\${p.cover_url}" class="related-card-img" alt="\${p.title}" loading="lazy" />\` : \`<div class="related-card-placeholder">A2KF</div>\`}
        <div class="related-card-body">
          \${p.category ? \`<span class="related-card-cat">\${p.category}</span>\` : ''}
          <div class="related-card-title">\${p.title}</div>
        </div>
      </a>
    \`).join('');
  }
  function copyLink() {
    navigator.clipboard.writeText('${url}').then(() => {
      const btn = document.getElementById('copyBtn');
      btn.textContent = '✓ Link Copiado!'; btn.classList.add('copied');
      setTimeout(() => { btn.textContent='Copiar Link'; btn.classList.remove('copied'); }, 2500);
    });
  }

  // ── REAÇÕES ────────────────────────────────────────────────
  const RX_KEY = 'a2kf_rx_${slug}';

  async function loadReactions() {
    try {
      const res = await fetch('/api/reactions/${slug}');
      const data = await res.json();
      if (!data.success) return;
      updateReactionUI(data.likes, data.dislikes);
      const voted = localStorage.getItem(RX_KEY);
      if (voted) {
        document.getElementById('btn' + (voted === 'like' ? 'Like' : 'Dislike')).classList.add('voted-' + voted);
        document.getElementById('btnLike').disabled = true;
        document.getElementById('btnDislike').disabled = true;
      }
    } catch(e) { console.log('[reactions] erro ao carregar:', e.message); }
  }

  async function sendReaction(type) {
    if (localStorage.getItem(RX_KEY)) return; // já votou
    localStorage.setItem(RX_KEY, type);
    // feedback imediato
    document.getElementById('btn' + (type === 'like' ? 'Like' : 'Dislike')).classList.add('voted-' + type);
    document.getElementById('btnLike').disabled = true;
    document.getElementById('btnDislike').disabled = true;
    try {
      await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: '${slug}', type })
      });
      // recarrega contagem atualizada
      const res = await fetch('/api/reactions/${slug}');
      const data = await res.json();
      if (data.success) updateReactionUI(data.likes, data.dislikes);
    } catch(e) { console.log('[reactions] erro ao votar:', e.message); }
  }

  function updateReactionUI(likes, dislikes) {
    document.getElementById('rxLikeCount').textContent = likes;
    document.getElementById('rxDislikeCount').textContent = dislikes;
    const total = likes + dislikes;
    const pct = total > 0 ? Math.round((likes / total) * 100) : 0;
    document.getElementById('rxBar').style.width = pct + '%';
    document.getElementById('rxPct').textContent = total > 0 ? pct + '% acharam útil' : 'Seja o primeiro a avaliar!';
  }

  loadRelated();
  loadReactions();
  (function(){
    var btn = document.getElementById('backToTop');
    var bar = document.getElementById('read-progress');
    window.addEventListener('scroll', function(){
      btn.classList.toggle('visible', window.scrollY > 320);
      var docH = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      bar.style.width = (docH > 0 ? Math.min((window.scrollY/docH)*100,100) : 0) + '%';
    }, {passive:true});
  })();
</script>

<button id="backToTop" onclick="window.scrollTo({top:0,behavior:'smooth'})" aria-label="Voltar ao topo">
  <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
</button>

<!-- COOKIE BANNER -->
<div id="cookieBanner" style="display:none;" aria-live="polite" role="dialog">
  <div class="cookie-inner">
    <div class="cookie-text"><span class="cookie-icon">🍪</span><div><strong>Usamos cookies</strong><p>Este site usa cookies essenciais para funcionar corretamente. <a href="/privacidade.html" target="_blank">Saiba mais</a></p></div></div>
    <div class="cookie-actions">
      <a href="/privacidade.html" target="_blank" class="cookie-btn-link">Política completa</a>
      <button onclick="rejectCookies()" class="cookie-btn-reject">Recusar</button>
      <button onclick="acceptCookies()" class="cookie-btn-accept">Aceitar</button>
    </div>
  </div>
</div>
<style>
  #cookieBanner{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#111;border-top:3px solid #FFD400;padding:1.25rem 2rem;box-shadow:0 -4px 24px rgba(0,0,0,.4);animation:slideUp .35s ease;}
  @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
  .cookie-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:1.5rem;flex-wrap:wrap;}
  .cookie-text{display:flex;align-items:flex-start;gap:1rem;flex:1;min-width:260px;}
  .cookie-icon{font-size:1.6rem;line-height:1;flex-shrink:0;margin-top:2px;}
  .cookie-text strong{display:block;color:#FFD400;font-size:14px;font-weight:700;margin-bottom:.25rem;}
  .cookie-text p{color:#999;font-size:13px;line-height:1.5;margin:0;}
  .cookie-text a{color:#FFD400;font-weight:600;text-decoration:none;}
  .cookie-actions{display:flex;align-items:center;gap:.75rem;flex-shrink:0;flex-wrap:wrap;}
  .cookie-btn-link{color:#666;font-size:12px;text-decoration:none;padding:8px 0;border-bottom:1px solid #333;}
  .cookie-btn-reject{background:transparent;color:#888;border:1px solid #333;font-family:'DM Sans',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;padding:9px 18px;cursor:pointer;}
  .cookie-btn-accept{background:#FFD400;color:#0A0A0A;border:none;font-family:'DM Sans',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;padding:10px 22px;cursor:pointer;}
  @media(max-width:600px){#cookieBanner{padding:1.25rem;}.cookie-actions{width:100%;justify-content:flex-end;}.cookie-btn-link{display:none;}}
</style>
<script>
  (function(){if(!localStorage.getItem('a2kf_cookie_consent'))document.getElementById('cookieBanner').style.display='block';})();
  function acceptCookies(){localStorage.setItem('a2kf_cookie_consent','accepted');hideBanner();}
  function rejectCookies(){localStorage.setItem('a2kf_cookie_consent','rejected');hideBanner();}
  function hideBanner(){var b=document.getElementById('cookieBanner');b.style.transition='transform .3s ease,opacity .3s ease';b.style.transform='translateY(100%)';b.style.opacity='0';setTimeout(function(){b.style.display='none';},320);}
</script>

<!-- EXIT INTENT POPUP -->
<div id="exitPopup" aria-modal="true" role="dialog" style="display:none;">
  <div class="exit-overlay" onclick="closeExitPopup()"></div>
  <div class="exit-box">
    <button class="exit-close" onclick="closeExitPopup()">&times;</button>
    <div class="exit-badge">OFERTA EXCLUSIVA</div>
    <div class="exit-top"><img src="/logo.png" alt="A2KF" class="exit-logo" /></div>
    <h2 class="exit-title">ESPERA!<br/>NÃO VÁ EMBORA<br/><span>SEM ESSE DESCONTO</span></h2>
    <p class="exit-sub">Na sua primeira compra na loja A2KF Suplementos, use o cupom abaixo e ganhe:</p>
    <div class="exit-discount">10% OFF</div>
    <div class="exit-coupon-wrap">
      <span class="exit-coupon-label">SEU CUPOM</span>
      <div class="exit-coupon-row"><span class="exit-coupon-code">PRIMEIRACOMPRA</span><button class="exit-copy-btn" onclick="copyCoupon()" id="exitCopyBtn">COPIAR</button></div>
    </div>
    <a href="https://a2kfsuplementos.com.br" target="_blank" rel="noopener" class="exit-cta" onclick="closeExitPopup()">IR PARA A LOJA →</a>
    <button class="exit-skip" onclick="closeExitPopup()">Não, obrigado</button>
  </div>
</div>
<style>
  #exitPopup{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem;}
  .exit-overlay{position:absolute;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(3px);}
  .exit-box{position:relative;z-index:1;background:#0A0A0A;border:2px solid #FFD400;max-width:380px;width:100%;padding:1.75rem 1.5rem 1.5rem;text-align:center;animation:exitPop .35s cubic-bezier(.34,1.56,.64,1);}
  @keyframes exitPop{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
  .exit-close{position:absolute;top:.5rem;right:.75rem;background:none;border:none;color:#555;font-size:1.5rem;cursor:pointer;}
  .exit-close:hover{color:#FFD400;}
  .exit-badge{display:inline-block;background:#FFD400;color:#000;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:3px 10px;margin-bottom:.875rem;}
  .exit-top{margin-bottom:.75rem;}.exit-logo{height:36px;width:auto;filter:brightness(0) invert(1);opacity:.85;}
  .exit-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(1.5rem,6vw,2rem);line-height:1;letter-spacing:1px;color:#fff;margin-bottom:.75rem;}
  .exit-title span{color:#FFD400;}
  .exit-sub{color:#888;font-size:12px;line-height:1.5;margin-bottom:.875rem;}
  .exit-discount{font-family:'Bebas Neue',sans-serif;font-size:2.8rem;color:#FFD400;line-height:1;letter-spacing:2px;margin-bottom:.875rem;}
  .exit-coupon-wrap{background:#111;border:1.5px dashed #FFD400;padding:.75rem 1rem;margin-bottom:1rem;}
  .exit-coupon-label{display:block;font-size:9px;font-weight:700;letter-spacing:2px;color:#555;margin-bottom:.4rem;}
  .exit-coupon-row{display:flex;align-items:center;justify-content:center;gap:.625rem;}
  .exit-coupon-code{font-family:'Bebas Neue',sans-serif;font-size:1.4rem;letter-spacing:2px;color:#FFD400;}
  .exit-copy-btn{background:#FFD400;color:#000;border:none;font-family:'DM Sans',sans-serif;font-weight:700;font-size:10px;letter-spacing:1px;padding:5px 11px;cursor:pointer;}
  .exit-copy-btn.copied{background:#38A169;color:#fff;}
  .exit-cta{display:block;background:#FFD400;color:#000;font-family:'DM Sans',sans-serif;font-weight:700;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;padding:11px;text-decoration:none;margin-bottom:.625rem;}
  .exit-skip{background:none;border:none;color:#444;font-family:'DM Sans',sans-serif;font-size:11px;cursor:pointer;text-decoration:underline;}
</style>
<script>
  (function(){
    var shown=false;
    if(sessionStorage.getItem('a2kf_exit_popup_shown'))return;
    function showPopup(){if(shown)return;shown=true;sessionStorage.setItem('a2kf_exit_popup_shown','1');document.getElementById('exitPopup').style.display='flex';document.body.style.overflow='hidden';}
    document.addEventListener('mouseleave',function(e){if(e.clientY<=10)showPopup();});
    var t=setTimeout(function(){if(/Mobi|Android/i.test(navigator.userAgent))showPopup();},40000);
    window.closeExitPopup=function(){document.getElementById('exitPopup').style.display='none';document.body.style.overflow='';clearTimeout(t);};
    window.copyCoupon=function(){navigator.clipboard.writeText('PRIMEIRACOMPRA').then(function(){var b=document.getElementById('exitCopyBtn');b.textContent='✓ COPIADO';b.classList.add('copied');setTimeout(function(){b.textContent='COPIAR';b.classList.remove('copied');},2500);});};
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closeExitPopup();});
  })();
</script>

<!-- Brevo Conversations -->
<script>
  (function(d,w,c){
    var now=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Sao_Paulo'}));
    var day=now.getDay(),hour=now.getHours();
    if(!(day>=1&&day<=5&&hour>=9&&hour<18))return;
    w.BrevoConversationsID='6a0a4ded00173bc1510e7e11';
    w[c]=w[c]||function(){(w[c].q=w[c].q||[]).push(arguments);};
    var s=d.createElement('script');s.async=true;s.src='https://conversations-widget.brevo.com/brevo-conversations.js';
    if(d.head)d.head.appendChild(s);
  })(document,window,'BrevoConversations');
</script>

</body>
</html>`);
});

// ─── SITEMAP.XML ─────────────────────────────────────────────────────────────
app.get('/sitemap.xml', async (req, res) => {
  const { data: posts } = await supabase
    .from('posts').select('slug,updated_at,created_at').eq('published',true).order('created_at',{ascending:false});
  const urls = (posts||[]).map(p => {
    const lastmod = new Date(p.updated_at||p.created_at).toISOString().split('T')[0];
    return `\n  <url><loc>${SITE_URL}/post/${p.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
  }).join('');
  res.header('Content-Type','application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_URL}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>${urls}</urlset>`);
});

// ─── ROBOTS.TXT ──────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${SITE_URL}/sitemap.xml`);
});

// ─── ADMIN ───────────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => res.redirect('/admin/login.html'));
app.get('/admin/banners', (req, res) => res.redirect('/admin/banners.html'));

// ─── 404 ─────────────────────────────────────────────────────────────────────
function notFoundPage() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>404 – A2KF Blog</title><link rel="icon" type="image/png" href="/logo.png"/><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',sans-serif;background:#0A0A0A;color:#fff;min-height:100vh;display:flex;flex-direction:column;}nav{background:#0A0A0A;border-bottom:3px solid #FFD400;padding:0 1.5rem;height:64px;display:flex;align-items:center;}nav img{height:44px;width:auto;}.hero{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:3rem 1.5rem;}.code{font-family:'Bebas Neue',sans-serif;font-size:clamp(6rem,20vw,10rem);color:#FFD400;line-height:1;letter-spacing:4px;}.msg{font-family:'Bebas Neue',sans-serif;font-size:clamp(1.5rem,5vw,2.5rem);letter-spacing:1px;margin:.5rem 0 1rem;}.sub{color:#666;font-size:15px;max-width:420px;line-height:1.6;margin-bottom:2rem;}.btn-home{background:#FFD400;color:#000;font-weight:700;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;padding:12px 28px;text-decoration:none;display:inline-block;}</style></head><body><nav><a href="/"><img src="/logo.png" alt="A2KF"/></a></nav><div class="hero"><div class="code">404</div><div class="msg">PÁGINA NÃO ENCONTRADA</div><p class="sub">O conteúdo que você procura não existe ou foi movido.</p><a href="/" class="btn-home">← Voltar ao Blog</a></div></body></html>`;
}

app.use(async (req, res) => res.status(404).send(notFoundPage()));

app.listen(PORT, () => console.log(`A2KF Blog rodando na porta ${PORT}`));
