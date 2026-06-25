/**
 * A2KF Analytics Tracker
 * Inclua este script no final do <body> de index.html e das páginas de post.
 * <script src="/analytics.js"></script>
 *
 * Rastreia: pageviews, cliques, scroll depth, tempo na página.
 * Não coleta IP nem dados pessoais.
 */
(function () {
  'use strict';

  // ── Gera ou recupera session_id (dura enquanto a aba estiver aberta) ─────
  let sessionId = sessionStorage.getItem('a2kf_sid');
  if (!sessionId) {
    sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('a2kf_sid', sessionId);
  }

  // ── Device detection ─────────────────────────────────────────────────────
  function getDevice() {
    const w = window.innerWidth;
    if (w <= 768) return 'mobile';
    if (w <= 1024) return 'tablet';
    return 'desktop';
  }

  // ── Lê parâmetros UTM da URL ──────────────────────────────────────────────
  function getUTM() {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source:   p.get('utm_source')   || '',
      utm_medium:   p.get('utm_medium')   || '',
      utm_campaign: p.get('utm_campaign') || '',
    };
  }

  // ── Normaliza o path como identificador da página ─────────────────────────
  const page = window.location.pathname;
  const pageTitle = document.title;
  const referrer = document.referrer;
  const utm = getUTM();

  // ── Envia evento para o servidor ──────────────────────────────────────────
  function send(payload) {
    // Usa sendBeacon quando disponível (mais confiável no unload)
    const body = JSON.stringify({
      session_id: sessionId,
      device: getDevice(),
      page,
      page_title: pageTitle,
      referrer,
      ...utm,
      ...payload,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/event', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }

  // ── 1. PAGEVIEW ───────────────────────────────────────────────────────────
  send({ event_type: 'pageview' });

  // ── 2. SCROLL DEPTH ───────────────────────────────────────────────────────
  let maxScroll = 0;
  let scrollSent25 = false, scrollSent50 = false, scrollSent75 = false, scrollSent100 = false;

  function onScroll() {
    const scrolled = window.scrollY + window.innerHeight;
    const total = document.documentElement.scrollHeight;
    const pct = Math.round((scrolled / total) * 100);
    if (pct > maxScroll) maxScroll = pct;

    // Marca milestones (só envia uma vez cada)
    if (!scrollSent25 && maxScroll >= 25)  { scrollSent25  = true; send({ event_type: 'scroll', scroll_depth: 25  }); }
    if (!scrollSent50 && maxScroll >= 50)  { scrollSent50  = true; send({ event_type: 'scroll', scroll_depth: 50  }); }
    if (!scrollSent75 && maxScroll >= 75)  { scrollSent75  = true; send({ event_type: 'scroll', scroll_depth: 75  }); }
    if (!scrollSent100 && maxScroll >= 100) { scrollSent100 = true; send({ event_type: 'scroll', scroll_depth: 100 }); }
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  // ── 3. TEMPO NA PÁGINA ────────────────────────────────────────────────────
  const startTime = Date.now();
  let timeSent = false;

  function sendTime() {
    if (timeSent) return;
    timeSent = true;
    const seconds = Math.round((Date.now() - startTime) / 1000);
    if (seconds >= 2) send({ event_type: 'time_on_page', time_seconds: seconds, scroll_depth: maxScroll });
  }

  // Envia no unload e também quando a aba fica oculta
  window.addEventListener('beforeunload', sendTime);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendTime();
  });

  // ── 4. CLIQUES ────────────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    const el = e.target.closest('a, button, [data-track]');
    if (!el) return;

    const href = el.href || el.getAttribute('data-href') || '';
    const text = (el.innerText || el.getAttribute('aria-label') || '').trim().substring(0, 100);

    // Classifica o tipo de clique
    let target = 'outro';
    if (href.includes('a2kfsuplementos.com.br') && !href.includes('blog.')) target = 'loja';
    else if (href.includes('wa.me') || href.includes('whatsapp')) target = 'whatsapp';
    else if (href.includes('instagram.com')) target = 'instagram';
    else if (href.includes('youtube.com')) target = 'youtube';
    else if (el.closest('.newsletter-form, [id*="newsletter"]')) target = 'newsletter';
    else if (el.closest('.produto-card, .produto-btn')) target = 'produto';
    else if (href.includes('/post/')) target = 'post';
    else if (href && !href.includes(window.location.hostname) && href.startsWith('http')) target = 'externo';
    else if (el.closest('nav')) target = 'nav';
    else if (el.closest('.share-btn, .share-box')) target = 'compartilhar';
    else if (el.closest('#exitPopup')) target = 'exit_popup';
    else if (el.id === 'btnLoadMore') target = 'carregar_mais';

    send({
      event_type: 'click',
      click_target: target,
      click_text: text,
      click_url: href.substring(0, 300),
    });
  }, true);

})();
