const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// CONFIGURAÇÃO — coloque no Render em Environment Variables
// =============================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'SUPABASE_URL_AQUI';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'SUPABASE_ANON_KEY_AQUI';
const SITE_URL = process.env.SITE_URL || 'https://blog.a2kfsuplementos.com.br';
// =============================================

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Serve static files (CSS, JS, images)
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_LIST_ID = parseInt(process.env.BREVO_LIST_ID || '5');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// ─── HOME ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── POST PAGE (URL limpa com slug) ─────────────────────────────────────────
app.get('/post/:slug', async (req, res) => {
  const { slug } = req.params;

  const { data: post, error } = await supabase
    .from('posts')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single();

  if (error || !post) {
    return res.status(404).send(notFoundPage());
  }

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

  <!-- Open Graph (WhatsApp, Facebook, Instagram) -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${post.title}" />
  <meta property="og:description" content="${excerpt}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:site_name" content="A2KF Suplementos" />
  <meta property="article:published_time" content="${post.created_at}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${post.title}" />
  <meta name="twitter:description" content="${excerpt}" />
  <meta name="twitter:image" content="${image}" />

  <!-- Canonical -->
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/png" href="/logo.png" />

  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
  
  <!-- Google Analytics GA4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-TN3RMJHTKX"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-TN3RMJHTKX');
  </script>
  
  <style>
    :root { --yellow:#FFD400; --black:#0A0A0A; --white:#fff; --gray:#F4F4F2; --border:#E5E5E0; --muted:#6B6B6B; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'DM Sans',sans-serif; background:var(--white); color:var(--black); }

    nav {
      position:sticky; top:0; z-index:100;
      background:var(--black); border-bottom:3px solid var(--yellow);
      padding:0 2rem; display:flex; align-items:center; justify-content:space-between; height:130px;
    }
    .nav-logo { text-decoration:none; }
    .nav-logo img { height:120px; width:auto; display:block; }
    .nav-links { display:flex; gap:2rem; align-items:center; }
    .nav-links a { color:#ccc; text-decoration:none; font-size:14px; font-weight:500; transition:color .2s; }
    .nav-links a:hover { color:var(--yellow); }
    .nav-social { display:flex; gap:.5rem; align-items:center; }
    .nav-social-icon {
      color:#888; display:flex; align-items:center; justify-content:center;
      width:34px; height:34px; border:1px solid #222; transition:all .2s;
    }
    .nav-social-icon:hover { color:var(--yellow); border-color:var(--yellow); background:#111; }
    .nav-admin-btn { background:var(--yellow); color:var(--black); font-family:'DM Sans',sans-serif; font-weight:700; font-size:13px; padding:8px 18px; text-decoration:none; letter-spacing:1px; text-transform:uppercase; }

    .post-hero {
      background:var(--black); color:var(--white); padding:3rem 2rem 2.5rem;
      border-bottom:3px solid var(--yellow);
    }
    .post-hero-inner { max-width:800px; margin:0 auto; }
    .post-meta { display:flex; gap:1rem; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; }
    .post-category { background:var(--yellow); color:var(--black); font-size:10px; font-weight:700; letter-spacing:2px; text-transform:uppercase; padding:3px 10px; }
    .post-date { font-size:13px; color:#888; }
    .post-title { font-family:'Bebas Neue',sans-serif; font-size:clamp(2rem,6vw,4rem); line-height:1; letter-spacing:1px; }
    .post-excerpt { color:#aaa; font-size:1.1rem; line-height:1.6; margin-top:1rem; max-width:640px; }

    .post-cover { width:100%; max-height:480px; object-fit:cover; display:block; }

    .post-body { max-width:800px; margin:0 auto; padding:3rem 2rem; }
    .post-body h2 { font-family:'Bebas Neue',sans-serif; font-size:2rem; letter-spacing:1px; margin:2rem 0 .75rem; }
    .post-body h3 { font-size:1.2rem; font-weight:700; margin:1.5rem 0 .5rem; }
    .post-body p { font-size:16px; line-height:1.85; color:#222; margin-bottom:1.25rem; }
    .post-body ul, .post-body ol { padding-left:1.5rem; margin-bottom:1.25rem; }
    .post-body li { font-size:16px; line-height:1.85; color:#222; margin-bottom:.4rem; }
    .post-body blockquote { border-left:4px solid var(--yellow); padding:1rem 1.5rem; background:var(--gray); margin:1.5rem 0; font-style:italic; color:#444; }
    .post-body img { width:100%; height:auto; margin:1.5rem 0; }
    .post-body a { color:var(--black); font-weight:700; border-bottom:2px solid var(--yellow); text-decoration:none; }

    /* BUSCA NO POST */
    .post-search {
      background:var(--gray); border-bottom:1px solid var(--border); padding:1rem 2rem; display:flex; justify-content:center;
    }
    .post-search-inner { display:flex; gap:0; width:100%; max-width:560px; }
    .post-search input {
      flex:1; padding:11px 18px; border:2px solid var(--border); border-right:none;
      font-family:'DM Sans',sans-serif; font-size:15px; outline:none; transition:border-color .2s;
    }
    .post-search input:focus { border-color:var(--yellow); }
    .post-search button {
      background:var(--yellow); color:var(--black); border:none; padding:11px 20px;
      font-family:'DM Sans',sans-serif; font-weight:700; font-size:14px; cursor:pointer; white-space:nowrap;
    }

    /* NEWSLETTER */
    .newsletter-box {
      background:var(--black); color:var(--white); padding:2.5rem; margin-top:3rem; text-align:center;
      border-top:4px solid var(--yellow);
    }
    .newsletter-box h3 { font-family:'Bebas Neue',sans-serif; font-size:2rem; letter-spacing:1px; margin-bottom:.5rem; }
    .newsletter-box p { color:#aaa; font-size:14px; margin-bottom:1.5rem; }
    .newsletter-form { display:flex; gap:0; max-width:460px; margin:0 auto; }
    .newsletter-form input {
      flex:1; padding:12px 18px; border:none; font-family:'DM Sans',sans-serif; font-size:15px;
      outline:none; background:#1a1a1a; color:#fff; border:2px solid #333; transition:border-color .2s;
    }
    .newsletter-form input:focus { border-color:var(--yellow); }
    .newsletter-form button {
      background:var(--yellow); color:var(--black); border:none; padding:12px 22px;
      font-family:'DM Sans',sans-serif; font-weight:700; font-size:13px; letter-spacing:1px;
      text-transform:uppercase; cursor:pointer; white-space:nowrap; transition:opacity .2s;
    }
    .newsletter-form button:hover { opacity:.9; }
    .newsletter-msg { margin-top:1rem; font-size:13px; min-height:20px; }
    .share-box { border-top:2px solid var(--border); margin-top:3rem; padding-top:2rem; }
    .share-box h4 { font-family:'Bebas Neue',sans-serif; font-size:1.4rem; letter-spacing:1px; margin-bottom:1rem; }
    .share-btns { display:flex; gap:.75rem; flex-wrap:wrap; }
    .share-btn {
      display:inline-flex; align-items:center; gap:8px; padding:10px 20px;
      font-family:'DM Sans',sans-serif; font-weight:700; font-size:13px;
      text-transform:uppercase; letter-spacing:.5px; cursor:pointer; border:none; text-decoration:none; transition:opacity .2s;
    }
    .share-btn:hover { opacity:.85; }
    .share-btn-wpp { background:#25D366; color:#fff; }
    .share-btn-fb { background:#1877F2; color:#fff; }
    .share-btn-ig { background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888); color:#fff; }
    .share-btn-copy { background:var(--black); color:#fff; }
    .share-btn-copy.copied { background:var(--yellow); color:var(--black); }

    /* BANNER LOJA */
    .promo-banner {
      background:var(--yellow); padding:2rem; margin-top:3rem;
      display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;
    }
    .promo-banner-text h3 { font-family:'Bebas Neue',sans-serif; font-size:1.6rem; letter-spacing:1px; }
    .promo-banner-text p { font-size:14px; color:#333; margin-top:.25rem; }
    .promo-banner-btn { background:var(--black); color:#FFD400; padding:12px 28px; font-family:'DM Sans',sans-serif; font-weight:700; font-size:14px; text-transform:uppercase; letter-spacing:1px; text-decoration:none; white-space:nowrap; display:inline-block; }

    /* POSTS RELACIONADOS */
    .related { background:var(--gray); padding:3rem 2rem; border-top:2px solid var(--border); }
    .related-inner { max-width:1100px; margin:0 auto; }
    .related h2 { font-family:'Bebas Neue',sans-serif; font-size:2rem; letter-spacing:1px; margin-bottom:1.5rem; }
    .related-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:1.5rem; }
    .related-card { background:var(--white); border:1.5px solid var(--border); text-decoration:none; color:inherit; display:block; transition:border-color .2s,transform .2s; }
    .related-card:hover { border-color:var(--yellow); transform:translateY(-3px); }
    .related-card-img { width:100%; height:160px; object-fit:cover; display:block; background:var(--black); }
    .related-card-placeholder { width:100%; height:160px; background:var(--black); display:flex; align-items:center; justify-content:center; font-family:'Bebas Neue',sans-serif; font-size:2rem; color:var(--yellow); }
    .related-card-body { padding:1.25rem; }
    .related-card-cat { background:var(--yellow); color:var(--black); font-size:9px; font-weight:700; letter-spacing:2px; text-transform:uppercase; padding:2px 8px; display:inline-block; margin-bottom:.5rem; }
    .related-card-title { font-family:'Bebas Neue',sans-serif; font-size:1.2rem; line-height:1.1; }

    footer { background:var(--black); border-top:3px solid var(--yellow); }
    .footer-inner { max-width:1100px; margin:0 auto; padding:2.5rem 2rem; display:flex; flex-direction:column; align-items:center; gap:1.5rem; }
    .footer-social { display:flex; gap:1rem; flex-wrap:wrap; justify-content:center; }
    .footer-social-icon {
      display:flex; align-items:center; gap:8px; color:#666; text-decoration:none;
      font-size:13px; font-weight:500; padding:8px 16px; border:1px solid #222; transition:all .2s;
    }
    .footer-social-icon:hover { color:var(--yellow); border-color:var(--yellow); background:#111; }
    .footer-copy { color:#444; font-size:12px; }
    .footer-copy span { color:var(--yellow); }

    @media(max-width:600px) {
      .promo-banner { flex-direction:column; text-align:center; }
    }
  </style>
</head>
<body>

<nav>
  <a href="/" class="nav-logo">
    <img src="/logo.png" alt="A2KF Suplementos" style="height:120px;width:auto;display:block;" />
  </a>
  <div class="nav-links">
    <a href="/">Blog</a>
    <a href="https://a2kfsuplementos.com.br">Loja</a>
    <div class="nav-social">
      <a href="https://www.instagram.com/a2kfsuplementos" target="_blank" rel="noopener" aria-label="Instagram" class="nav-social-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
      </a>
      <a href="https://wa.me/5521977377802" target="_blank" rel="noopener" aria-label="WhatsApp" class="nav-social-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.134.558 4.133 1.535 5.865L.057 23.535a.75.75 0 00.908.908l5.67-1.478A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.92 0-3.72-.504-5.27-1.385l-.378-.219-3.924 1.022 1.022-3.924-.219-.378A9.952 9.952 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
      </a>
      <a href="https://www.youtube.com/@A2KFSuplementos" target="_blank" rel="noopener" aria-label="YouTube" class="nav-social-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
      </a>
    </div>
    <a href="/admin/login.html" class="nav-admin-btn">Admin</a>
  </div>
</nav>

<div class="post-search">
  <div class="post-search-inner">
    <input type="text" id="postSearchInput" placeholder="Buscar outros artigos..." onkeydown="if(event.key==='Enter') searchPosts()" />
    <button onclick="searchPosts()">Buscar</button>
  </div>
</div>

${post.cover_url ? `<img src="${post.cover_url}" class="post-cover" alt="${post.title}" />` : ''}

<div class="post-hero">
  <div class="post-hero-inner">
    <div class="post-meta">
      ${post.category ? `<span class="post-category">${post.category}</span>` : ''}
      <span class="post-date">${date}</span>
    </div>
    <h1 class="post-title">${post.title}</h1>
    ${post.excerpt ? `<p class="post-excerpt">${post.excerpt}</p>` : ''}
  </div>
</div>

<div class="post-body">
  ${post.content || ''}

  <!-- COMPARTILHAR -->
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

  <!-- BANNER LOJA -->
  <div class="promo-banner">
    <div class="promo-banner-text">
      <h3>ENCONTRE OS MELHORES SUPLEMENTOS</h3>
      <p>Qualidade garantida, preço justo e entrega rápida para todo o Brasil.</p>
    </div>
    <a href="https://a2kfsuplementos.com.br" target="_blank" style="background:#000;color:#FFD400;padding:12px 28px;font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:1px;text-decoration:none;display:inline-block;">VISITAR LOJA →</a>
  </div>
  <!-- NEWSLETTER -->
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

<!-- POSTS RELACIONADOS -->
<div class="related" id="related">
  <div class="related-inner">
    <h2>ARTIGOS RELACIONADOS</h2>
    <div class="related-grid" id="relatedGrid">Carregando...</div>
  </div>
</div>

<footer>
  <div class="footer-inner">
    <div class="footer-social">
      <a href="https://www.instagram.com/a2kfsuplementos" target="_blank" rel="noopener" class="footer-social-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
        Instagram
      </a>
      <a href="https://wa.me/5521977377802" target="_blank" rel="noopener" class="footer-social-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.134.558 4.133 1.535 5.865L.057 23.535a.75.75 0 00.908.908l5.67-1.478A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.92 0-3.72-.504-5.27-1.385l-.378-.219-3.924 1.022 1.022-3.924-.219-.378A9.952 9.952 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
        WhatsApp
      </a>
      <a href="https://www.youtube.com/@A2KFSuplementos" target="_blank" rel="noopener" class="footer-social-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        YouTube
      </a>
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
    if (!email) { msg.style.color = '#ff8888'; msg.textContent = 'Digite seu email.'; return; }
    msg.style.color = '#aaa'; msg.textContent = 'Enviando...';
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.success) {
        msg.style.color = '#FFD400';
        msg.textContent = data.already ? '✓ Você já está cadastrado!' : '✓ Cadastrado com sucesso! Bem-vindo à família A2KF!';
        document.getElementById('newsletterEmail').value = '';
      } else {
        msg.style.color = '#ff8888'; msg.textContent = 'Erro ao cadastrar. Tente novamente.';
      }
    } catch { msg.style.color = '#ff8888'; msg.textContent = 'Erro de conexão.'; }
  }

  async function loadRelated() {
    const { data } = await _sb.from('posts')
      .select('id, title, slug, category, cover_url')
      .eq('published', true)
      .neq('slug', '${slug}')
      .eq('category', '${post.category || ''}')
      .limit(3);

    const grid = document.getElementById('relatedGrid');
    if (!data || !data.length) {
      document.getElementById('related').style.display = 'none';
      return;
    }
    grid.innerHTML = data.map(p => \`
      <a href="/post/\${p.slug}" class="related-card">
        \${p.cover_url
          ? \`<img src="\${p.cover_url}" class="related-card-img" alt="\${p.title}" />\`
          : \`<div class="related-card-placeholder">A2KF</div>\`}
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
      btn.textContent = '✓ Link Copiado!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copiar Link'; btn.classList.remove('copied'); }, 2500);
    });
  }

  loadRelated();
</script>

<!-- ============================================================
  BANNER DE COOKIES — A2KF Suplementos
  Cole este bloco antes de </body> em: index.html e server.js
  ============================================================ -->

<!-- COOKIE BANNER HTML -->
<div id="cookieBanner" style="display:none;" aria-live="polite" role="dialog" aria-label="Aviso de cookies">
  <div class="cookie-inner">
    <div class="cookie-text">
      <span class="cookie-icon">🍪</span>
      <div>
        <strong>Usamos cookies</strong>
        <p>Este site usa cookies essenciais para funcionar corretamente e para enviar a newsletter. Nenhum dado é vendido a terceiros. <a href="/privacidade.html" target="_blank">Saiba mais</a></p>
      </div>
    </div>
    <div class="cookie-actions">
      <a href="/privacidade.html" target="_blank" class="cookie-btn-link">Política completa</a>
      <button onclick="rejectCookies()" class="cookie-btn-reject">Recusar</button>
      <button onclick="acceptCookies()" class="cookie-btn-accept">Aceitar</button>
    </div>
  </div>
</div>

<!-- COOKIE BANNER CSS -->
<style>
  #cookieBanner {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
    background: #111;
    border-top: 3px solid #FFD400;
    padding: 1.25rem 2rem;
    box-shadow: 0 -4px 24px rgba(0,0,0,.4);
    animation: slideUp .35s ease;
  }
  @keyframes slideUp {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  .cookie-inner {
    max-width: 1100px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between;
    gap: 1.5rem; flex-wrap: wrap;
  }
  .cookie-text {
    display: flex; align-items: flex-start; gap: 1rem; flex: 1; min-width: 260px;
  }
  .cookie-icon { font-size: 1.6rem; line-height: 1; flex-shrink: 0; margin-top: 2px; }
  .cookie-text strong { display: block; color: #FFD400; font-size: 14px; font-weight: 700; letter-spacing: .5px; margin-bottom: .25rem; }
  .cookie-text p { color: #999; font-size: 13px; line-height: 1.5; margin: 0; }
  .cookie-text a { color: #FFD400; font-weight: 600; text-decoration: none; border-bottom: 1px solid rgba(255,212,0,.3); }
  .cookie-text a:hover { border-color: #FFD400; }
  .cookie-actions {
    display: flex; align-items: center; gap: .75rem; flex-shrink: 0; flex-wrap: wrap;
  }
  .cookie-btn-link {
    color: #666; font-size: 12px; font-family: 'DM Sans', sans-serif;
    text-decoration: none; white-space: nowrap; padding: 8px 0;
    border-bottom: 1px solid #333; transition: color .2s, border-color .2s;
  }
  .cookie-btn-link:hover { color: #aaa; border-color: #666; }
  .cookie-btn-reject {
    background: transparent; color: #888; border: 1px solid #333;
    font-family: 'DM Sans', sans-serif; font-weight: 700; font-size: 12px;
    letter-spacing: 1px; text-transform: uppercase; padding: 9px 18px;
    cursor: pointer; transition: all .2s; white-space: nowrap;
  }
  .cookie-btn-reject:hover { border-color: #888; color: #ccc; }
  .cookie-btn-accept {
    background: #FFD400; color: #0A0A0A; border: none;
    font-family: 'DM Sans', sans-serif; font-weight: 700; font-size: 12px;
    letter-spacing: 1px; text-transform: uppercase; padding: 10px 22px;
    cursor: pointer; transition: opacity .2s; white-space: nowrap;
  }
  .cookie-btn-accept:hover { opacity: .9; }

  @media (max-width: 600px) {
    #cookieBanner { padding: 1.25rem; }
    .cookie-actions { width: 100%; justify-content: flex-end; }
    .cookie-btn-link { display: none; }
  }
</style>

<!-- COOKIE BANNER JS -->
<script>
  (function() {
    var consent = localStorage.getItem('a2kf_cookie_consent');
    if (!consent) {
      document.getElementById('cookieBanner').style.display = 'block';
    }
  })();

  function acceptCookies() {
    localStorage.setItem('a2kf_cookie_consent', 'accepted');
    hideBanner();
  }

  function rejectCookies() {
    localStorage.setItem('a2kf_cookie_consent', 'rejected');
    hideBanner();
  }

  function hideBanner() {
    var b = document.getElementById('cookieBanner');
    b.style.transition = 'transform .3s ease, opacity .3s ease';
    b.style.transform = 'translateY(100%)';
    b.style.opacity = '0';
    setTimeout(function() { b.style.display = 'none'; }, 320);
  }
</script>
<!-- BOTÃO VOLTAR AO TOPO -->
<button id="backToTop" onclick="window.scrollTo({top:0,behavior:'smooth'})" aria-label="Voltar ao topo" title="Voltar ao topo">
  <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
</button>
<style>
  #backToTop {
    position: fixed; bottom: 2rem; right: 2rem; z-index: 998;
    width: 48px; height: 48px;
    background: #FFD400; color: #0A0A0A; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,.25);
    opacity: 0; visibility: hidden;
    transform: translateY(12px);
    transition: opacity .3s ease, transform .3s ease, visibility .3s ease, background .2s;
  }
  #backToTop.visible { opacity: 1; visibility: visible; transform: translateY(0); }
  #backToTop:hover { background: #e6be00; }
  #backToTop:active { transform: translateY(2px); }
  @media (max-width: 600px) {
    #backToTop { bottom: 1.25rem; right: 1.25rem; width: 42px; height: 42px; }
  }
</style>
<script>
  (function() {
    var btn = document.getElementById('backToTop');
    window.addEventListener('scroll', function() {
      btn.classList.toggle('visible', window.scrollY > 320);
    }, { passive: true });
  })();
</script>
</body>
</html>`);
});

// ─── SITEMAP.XML ─────────────────────────────────────────────────────────────
app.get('/sitemap.xml', async (req, res) => {
  const { data: posts } = await supabase
    .from('posts')
    .select('slug, updated_at')
    .eq('published', true)
    .order('updated_at', { ascending: false });

  const urls = (posts || []).map(p => `
  <url>
    <loc>${SITE_URL}/post/${p.slug}</loc>
    <lastmod>${new Date(p.updated_at).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

  res.header('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${urls}
</urlset>`);
});

// ─── ROBOTS.TXT ──────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${SITE_URL}/sitemap.xml`);
});

// ─── ADMIN (serve static) ────────────────────────────────────────────────────
app.get('/admin', (req, res) => res.redirect('/admin/login.html'));

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).send(notFoundPage()));

function notFoundPage() {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>404 – A2KF Blog</title>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;700&display=swap" rel="stylesheet"/>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',sans-serif;background:#0A0A0A;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center}h1{font-family:'Bebas Neue',sans-serif;font-size:8rem;color:#FFD400;line-height:1}p{color:#888;margin:1rem 0 2rem}a{background:#FFD400;color:#000;padding:12px 28px;font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:1px}</style>
  </head><body><div><h1>404</h1><p>Página não encontrada.</p><a href="/">Voltar ao Blog</a></div></body></html>`;
}

app.listen(PORT, () => console.log(`A2KF Blog rodando na porta ${PORT}`));
