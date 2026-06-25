const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const sanitizeHtml = require('sanitize-html');
const rateLimit = require('express-rate-limit');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL || 'SUPABASE_URL_AQUI';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'SUPABASE_ANON_KEY_AQUI';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SITE_URL = process.env.SITE_URL || 'https://blog.a2kfsuplementos.com.br';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_LIST_ID = parseInt(process.env.BREVO_LIST_ID || '5');
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const YAMPI_API_KEY = process.env.YAMPI_API_KEY || '';
const YAMPI_TOKEN = process.env.YAMPI_TOKEN || '';
const YAMPI_ALIAS = process.env.YAMPI_ALIAS || 'a2kf-suplementos2';

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── CRÍTICO 2: Escape HTML para interpolação segura no template ──────────────
// Usado em todos os campos de post interpolados no HTML gerado pelo servidor.
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ─── CRÍTICO 2: Sanitização do conteúdo HTML do Quill ────────────────────────
// Permite apenas tags seguras; remove qualquer <script>, event handlers, etc.
const ALLOWED_POST_TAGS = [
  'h2', 'h3', 'h4', 'p', 'br',
  'ul', 'ol', 'li',
  'strong', 'em', 'u', 's', 'blockquote', 'pre', 'code',
  'a', 'img',
];
const ALLOWED_POST_ATTRS = {
  'a':   ['href', 'target', 'rel'],
  'img': ['src', 'alt', 'width', 'height', 'loading'],
};

function sanitizePostContent(html) {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_POST_TAGS,
    allowedAttributes: ALLOWED_POST_ATTRS,
    allowedSchemes: ['https', 'http'],
    // Força rel="noopener noreferrer" em todos os links externos
    transformTags: {
      'a': (tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          rel: 'noopener noreferrer',
          target: attribs.target || '_blank',
        },
      }),
    },
  });
}

// ─── CRÍTICO 3: Verifica sessão Supabase em rotas admin ──────────────────────
// Extrai o Bearer token do header Authorization e valida no Supabase.
async function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }

  req.user = user;
  next();
}

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const newsletterLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const notifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10,
  message: { error: 'Limite de notificações atingido.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const reactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Muitas requisições.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

    const { data: posts, error } = await supabaseAdmin
      .from('posts')
      .select('id,title,slug,excerpt,category,cover_url')
      .eq('published', false)
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now);

    if (error) {
  console.error('[scheduler] Erro na query:', error);
  return;
}

console.log(`[scheduler] encontrados ${posts?.length || 0} posts`);
    if (!posts || !posts.length) return;

    console.log(`[scheduler] ${posts.length} post(s) para publicar.`);

    for (const post of posts) {
      const publishedAt = new Date().toISOString();

      const { error: updateError } = await supabaseAdmin
        .from('posts')
        .update({ published: true, scheduled_at: null, created_at: publishedAt })
        .eq('id', post.id);

      if (updateError) {
        console.error(
  `[scheduler] Erro ao publicar post id=${post.id}:`,
  updateError
);
        continue;
      }

      console.log(`[scheduler] ✓ Post publicado id=${post.id} slug=${post.slug}`);

      if (!BREVO_API_KEY) {
        console.warn('[scheduler] BREVO_API_KEY não configurada — pulando notificação.');
        continue;
      }

      try {
        const notifyResult = await sendNewsletterNotification({
          postTitle: post.title,
          postSlug: post.slug || post.id,
          postExcerpt: post.excerpt || '',
          postCategory: post.category || '',
          coverUrl: post.cover_url || '',
        });
        console.log(`[scheduler] ✓ Notificados: ${notifyResult.sent} enviados, ${notifyResult.errors} erros`);
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
// Cache em memória: evita bater na API a cada pageview
let yampiCache = { products: null, ts: 0 };
const YAMPI_TTL = 5 * 60 * 1000; // 5 minutos

function parseYampiProducts(parsed) {
  // Log da 1ª SKU para debug — remover depois de confirmar os campos
  const firstSkus = (parsed.data?.[0]?.skus?.data || []);
  if (firstSkus.length) {
    const s = firstSkus[0];
    console.log('[yampi] SKU campos:', JSON.stringify({
      price: s.price,
      price_sale: s.price_sale,
      promotional_price: s.promotional_price,
      price_discount: s.price_discount,
      price_with_discount: s.price_with_discount,
      sale_price: s.sale_price,
    }));
  }

  return (parsed.data || []).map(p => {
    const skus = p.skus?.data || [];
    let originalPrice = 0;
    let finalPrice = 0;

    skus.forEach(s => {
      // Na Yampi: price_sale = preço cheio de venda | price_discount = preço promocional
      // O campo "price" pode vir vazio/zero — usar price_sale como preço base
      const base = parseFloat(s.price_sale || s.price || 0);
      const promo = parseFloat(s.price_discount || s.promotional_price || s.price_with_discount || 0);

      if (base > 0) {
        if (originalPrice === 0 || base < originalPrice) originalPrice = base;
        const effective = (promo > 0 && promo < base) ? promo : base;
        if (finalPrice === 0 || effective < finalPrice) finalPrice = effective;
      }
    });

    const hasDiscount = finalPrice > 0 && finalPrice < originalPrice;
    const images = p.images?.data || [];
    const image = images.length
      ? (images[0].thumb?.url || images[0].small?.url || images[0].large?.url || images[0].url || '')
      : '';
    const productUrl = p.url?.startsWith('http')
      ? p.url
      : `https://www.a2kfsuplementos.com.br/${p.url || p.slug || p.id}`;

    console.log(`[yampi] ${p.name} → base: R$${originalPrice} | final: R$${finalPrice} | desconto: ${hasDiscount}`);

    return {
      id: p.id,
      name: p.name,
      slug: p.slug || '',
      image,
      price: finalPrice || originalPrice,
      originalPrice: hasDiscount ? originalPrice : 0,
      url: productUrl,
    };
  }).filter(p => p.name && p.price > 0);
}

app.get('/api/produtos-destaque', async (req, res) => {
  if (!YAMPI_API_KEY) return res.status(503).json({ error: 'YAMPI_API_KEY não configurada.' });

  const now = Date.now();
  const forceRefresh = req.query.refresh === '1';

  // Serve do cache se ainda válido e não forçou refresh
  if (!forceRefresh && yampiCache.products && (now - yampiCache.ts) < YAMPI_TTL) {
    console.log('[yampi] Servindo do cache');
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({ success: true, products: yampiCache.products, cached: true });
  }

  try {
    console.log('[yampi] Buscando produtos na API...');
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
      // Timeout de 8 segundos
      r.setTimeout(8000, () => { r.destroy(new Error('Timeout Yampi')); });
      r.end();
    });

    console.log(`[yampi] Status HTTP: ${result.status}`);

    if (result.status !== 200) {
      console.error('[yampi] Resposta inesperada:', result.body.substring(0, 200));
      // Retorna cache antigo se existir, mesmo expirado
      if (yampiCache.products) {
        console.log('[yampi] Usando cache antigo como fallback');
        return res.json({ success: true, products: yampiCache.products, fallback: true });
      }
      return res.status(502).json({ error: 'Erro ao buscar produtos da Yampi.' });
    }

    const parsed = JSON.parse(result.body);
    console.log(`[yampi] Total de produtos recebidos: ${parsed.data?.length || 0}`);

    const products = parseYampiProducts(parsed);
    console.log(`[yampi] Produtos processados: ${products.length}`);

    if (products.length === 0) {
      console.warn('[yampi] Nenhum produto válido retornado!');
      if (yampiCache.products) {
        return res.json({ success: true, products: yampiCache.products, fallback: true });
      }
      return res.status(404).json({ error: 'Nenhum produto encontrado.' });
    }

    // Atualiza cache em memória
    yampiCache = { products, ts: now };

    res.set('Cache-Control', 'public, max-age=60');
    res.json({ success: true, products });
  } catch (e) {
    console.error('[yampi] Erro:', e.message);
    // Fallback para cache antigo em caso de erro de rede
    if (yampiCache.products) {
      console.log('[yampi] Erro de rede — usando cache como fallback');
      return res.json({ success: true, products: yampiCache.products, fallback: true });
    }
    res.status(500).json({ error: 'Erro interno ao buscar produtos.' });
  }
});

// ─── CRÍTICO 1: Groq — proxy autenticado (chave NUNCA vai ao cliente) ────────
// O frontend envia o Bearer token do Supabase; o servidor valida a sessão
// e faz a chamada à Groq internamente, devolvendo apenas o resultado.
app.post('/api/groq-generate', requireAuth, async (req, res) => {
  if (!GROQ_API_KEY) return res.status(503).json({ error: 'GROQ_API_KEY não configurada.' });

  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.length > 4000) {
    return res.status(400).json({ error: 'Prompt inválido.' });
  }

  try {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
    });

    const result = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const r = https.request(opts, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve({ status: response.statusCode, body: data }));
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });

    if (result.status !== 200) {
      const err = JSON.parse(result.body || '{}');
      return res.status(502).json({ error: err.error?.message || 'Erro na API Groq.' });
    }

    const data = JSON.parse(result.body);
    // Devolve apenas o conteúdo gerado, nunca a chave ou metadados internos
    res.json({ success: true, content: data.choices[0].message.content });
  } catch (e) {
    console.error('[groq] Erro:', e.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// Rota legada removida — /api/groq-key não existe mais.
// Qualquer chamada para ela retorna 404 padrão.

// ─── NEWSLETTER (Brevo) ──────────────────────────────────────────────────────
app.post('/api/newsletter', newsletterLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 254) {
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
    return res.status(500).json({ error: 'Erro ao cadastrar.' });
  } catch (e) {
    console.error('[newsletter] Erro:', e.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

// ─── CRÍTICO 3: Notificar inscritos — requer autenticação ────────────────────
// Aceita tanto token Bearer do admin quanto chamada interna via x-internal-secret
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || `internal_${SUPABASE_ANON_KEY.slice(-16)}`;

async function requireAuthOrInternal(req, res, next) {
  // Chamada interna do próprio servidor (scheduler)
  if (req.headers['x-internal-secret'] === INTERNAL_SECRET) {
    return next();
  }
  // Chamada externa: exige token Supabase válido
  return requireAuth(req, res, next);
}

app.post('/api/notify-subscribers', requireAuthOrInternal, notifyLimiter, async (req, res) => {
  const { postTitle, postSlug, postExcerpt, postCategory, coverUrl } = req.body;

  if (!postTitle || !postSlug) {
    return res.status(400).json({ error: 'postTitle e postSlug são obrigatórios.' });
  }

  // Valida que o post realmente existe e pertence ao banco (evita notificações fantasmas)
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id')
    .eq('slug', postSlug)
    .eq('published', true)
    .single();

  if (postError || !post) {
    return res.status(404).json({ error: 'Post não encontrado ou não publicado.' });
  }

  try {
    const result = await sendNewsletterNotification({ postTitle, postSlug, postExcerpt, postCategory, coverUrl });
    return res.json({ success: true, ...result });
  } catch (e) {
    console.error('[notify] Erro:', e.message);
    return res.status(500).json({ error: 'Erro ao notificar inscritos.' });
  }
});

// ─── POSTS POPULARES ─────────────────────────────────────────────────────────
let popularCache = { data: null, ts: 0 };
const POPULAR_TTL = 5 * 60 * 1000;

app.get('/api/posts-populares', async (req, res) => {
  const now = Date.now();
  if (popularCache.data && now - popularCache.ts < POPULAR_TTL) {
    return res.json(popularCache.data);
  }
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('title, slug, cover_url, category, views')
      .eq('published', true)
      .order('views', { ascending: false })
      .limit(5);
    if (error) return res.status(500).json({ error: error.message });
    popularCache = { data: { success: true, posts: data || [] }, ts: now };
    res.set('Cache-Control', 'public, max-age=300');
    res.json(popularCache.data);
  } catch (e) {
    console.error('[popular] Erro:', e.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ─── REAÇÕES ─────────────────────────────────────────────────────────────────
app.get('/api/reactions/:slug', reactionLimiter, async (req, res) => {
  const { slug } = req.params;
  // Valida formato do slug para evitar injeção
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) {
    return res.status(400).json({ error: 'Slug inválido.' });
  }
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

app.post('/api/reactions', reactionLimiter, async (req, res) => {
  const { slug, type } = req.body;
  if (!slug || !/^[a-z0-9-]{1,100}$/.test(slug) || !['like', 'dislike'].includes(type)) {
    return res.status(400).json({ error: 'Parâmetros inválidos.' });
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

// ─── CRÍTICO 2: POST PAGE — escape + sanitização aplicados ───────────────────
app.get('/post/:slug', async (req, res) => {
  const rawSlug = req.params.slug;

  // Valida formato do slug antes de consultar o banco
  if (!/^[a-z0-9-]{1,100}$/.test(rawSlug)) {
    return res.status(404).send(notFoundPage());
  }

  const { data: post, error } = await supabase
    .from('posts')
    .select('*')
    .eq('slug', rawSlug)
    .eq('published', true)
    .single();

  if (error || !post) return res.status(404).send(notFoundPage());

  supabase.rpc('increment_views', { post_slug: rawSlug }).then(() => {}).catch(() => {});
  const views = (post.views || 0) + 1;

  // ── CRÍTICO 2: sanitiza o HTML do conteúdo antes de renderizar ──
  const safeContent = sanitizePostContent(post.content || '');

  const plainText = safeContent.replace(/<[^>]*>/g, '').trim();
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const readMins = Math.max(1, Math.round(wordCount / 200));
  const readingTime = readMins === 1 ? '1 min de leitura' : readMins + ' min de leitura';

  // ── CRÍTICO 2: todos os campos de post escapados antes de interpolar ──
  const safeTitle    = esc(post.title);
  const safeExcerpt  = esc(post.excerpt || post.title);
  const safeCategory = esc(post.category || '');
  const safeCoverUrl = esc(post.cover_url || '');
  const safeSlug     = esc(rawSlug);
  const safeDate     = new Date(post.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const image = post.cover_url || `${SITE_URL}/logo.png`;
  const url = `${SITE_URL}/post/${safeSlug}`;

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} – A2KF Suplementos</title>
  <meta name="description" content="${safeExcerpt}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeExcerpt}" />
  <meta property="og:image" content="${safeCoverUrl || esc(image)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="A2KF Suplementos" />
  <meta property="article:published_time" content="${esc(post.created_at)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeExcerpt}" />
  <meta name="twitter:image" content="${safeCoverUrl || esc(image)}" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/png" href="/logo.png" />
  <script type="application/ld+json">
  ${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.excerpt || post.title,
    "image": image,
    "datePublished": new Date(post.created_at).toISOString(),
    "dateModified": new Date(post.updated_at || post.created_at).toISOString(),
    "mainEntityOfPage": { "@type": "WebPage", "@id": url },
    "author": { "@type": "Organization", "name": "A2KF Suplementos", "url": "https://a2kfsuplementos.com.br" },
    "publisher": { "@type": "Organization", "name": "A2KF Suplementos", "logo": { "@type": "ImageObject", "url": `${SITE_URL}/logo.png`, "width": 200, "height": 200 } },
    ...(post.category && { "articleSection": post.category }),
    ...(post.cover_url && { "thumbnailUrl": post.cover_url }),
  })}
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
    .reactions-box{border-top:1px solid var(--border);margin-top:2.5rem;padding-top:1.25rem;display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
    .reactions-label{font-size:13px;color:var(--muted);white-space:nowrap;}
    .reactions-btns{display:flex;gap:6px;}
    .rx-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border:1px solid var(--border);background:transparent;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--muted);border-radius:4px;transition:all .15s;}
    .rx-btn:hover{border-color:#aaa;color:var(--black);background:var(--gray);}
    .rx-btn.voted-like{border-color:#B8960A;background:#fffbe6;color:#7a6000;}
    .rx-btn.voted-dislike{border-color:#c0392b;background:#fff5f5;color:#922b21;}
    .rx-btn:disabled{cursor:default;}
    .rx-num{font-size:13px;font-weight:700;}
    .rx-divider{width:1px;height:14px;background:var(--border);}
    .rx-pct{font-size:12px;color:var(--muted);}
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
    /* POSTS MAIS LIDOS */
    .popular-section{background:var(--black);padding:2rem 1.25rem;border-top:3px solid var(--yellow);}
    .popular-inner{max-width:1100px;margin:0 auto;}
    .popular-title{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;letter-spacing:1px;color:var(--white);margin-bottom:1.25rem;}
    .popular-title span{color:var(--yellow);}
    .popular-list{display:flex;flex-direction:column;gap:.625rem;}
    .popular-item{display:flex;align-items:center;gap:.875rem;text-decoration:none;color:var(--white);padding:.75rem;border:1px solid #1e1e1e;background:#111;transition:border-color .2s,background .2s;}
    .popular-item:hover{border-color:var(--yellow);background:#1a1a1a;}
    .popular-num{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;line-height:1;color:#2a2a2a;width:32px;text-align:center;flex-shrink:0;transition:color .2s;}
    .popular-item:hover .popular-num{color:#444;}
    .popular-item.rank-1 .popular-num{color:var(--yellow);}
    .popular-item.rank-2 .popular-num{color:#aaa;}
    .popular-item.rank-3 .popular-num{color:#cd7f32;}
    .popular-thumb{width:68px;height:52px;object-fit:cover;flex-shrink:0;display:block;background:#222;}
    .popular-thumb-ph{width:68px;height:52px;flex-shrink:0;background:#222;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:.9rem;color:#444;}
    .popular-info{flex:1;min-width:0;}
    .popular-cat{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--yellow);margin-bottom:.2rem;}
    .popular-name{font-size:13px;font-weight:700;line-height:1.3;color:#ddd;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
    .popular-views{font-size:11px;color:#555;margin-top:.2rem;display:flex;align-items:center;gap:3px;}
    @media(max-width:600px){
      .popular-thumb,.popular-thumb-ph{width:54px;height:42px;}
      .popular-num{font-size:1.4rem;width:26px;}
      .popular-name{font-size:12px;}
    }
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
  <img src="${safeCoverUrl}" class="post-cover" alt="${safeTitle}" loading="eager" width="1200" height="480"
    onload="this.classList.add('loaded');this.parentElement.classList.add('loaded')"
    onerror="this.parentElement.style.display='none'" />
</div>` : ''}

<div class="post-hero">
  <div class="post-hero-inner">
    <div class="post-meta">
      ${safeCategory ? `<span class="post-category">${safeCategory}</span>` : ''}
      <span class="post-date">${safeDate}</span>
      <span class="post-read-time">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${readingTime}
      </span>
      <span class="post-views">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        ${views.toLocaleString('pt-BR')} visualizações
      </span>
    </div>
    <h1 class="post-title">${safeTitle}</h1>
    ${post.excerpt ? `<p class="post-excerpt">${safeExcerpt}</p>` : ''}
  </div>
</div>

<div class="post-body">
  ${safeContent}

  <div class="reactions-box" id="reactionsBox">
    <span class="reactions-label">Foi útil?</span>
    <div class="reactions-btns">
      <button class="rx-btn" id="btnLike" onclick="sendReaction('like')" aria-label="Gostei">
        👍 <span class="rx-num" id="rxLikeCount">—</span>
      </button>
      <button class="rx-btn" id="btnDislike" onclick="sendReaction('dislike')" aria-label="Não gostei">
        👎 <span class="rx-num" id="rxDislikeCount">—</span>
      </button>
    </div>
    <span class="rx-divider"></span>
    <span class="rx-pct" id="rxPct"></span>
  </div>

  <div class="share-box">
    <h4>GOSTOU? COMPARTILHE!</h4>
    <div class="share-btns">
      <a class="share-btn share-btn-wpp" href="https://wa.me/?text=${encodeURIComponent(post.title + ' - ' + url)}" target="_blank" rel="noopener noreferrer">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.134.558 4.133 1.535 5.865L.057 23.535a.75.75 0 00.908.908l5.67-1.478A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.92 0-3.72-.504-5.27-1.385l-.378-.219-3.924 1.022 1.022-3.924-.219-.378A9.952 9.952 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
        WhatsApp
      </a>
      <a class="share-btn share-btn-fb" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">
        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        Facebook
      </a>
      <a class="share-btn share-btn-ig" href="https://www.instagram.com/a2kfsuplementos" target="_blank" rel="noopener noreferrer">
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
    <a href="https://a2kfsuplementos.com.br" target="_blank" rel="noopener noreferrer" style="background:#000;color:#FFD400;padding:12px 28px;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:1px;text-decoration:none;display:inline-block;">VISITAR LOJA →</a>
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

<!-- POSTS MAIS LIDOS -->
<div class="popular-section" id="popularSection" style="display:none;">
  <div class="popular-inner">
    <h2 class="popular-title">MAIS <span>LIDOS</span></h2>
    <div class="popular-list" id="popularList"></div>
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
    const { data } = await _sb.from('posts').select('id,title,slug,category,cover_url').eq('published',true).neq('slug','${safeSlug}').eq('category','${safeCategory}').limit(3);
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
  const RX_KEY = 'a2kf_rx_${safeSlug}';
  async function loadReactions() {
    try {
      const res = await fetch('/api/reactions/${safeSlug}');
      const data = await res.json();
      if (!data.success) return;
      updateReactionUI(data.likes, data.dislikes);
      const voted = localStorage.getItem(RX_KEY);
      if (voted) {
        document.getElementById('btn' + (voted === 'like' ? 'Like' : 'Dislike')).classList.add('voted-' + voted);
        document.getElementById('btnLike').disabled = true;
        document.getElementById('btnDislike').disabled = true;
      }
    } catch(e) {}
  }
  async function sendReaction(type) {
    if (localStorage.getItem(RX_KEY)) return;
    localStorage.setItem(RX_KEY, type);
    document.getElementById('btn' + (type === 'like' ? 'Like' : 'Dislike')).classList.add('voted-' + type);
    document.getElementById('btnLike').disabled = true;
    document.getElementById('btnDislike').disabled = true;
    try {
      await fetch('/api/reactions', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ slug:'${safeSlug}', type }) });
      const res = await fetch('/api/reactions/${safeSlug}');
      const data = await res.json();
      if (data.success) updateReactionUI(data.likes, data.dislikes);
    } catch(e) {}
  }
  function updateReactionUI(likes, dislikes) {
    document.getElementById('rxLikeCount').textContent = likes;
    document.getElementById('rxDislikeCount').textContent = dislikes;
    const total = likes + dislikes;
    const pct = total > 0 ? Math.round((likes / total) * 100) : 0;
    document.getElementById('rxPct').textContent = total > 0 ? pct + '% acharam útil' : 'Seja o primeiro a avaliar!';
  }
  loadRelated();
  loadReactions();
  async function loadPopular() {
    try {
      const res = await fetch('/api/posts-populares');
      const data = await res.json();
      if (!data.success || !data.posts.length) return;
      const posts = data.posts.filter(p => p.slug !== '${safeSlug}');
      if (!posts.length) return;
      const rankClass = ['rank-1','rank-2','rank-3','',''];
      document.getElementById('popularList').innerHTML = posts.map((p, i) => \`
        <a href="/post/\${p.slug}" class="popular-item \${rankClass[i] || ''}">
          <span class="popular-num">\${i + 1}</span>
          \${p.cover_url
            ? \`<img src="\${p.cover_url}" class="popular-thumb" alt="\${p.title}" loading="lazy" onerror="this.outerHTML='<div class=popular-thumb-ph>A2KF</div>'" />\`
            : \`<div class="popular-thumb-ph">A2KF</div>\`}
          <div class="popular-info">
            \${p.category ? \`<div class="popular-cat">\${p.category}</div>\` : ''}
            <div class="popular-name">\${p.title}</div>
            <div class="popular-views">
              <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              \${(p.views||0).toLocaleString('pt-BR')} visualizações
            </div>
          </div>
        </a>
      \`).join('');
      document.getElementById('popularSection').style.display = 'block';
    } catch(e) {}
  }
  loadPopular();
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

<script src="/analytics.js"></script>

</body>
</html>`);
});


// ─── ANALYTICS ───────────────────────────────────────────────────────────────
const analyticsLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function classifySource(referrer, utmSource, utmMedium) {
  if (utmSource) return { source: utmSource, medium: utmMedium || 'utm', channel: 'Campanha' };
  if (!referrer) return { source: '(direto)', medium: 'none', channel: 'Direto' };
  try {
    const url = new URL(referrer);
    const host = url.hostname.replace(/^www\./, '');
    if (/google\.|bing\.|yahoo\.|duckduckgo\.|baidu\./.test(host)) return { source: host, medium: 'organic', channel: 'Busca Orgânica' };
    if (/instagram\.|facebook\.|t\.co|twitter\.|tiktok\.|youtube\.|linkedin\.|pinterest\./.test(host)) return { source: host, medium: 'social', channel: 'Redes Sociais' };
    if (host === new URL(SITE_URL).hostname) return { source: '(interno)', medium: 'referral', channel: 'Interno' };
    return { source: host, medium: 'referral', channel: 'Referência' };
  } catch { return { source: (referrer || '').substring(0, 100), medium: 'referral', channel: 'Referência' }; }
}

app.post('/api/analytics/event', analyticsLimiter, async (req, res) => {
  try {
    const { event_type, page, page_title, referrer, utm_source, utm_medium, utm_campaign,
            click_target, click_text, click_url, scroll_depth, time_seconds, session_id, device } = req.body;

    if (!event_type || !page) return res.status(400).json({ error: 'event_type e page são obrigatórios.' });
    if (!['pageview','click','scroll','time_on_page'].includes(event_type)) return res.status(400).json({ error: 'event_type inválido.' });

    const { source, medium, channel } = classifySource(referrer, utm_source, utm_medium);

    const { error } = await supabaseAdmin.from('analytics_events').insert([{
      event_type,
      page: String(page).substring(0, 200),
      page_title: page_title ? String(page_title).substring(0, 200) : null,
      source, medium, channel,
      utm_campaign: utm_campaign ? String(utm_campaign).substring(0, 100) : null,
      click_target: click_target ? String(click_target).substring(0, 100) : null,
      click_text: click_text ? String(click_text).substring(0, 200) : null,
      click_url: click_url ? String(click_url).substring(0, 500) : null,
      scroll_depth: scroll_depth != null ? Math.min(100, Math.max(0, parseInt(scroll_depth))) : null,
      time_seconds: time_seconds != null ? Math.min(3600, Math.max(0, parseInt(time_seconds))) : null,
      session_id: session_id ? String(session_id).substring(0, 64) : null,
      device: ['mobile','desktop','tablet'].includes(device) ? device : 'desktop',
    }]);

    if (error) { console.error('[analytics] Insert:', error.message); return res.status(500).json({ error: 'Erro ao salvar.' }); }
    res.json({ ok: true });
  } catch (e) { console.error('[analytics]', e.message); res.status(500).json({ error: 'Erro interno.' }); }
});

app.get('/api/analytics/summary', requireAuth, async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days || '30')));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [pvRes, topRes, srcRes, chRes, devRes, clkRes, scrRes, tmRes, dayRes] = await Promise.all([
      supabaseAdmin.from('analytics_events').select('session_id').eq('event_type','pageview').gte('created_at', since),
      supabaseAdmin.rpc('analytics_top_pages', { since_ts: since, lim: 10 }),
      supabaseAdmin.rpc('analytics_sources', { since_ts: since }),
      supabaseAdmin.rpc('analytics_channels', { since_ts: since }),
      supabaseAdmin.rpc('analytics_devices', { since_ts: since }),
      supabaseAdmin.rpc('analytics_top_clicks', { since_ts: since, lim: 10 }),
      supabaseAdmin.rpc('analytics_scroll', { since_ts: since }),
      supabaseAdmin.rpc('analytics_time', { since_ts: since }),
      supabaseAdmin.rpc('analytics_daily', { since_ts: since }),
    ]);

    const uniqueSessions = new Set((pvRes.data || []).map(r => r.session_id)).size;
    res.json({
      ok: true, days,
      totalPageviews: pvRes.data?.length || 0, uniqueSessions,
      topPages: topRes.data || [], sources: srcRes.data || [],
      channels: chRes.data || [], devices: devRes.data || [],
      clicks: clkRes.data || [], scrollData: scrRes.data || [],
      timeData: tmRes.data || [], daily: dayRes.data || [],
    });
  } catch (e) { console.error('[analytics] Summary:', e.message); res.status(500).json({ error: 'Erro ao buscar analytics.' }); }
});

// ─── SITEMAP.XML ─────────────────────────────────────────────────────────────
app.get('/sitemap.xml', async (req, res) => {
  const { data: posts } = await supabase
    .from('posts').select('slug,updated_at,created_at').eq('published',true).order('created_at',{ascending:false});
  const urls = (posts||[]).map(p => {
    const lastmod = new Date(p.updated_at||p.created_at).toISOString().split('T')[0];
    return `\n  <url><loc>${SITE_URL}/post/${esc(p.slug)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
  }).join('');
  res.header('Content-Type','application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_URL}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>${urls}</urlset>`);
});

// ─── ROBOTS.TXT ──────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${SITE_URL}/sitemap.xml`);
});

// ─── ADMIN — arquivos HTML protegidos por cookie de sessão ──────────────────
// login.html é o único arquivo admin acessível sem sessão.
// dashboard, editor e banners exigem cookie sb-* válido antes de servir o HTML.
// Isso impede que alguém sem conta inspecione o código-fonte das páginas admin.
app.get('/admin', (req, res) => res.redirect('/admin/login.html'));
app.get('/admin/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

// Middleware leve: verifica presença do cookie de sessão Supabase
// (validação completa do token ocorre no cliente via SDK)
function adminCookieGuard(req, res, next) {
  const cookies = req.headers.cookie || '';
  // Cookie de sessão do Supabase tem prefixo 'sb-' seguido do ref do projeto
  const hasSession = /sb-[a-z]+-auth-token/.test(cookies);
  if (!hasSession) {
    return res.redirect('/admin/login.html');
  }
  next();
}

app.get('/admin/dashboard.html', adminCookieGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});
app.get('/admin/editor.html', adminCookieGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'editor.html'));
});
app.get('/admin/banners.html', adminCookieGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'banners.html'));
});
app.get('/admin/scheduled.html', adminCookieGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'scheduled.html'));
});
app.get('/admin/analytics.html', adminCookieGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'analytics.html'));
});
app.get('/admin/preview.html', adminCookieGuard, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'preview.html'));
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
function notFoundPage() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>404 – A2KF Blog</title><link rel="icon" type="image/png" href="/logo.png"/><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',sans-serif;background:#0A0A0A;color:#fff;min-height:100vh;display:flex;flex-direction:column;}nav{background:#0A0A0A;border-bottom:3px solid #FFD400;padding:0 1.5rem;height:64px;display:flex;align-items:center;}nav img{height:44px;width:auto;}.hero{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:3rem 1.5rem;}.code{font-family:'Bebas Neue',sans-serif;font-size:clamp(6rem,20vw,10rem);color:#FFD400;line-height:1;letter-spacing:4px;}.msg{font-family:'Bebas Neue',sans-serif;font-size:clamp(1.5rem,5vw,2.5rem);letter-spacing:1px;margin:.5rem 0 1rem;}.sub{color:#666;font-size:15px;max-width:420px;line-height:1.6;margin-bottom:2rem;}.btn-home{background:#FFD400;color:#000;font-weight:700;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;padding:12px 28px;text-decoration:none;display:inline-block;}</style></head><body><nav><a href="/"><img src="/logo.png" alt="A2KF"/></a></nav><div class="hero"><div class="code">404</div><div class="msg">PÁGINA NÃO ENCONTRADA</div><p class="sub">O conteúdo que você procura não existe ou foi movido.</p><a href="/" class="btn-home">← Voltar ao Blog</a></div></body></html>`;
}

app.use(async (req, res) => res.status(404).send(notFoundPage()));

app.listen(PORT, () => console.log(`A2KF Blog rodando na porta ${PORT}`));

// ─── ANALYTICS ROUTES (inseridas após as rotas existentes) ───────────────────
