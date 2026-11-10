// yampi.js — Produtos em destaque (Yampi) para o blog A2KF
// Uso no server.js:  require('./yampi')(app, { requireAuth });

const YAMPI_API_KEY = process.env.YAMPI_API_KEY || '';
const YAMPI_TOKEN   = process.env.YAMPI_TOKEN || '';
const YAMPI_ALIAS   = process.env.YAMPI_ALIAS || 'a2kf-suplementos2';
const STORE_URL     = 'https://www.a2kfsuplementos.com.br';

const TTL        = 2 * 60 * 1000;       // cache fresco: 2 min (antes 5)
const STALE_MAX  = 60 * 60 * 1000;      // cache antigo só vale como fallback por 1h
let cache = { products: null, ts: 0 };

const num = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Preço de UM sku: "de" (list) e "por" (current), sempre do MESMO sku.
function skuPrices(s) {
  let list  = num(s.price_sale) || num(s.price);
  const promo = num(s.price_discount) || num(s.promotional_price) || num(s.price_with_discount);
  if (!list && promo) list = promo;
  const current = promo > 0 && promo < list ? promo : list;
  return { list, current };
}

function skuAvailable(s) {
  if (s.enabled === false || s.blocked_sale === true) return false;
  return true;
}

function skuInStock(s) {
  if (s.total_in_stock == null) return true;           // estoque não gerenciado
  return Number(s.total_in_stock) > 0;
}

function pickSku(skus) {
  const priced = skus
    .map(s => ({ s, ...skuPrices(s) }))
    .filter(x => x.current > 0);

  // Preferência em cascata: disponível + em estoque -> disponível -> qualquer SKU com preço.
  // Nunca descarta o produto só porque os campos de status vieram diferentes do esperado.
  const tiers = [
    priced.filter(x => skuAvailable(x.s) && skuInStock(x.s)),
    priced.filter(x => skuAvailable(x.s)),
    priced,
  ];
  const pool = tiers.find(t => t.length) || [];

  // Menor preço final ("a partir de")
  return pool.sort((a, b) => a.current - b.current)[0] || null;
}

function parseProducts(parsed) {
  return (parsed.data || []).map(p => {
    const best = pickSku(p.skus?.data || []);
    if (!best) {
      console.warn(`[yampi] Produto sem preço válido, ignorado: ${p.name} (skus: ${(p.skus?.data || []).length})`);
      return null;
    }

    const images = p.images?.data || [];
    const image = images.length
      ? (images[0].thumb?.url || images[0].small?.url || images[0].large?.url || images[0].url || '')
      : '';
    const url = p.url?.startsWith('http') ? p.url : `${STORE_URL}/${p.url || p.slug || p.id}`;
    const hasDiscount = best.current < best.list;

    return {
      id: p.id,
      name: p.name,
      slug: p.slug || '',
      image,
      price: best.current,
      originalPrice: hasDiscount ? best.list : 0,
      url,
    };
  }).filter(p => p && p.name && p.price > 0);
}

async function fetchYampi() {
  const res = await fetch(
    `https://api.dooki.com.br/v2/${YAMPI_ALIAS}/catalog/products?include=images,skus&limit=8&page=1&sortBy=total_sold&sortDirection=desc`,
    {
      headers: {
        'User-Token': YAMPI_TOKEN,
        'User-Secret-Key': YAMPI_API_KEY,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) throw new Error(`Yampi HTTP ${res.status}`);
  return res.json();
}

module.exports = function registerYampiRoutes(app, { requireAuth }) {
  app.get('/api/produtos-destaque', async (req, res) => {
    if (!YAMPI_API_KEY) return res.status(503).json({ error: 'YAMPI_API_KEY não configurada.' });

    const now = Date.now();
    const force = req.query.refresh === '1';
    res.set('Cache-Control', 'no-cache, must-revalidate'); // navegador sempre revalida

    if (!force && cache.products && now - cache.ts < TTL) {
      return res.json({ success: true, products: cache.products, cached: true });
    }

    try {
      const parsed = await fetchYampi();
      const products = parseProducts(parsed);
      console.log(`[yampi] Recebidos: ${parsed.data?.length || 0} | válidos: ${products.length}`);
      if (!products.length) throw new Error('Nenhum produto válido');
      cache = { products, ts: now };
      return res.json({ success: true, products });
    } catch (e) {
      console.error('[yampi] Erro:', e.message);
      if (cache.products && now - cache.ts < STALE_MAX) {
        return res.json({ success: true, products: cache.products, fallback: true });
      }
      return res.status(502).json({ error: 'Erro ao buscar produtos da Yampi.' });
    }
  });

  // Diagnóstico (só admin logado): mostra os campos de preço crus de cada SKU
  // para comparar com o que a loja exibe. Acesse com Authorization: Bearer <token>.
  app.get('/api/produtos-destaque/debug', requireAuth, async (req, res) => {
    try {
      const parsed = await fetchYampi();
      res.json((parsed.data || []).map(p => ({
        name: p.name,
        escolhido: (() => { const b = pickSku(p.skus?.data || []); return b && { list: b.list, current: b.current, sku: b.s.id }; })(),
        skus: (p.skus?.data || []).map(s => ({
          id: s.id,
          price: s.price,
          price_sale: s.price_sale,
          price_discount: s.price_discount,
          promotional_price: s.promotional_price,
          enabled: s.enabled,
          blocked_sale: s.blocked_sale,
          total_in_stock: s.total_in_stock,
        })),
      })));
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
};
