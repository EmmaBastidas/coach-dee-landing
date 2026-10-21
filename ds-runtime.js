/* ds-runtime.js · coachdsantos.com ← DS Hub (v1, 2026-10-19)
 *
 * La landing es HTML estático (v2.2). Este script lee la configuración que Dee publica desde el Hub
 * (GET <HUB>/api/ds/site.json) y la aplica sobre el HTML: textos, listas (planes, atletas, testimonios,
 * FAQ), medios, colores, contacto, aviso. Si el Hub no responde en 2.5 s, está caído o se entra con
 * ?ds=off, no hace NADA: la página queda exactamente como se desplegó.
 *
 *   ?ds=off      → desactivado (prueba de paridad: el HTML sin runtime).
 *   ?preview=1   → modo vista previa: no descarga nada; aplica el borrador que el Hub le manda por
 *                  postMessage ({type:'ds:config', content, brand}) y avisa con {type:'ds:ready'}.
 *
 * Marcado que entiende (todo opcional; lo que no está marcado nunca se toca):
 *   data-ds="ruta"                   texto (ruta *_html → HTML saneado; data-ds-nl → \n = <br>)
 *   data-ds-fmt="usd|handle"         formato del valor
 *   data-ds-attr="src=ruta;alt=ruta" atributos (src/href/poster/srcset pasan por resolveURL)
 *   data-ds-if="ruta|!ruta"          hidden si falso
 *   data-ds-class="cond ? a b : c"   clases condicionales (cond = ruta, !ruta o ruta==valor)
 *   data-ds-list="ruta" [data-ds-keyby="id"] [data-ds-rebuild]   contenedor de lista; hijos = plantillas
 *     hijos: data-ds-key="valor" (plantilla para ese id/valor), data-ds-default (plantilla por defecto)
 *     dentro de un ítem las rutas son relativas al ítem ("." = el ítem si es texto)
 *   data-ds-video="ruta"  {src,poster}  · data-ds-picture="ruta" {src,webp} · data-ds-bg="ruta"
 *   data-ds-cta                      texto reemplazado por la etiqueta de lista de espera si announcement.accepting=false
 * Rutas absolutas empiezan por content. o brand. ; los medios subidos al Hub se escriben pb:<col>/<id>/<archivo>.
 */
(function () {
  'use strict';
  var HUB_API = 'https://coach-dee-lab.mddv2l.easypanel.host'; // provisional → 'https://app.coachdsantos.com' cuando el DNS esté
  var HUB_ORIGINS = ['https://app.coachdsantos.com', 'https://coach-dee-lab.mddv2l.easypanel.host'];
  var CACHE_KEY = 'ds:site:v1';
  var TIMEOUT = 2500;

  var Q = new URLSearchParams(location.search);
  var MODE = Q.get('ds') === 'off' ? 'off' : (Q.get('preview') === '1' ? 'preview' : 'live');
  var state = { mode: MODE, source: null, applied: null, cfg: null, pending: null, templates: {}, errors: [] };
  window.__ds = state;
  if (MODE === 'off') return;

  // ------------------------------------------------------------------ utilidades
  function get(obj, path) {
    if (path === '.' || path === '') return obj;
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function resolve(path, scope) {
    if (/^(content|brand)\./.test(path)) return get(state.cfg, path);
    if (scope && scope.item !== undefined) return get(scope.item, path);
    return get(state.cfg, path);
  }
  function hexToRgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(' ');
  }
  function resolveURL(v) {
    if (v == null) return v;
    v = String(v);
    var pb = /^pb:([a-z0-9_]+)\/([a-z0-9]+)\/(.+)$/i.exec(v);
    if (pb) return HUB_API + '/api/files/' + pb[1] + '/' + pb[2] + '/' + pb[3];
    if (/^(https?:|mailto:|tel:|#|\/|data:|blob:)/i.test(v)) return v;
    return '/' + v; // ruta relativa del sitio (images/…, media/…) → absoluta (también sirve en /link/)
  }
  function sameURL(a, b) { try { return new URL(a, location.href).href === new URL(b, location.href).href; } catch (e) { return a === b; } }
  var ALLOWED = { BR: ['class'], SPAN: ['class'], STRONG: ['class'], EM: ['class'], B: [], I: ['class'], U: [], A: ['class', 'href', 'target', 'rel'] };
  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<body>' + String(html == null ? '' : html), 'text/html');
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (k) {
        if (k.nodeType === 3) return;
        if (k.nodeType !== 1) { k.remove(); return; }
        walk(k);
        var allow = ALLOWED[k.tagName];
        if (!allow) { while (k.firstChild) node.insertBefore(k.firstChild, k); k.remove(); return; }
        Array.prototype.slice.call(k.attributes).forEach(function (a) {
          if (allow.indexOf(a.name) < 0) k.removeAttribute(a.name);
          else if (a.name === 'href' && !/^(https?:\/\/|#|mailto:|tel:|\/)/i.test(a.value)) k.removeAttribute('href');
        });
      });
    })(doc.body);
    return doc.body.innerHTML;
  }
  function fmt(v, f) {
    if (f === 'usd') return '$' + Number(v);
    if (f === 'handle') return '@' + String(v).replace(/^@/, '');
    return v == null ? '' : String(v);
  }
  var WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
  function word(n) { return WORDS[n] || String(n); }
  function listOf(el) { return el.parentElement ? el.parentElement.closest('[data-ds-list]') : null; }
  function all(sel) { // incluye el contenido de <template> (Alpine clona desde ahí)
    var out = Array.prototype.slice.call(document.querySelectorAll(sel));
    Array.prototype.forEach.call(document.querySelectorAll('template'), function (t) {
      out = out.concat(Array.prototype.slice.call(t.content.querySelectorAll(sel)));
    });
    return out;
  }

  // ------------------------------------------------------------------ colores
  function setColors(colors) {
    if (!colors) return;
    var r = document.documentElement.style, map = { accent: '--accent', hover: '--accent-hover', link: '--accent-link', on_accent: '--on-accent' };
    Object.keys(map).forEach(function (k) { var rgb = hexToRgb(colors[k]); if (rgb) r.setProperty(map[k], rgb); });
  }

  // ------------------------------------------------------------------ relleno
  function fillText(el, v) {
    var path = el.getAttribute('data-ds');
    if (/_html(\.\d+)?$/.test(path) || el.hasAttribute('data-ds-html')) { el.innerHTML = sanitize(v); return; }
    var s = fmt(v, el.getAttribute('data-ds-fmt'));
    if (el.hasAttribute('data-ds-nl')) {
      el.textContent = '';
      String(s).split('\n').forEach(function (line, i) { if (i) el.appendChild(document.createElement('br')); el.appendChild(document.createTextNode(line)); });
      return;
    }
    if (el.textContent !== s) el.textContent = s;
  }
  function cond(expr, scope) {
    expr = expr.trim();
    var neg = expr[0] === '!'; if (neg) expr = expr.slice(1).trim();
    var m = /^([^=]+)==(.+)$/.exec(expr), v;
    if (m) v = String(resolve(m[1].trim(), scope)) === m[2].trim(); else v = !!resolve(expr, scope);
    return neg ? !v : v;
  }
  function fillEl(el, scope) {
    if (el.hasAttribute('data-ds')) fillText(el, resolve(el.getAttribute('data-ds'), scope));
    if (el.hasAttribute('data-ds-attr')) el.getAttribute('data-ds-attr').split(';').forEach(function (pair) {
      var i = pair.indexOf('='); if (i < 0) return;
      var attr = pair.slice(0, i).trim(), v = resolve(pair.slice(i + 1).trim(), scope);
      if (v == null) return;
      if (/^(src|href|poster|srcset)$/.test(attr)) {
        v = resolveURL(v);
        if (attr === 'src' && sameURL(el.getAttribute('src') || '', v)) return;
        if (attr === 'href' && /^https?:/i.test(v) && el.tagName === 'A') { el.target = '_blank'; el.rel = 'noopener'; }
        else if (attr === 'href' && el.tagName === 'A' && el.hasAttribute('data-ds-ext')) { el.removeAttribute('target'); el.removeAttribute('rel'); }
      }
      if (el.getAttribute(attr) !== String(v)) el.setAttribute(attr, v);
    });
    if (el.hasAttribute('data-ds-if')) el.hidden = !cond(el.getAttribute('data-ds-if'), scope);
    if (el.hasAttribute('data-ds-class')) {
      var m = /^(.+?)\?(.*?)(?::(.*))?$/.exec(el.getAttribute('data-ds-class'));
      if (m) {
        var on = cond(m[1], scope), a = m[2].trim().split(/\s+/).filter(Boolean), b = (m[3] || '').trim().split(/\s+/).filter(Boolean);
        (on ? b : a).forEach(function (c) { el.classList.remove(c); });
        (on ? a : b).forEach(function (c) { el.classList.add(c); });
      }
    }
    if (el.hasAttribute('data-ds-bg')) { var bg = resolve(el.getAttribute('data-ds-bg'), scope); if (bg) el.style.backgroundImage = 'url(' + JSON.stringify(resolveURL(bg)) + ')'; }
    if (el.hasAttribute('data-ds-picture')) {
      var p = resolve(el.getAttribute('data-ds-picture'), scope) || {}, src = el.querySelector('source'), img = el.querySelector('img');
      if (p.src && img && !sameURL(img.getAttribute('src'), resolveURL(p.src))) img.setAttribute('src', resolveURL(p.src));
      if (src) {
        var ss = resolveURL(p.webp || p.src);
        if (ss && !sameURL(src.getAttribute('srcset') || '', ss)) { src.setAttribute('srcset', ss); if (p.webp) src.setAttribute('type', 'image/webp'); else src.removeAttribute('type'); }
      }
    }
    if (el.hasAttribute('data-ds-video')) {
      var v2 = resolve(el.getAttribute('data-ds-video'), scope), so = el.querySelector('source'), changed = false;
      if (v2 && typeof v2 === 'object') {
        if (v2.poster && !sameURL(el.getAttribute('poster') || '', resolveURL(v2.poster))) { el.setAttribute('poster', resolveURL(v2.poster)); }
        if (v2.src && so && !sameURL(so.getAttribute('src') || '', resolveURL(v2.src))) { so.setAttribute('src', resolveURL(v2.src)); changed = true; }
        if (!v2.src && so && so.getAttribute('src')) { so.removeAttribute('src'); el.removeAttribute('poster'); changed = true; } // atleta sin clip: la tarjeta queda solo con la foto
      }
      if (changed) {
        var card = el.closest('[data-reel]');
        if (card) { var reel = card.querySelector('.reel'); if (reel) reel.classList.add('hidden'); card.classList.remove('reel-on'); delete el.dataset.reelInit; }
        try { el.load(); } catch (e) { /* noop */ }
      }
    }
  }
  function fillLists(root, scope) {
    var ctx = root === document ? null : root.closest('[data-ds-list]');
    var lists = Array.prototype.filter.call(root.querySelectorAll('[data-ds-list]'), function (l) { return listOf(l) === ctx; });
    lists.forEach(function (list) { fillList(list, scope); });
  }
  function fillList(list, scope) {
    var path = list.getAttribute('data-ds-list'), items = resolve(path, scope);
    if (!Array.isArray(items)) return;
    var keyby = list.getAttribute('data-ds-keyby'), rebuild = list.hasAttribute('data-ds-rebuild');
    var tid = path + '#' + (scope && scope.key != null ? scope.key : '');
    var tpl = state.templates[tid];
    if (!tpl) {
      tpl = { byKey: {}, def: null };
      Array.prototype.forEach.call(list.children, function (c, i) {
        var clone = c.cloneNode(true);
        if (c.hasAttribute('data-ds-key')) tpl.byKey[c.getAttribute('data-ds-key')] = clone;
        if (c.hasAttribute('data-ds-default') || (!tpl.def && i === 0)) tpl.def = clone;
        if (c.hasAttribute('data-ds-default')) tpl.def = clone;
      });
      state.templates[tid] = tpl;
    }
    var current = Array.prototype.slice.call(list.children), used = [];
    var visible = items.filter(function (it) { return !(it && typeof it === 'object' && it.visible === false); });
    visible.forEach(function (it, idx) {
      var key = keyby && it && typeof it === 'object' ? String(it[keyby]) : null, el = null;
      if (!rebuild) {
        if (key != null) el = current.filter(function (c) { return c.getAttribute('data-ds-key') === key && used.indexOf(c) < 0; })[0] || null;
        else el = current[idx] && used.indexOf(current[idx]) < 0 ? current[idx] : null;
      }
      if (!el) {
        el = ((key != null && tpl.byKey[key]) || tpl.def).cloneNode(true);
        if (key != null) el.setAttribute('data-ds-key', key);
      }
      used.push(el);
      if (list.children[idx] !== el) list.insertBefore(el, list.children[idx] || null);
      var sc = { item: it, index: idx, key: key, parent: scope };
      fillLists(el, sc);
      fillScope(el, sc);
    });
    Array.prototype.slice.call(list.children).forEach(function (c) { if (used.indexOf(c) < 0) c.remove(); });
  }
  var FILL_SEL = '[data-ds],[data-ds-attr],[data-ds-if],[data-ds-class],[data-ds-bg],[data-ds-picture],[data-ds-video]';
  function fillScope(root, scope) {
    var ctx = root === document ? null : root.closest('[data-ds-list]');
    var els = root === document ? all(FILL_SEL) : Array.prototype.slice.call(root.querySelectorAll(FILL_SEL));
    if (root !== document && root.matches(FILL_SEL)) els.unshift(root);
    els.forEach(function (el) { if (el === root || listOf(el) === ctx) fillEl(el, scope); });
  }

  // ------------------------------------------------------------------ derivados: precios, pliegues, JSON-LD, chat
  function priceInfo(content) {
    var vis = (content.plans || []).filter(function (p) { return p.visible !== false && isFinite(p.price); });
    if (!vis.length) return null;
    var prices = vis.map(function (p) { return Number(p.price); });
    return { min: Math.min.apply(null, prices), max: Math.max.apply(null, prices), n: vis.length, plans: vis };
  }
  function fixPriceText(s, pi) {
    if (!pi || !s) return s;
    return String(s).replace(/from \$\d+\/month/g, 'from $' + pi.min + '/month')
      .replace(/\b(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten) plans\b/g, word(pi.n) + ' plans');
  }
  function setFold(id, title, summary) {
    var s = document.getElementById(id); if (!s || !s.hasAttribute('data-fold')) return;
    var cur = s.getAttribute('data-fold').split('|');
    title = title == null ? cur[0] : title; summary = summary == null ? cur[1] || '' : summary;
    s.setAttribute('data-fold', title + '|' + summary);
    var b = s.querySelector(':scope > .fold-btn'); if (!b) return;
    var spans = b.querySelectorAll(':scope > span > span');
    if (spans[1]) spans[1].textContent = title;
    if (spans[2]) spans[2].textContent = summary;
  }
  function applyDerived(cfg) {
    var c = cfg.content || {}, pi = priceInfo(c);
    if (pi) {
      ['meta[name="description"]', 'meta[name="twitter:description"]'].forEach(function (sel) {
        var m = document.querySelector(sel); if (m) m.setAttribute('content', fixPriceText(m.getAttribute('content'), pi));
      });
      var pricing = document.getElementById('pricing');
      if (pricing && pricing.hasAttribute('data-fold')) { var f = pricing.getAttribute('data-fold').split('|'); setFold('pricing', f[0], fixPriceText(f[1], pi)); }
    }
    if (Array.isArray(c.faq)) { var ff = (document.getElementById('faq') || {}).getAttribute ? document.getElementById('faq').getAttribute('data-fold') : null; if (ff) setFold('faq', null, ff.split('|')[1].replace(/^(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve)\b/, word(c.faq.length))); }
    if (Array.isArray(c.testimonials)) { var tf = document.getElementById('testimonials'); if (tf && tf.hasAttribute('data-fold')) setFold('testimonials', null, tf.getAttribute('data-fold').split('|')[1].replace(/^(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve)\b/, word(c.testimonials.length))); }
    if (cfg.brand && cfg.brand.meta) {
      if (cfg.brand.meta.title && document.title !== cfg.brand.meta.title) document.title = cfg.brand.meta.title;
      var md = document.querySelector('meta[name="description"]');
      if (md && cfg.brand.meta.description) md.setAttribute('content', fixPriceText(cfg.brand.meta.description, pi));
    }
    updateJsonLd(c, pi);
    // aviso + lista de espera
    var ann = c.announcement || {}, bar = document.getElementById('ds-announce');
    if (bar) bar.hidden = !(ann.enabled && ann.message);
    if (ann.accepting === false && ann.waitlist_label) {
      all('[data-ds-cta]').forEach(function (el) { el.textContent = ann.waitlist_label; });
      all('input[name="subject"]').forEach(function (i) { if (!/WAITLIST/.test(i.value)) i.value = i.value + ' · WAITLIST'; });
    } else {
      all('input[name="subject"]').forEach(function (i) { i.value = i.value.replace(/ · WAITLIST$/, ''); });
    }
  }
  function updateJsonLd(c, pi) {
    var s = document.querySelector('script[type="application/ld+json"]'); if (!s) return;
    var data; try { data = JSON.parse(s.textContent); } catch (e) { return; }
    var g = data['@graph']; if (!Array.isArray(g)) return;
    var contact = c.contact || {}, ig = contact.instagram ? 'https://www.instagram.com/' + String(contact.instagram).replace(/^@/, '') : null;
    var digits = function (t) { return String(t || '').replace(/\D/g, ''); };
    var tel = contact.phone ? function (cur) { return digits(cur) === digits(contact.phone) ? cur : contact.phone; } : null; // mismo número → se respeta el formato original
    var keep = {};
    if (pi) pi.plans.forEach(function (p) { keep[p.id] = p; });
    g = g.filter(function (n) {
      if (n['@type'] === 'Service' && pi) { var id = String(n['@id']).replace(/.*#service-/, ''); return !!keep[id]; }
      return true;
    });
    g.forEach(function (n) {
      if (n['@type'] === 'Person') { if (tel) n.telephone = tel(n.telephone); if (ig) n.sameAs = [ig]; }
      if (n['@type'] === 'ProfessionalService') {
        if (tel) n.telephone = tel(n.telephone); if (ig) n.sameAs = [ig];
        if (pi) {
          n.priceRange = '$' + pi.min + ' - $' + pi.max + ' / month';
          if (n.hasOfferCatalog) n.hasOfferCatalog.itemListElement = (n.hasOfferCatalog.itemListElement || []).filter(function (o) { return !!keep[String(o['@id']).replace(/.*#offer-/, '')]; });
        }
      }
      if (n['@type'] === 'Service' && pi) {
        var p = keep[String(n['@id']).replace(/.*#service-/, '')];
        if (p && n.offers) { var pr = Number(p.price).toFixed(2); n.offers.price = pr; if (n.offers.priceSpecification) n.offers.priceSpecification.price = pr; }
      }
      if (Array.isArray(n['@type']) && n['@type'].indexOf('FAQPage') >= 0 && Array.isArray(c.faq)) {
        n.mainEntity = c.faq.map(function (f) { return { '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }; });
      }
    });
    data['@graph'] = g;
    var out = JSON.stringify(data);
    if (s.textContent !== out) s.textContent = out;
  }
  function syncAlpine(cfg) {
    var A = window.Alpine; var c = cfg.content || {};
    var slider = document.querySelector('[x-data^="testimonialSlider"]');
    if (slider && Array.isArray(c.testimonials)) {
      var n = c.testimonials.length;
      // Antes de que Alpine arranque basta cambiar el atributo; después NO se toca (Alpine lo re-inicializaría y los puntos dejarían de reaccionar): se actualiza el estado.
      if (!slider._x_dataStack) slider.setAttribute('x-data', 'testimonialSlider(' + n + ')');
      else if (A && A.$data) { var d = A.$data(slider); if (d.count !== n) { d.count = n; if (d.cur >= n) d.cur = 0; } }
    }
    var chat = document.querySelector('[x-data^="deeChat"]');
    if (chat && c.chat && A && A.$data && chat._x_dataStack) {
      var cd = A.$data(chat);
      if (Array.isArray(c.chat.quick) && JSON.stringify(cd.faqs) !== JSON.stringify(c.chat.quick)) { cd.faqs = c.chat.quick; cd.asked = []; }
      if (c.chat.greeting) cd.greeting = c.chat.greeting;
    }
  }
  function derive(cfg) {
    var ct = (cfg.content && cfg.content.contact) || {};
    if (ct.whatsapp) ct.whatsapp_url = 'https://wa.me/' + String(ct.whatsapp).replace(/\D/g, '') + (ct.whatsapp_text ? '?text=' + encodeURIComponent(ct.whatsapp_text).replace(/'/g, '%27') : '');
    if (ct.phone) ct.phone_url = 'tel:' + ct.phone;
    if (ct.email) ct.email_url = 'mailto:' + ct.email;
    if (ct.instagram) ct.instagram_url = 'https://www.instagram.com/' + String(ct.instagram).replace(/^@/, '');
    // chat: Alpine pinta f.href con :href SIN filtro y la CSP de la landing permite 'unsafe-inline' → un "javascript:" sería XSS.
    var ch = cfg.content && cfg.content.chat;
    if (ch && Array.isArray(ch.quick)) ch.quick.forEach(function (f) { if (f && f.href != null && !/^(https?:\/\/|#|mailto:|tel:|\/(?![\/\\]))/i.test(String(f.href))) delete f.href; });
    var m = cfg.content && cfg.content.media;
    if (m && m.hero_video && !m.band_video) m.band_video = m.hero_video;
    var pi = cfg.content ? priceInfo(cfg.content) : null;
    if (pi && cfg.brand && cfg.brand.hero && cfg.brand.hero.note_html) cfg.brand.hero.note_html = fixPriceText(cfg.brand.hero.note_html, pi);
    return cfg;
  }

  // ------------------------------------------------------------------ aplicar
  function apply() {
    var raw = state.pending; if (!raw) return;
    if (document.readyState === 'loading') return; // esperamos a que el DOM esté parseado
    var json = JSON.stringify(raw);
    if (json === state.applied) { state.pending = null; return; }
    var cfg; try { cfg = derive(JSON.parse(json)); } catch (e) { state.errors.push(String(e)); return; }
    state.cfg = cfg;
    try {
      if (cfg.content && cfg.content.colors) setColors(cfg.content.colors);
      fillLists(document, null);
      fillScope(document, null);
      applyDerived(cfg);
      syncAlpine(cfg);
      if (window.dsInitReels) window.dsInitReels();
      if (window.dsObserveVideos) window.dsObserveVideos();
      if (window.lucide && document.readyState === 'complete') window.lucide.createIcons();
      state.applied = json; state.pending = null;
      document.dispatchEvent(new CustomEvent('ds:applied', { detail: { source: state.source } }));
    } catch (e) {
      state.errors.push(String(e && e.stack || e));
      if (window.console) console.warn('[ds-runtime]', e);
    }
  }
  function schedule(cfg, source) {
    if (!cfg || typeof cfg !== 'object' || !cfg.content) return;
    state.pending = cfg; state.source = source;
    if (cfg.content.colors) setColors(cfg.content.colors); // los colores no esperan al DOM
    apply();
  }
  document.addEventListener('readystatechange', function () { if (document.readyState === 'interactive') apply(); });
  document.addEventListener('DOMContentLoaded', apply);

  // ------------------------------------------------------------------ modos
  if (MODE === 'preview') {
    window.addEventListener('message', function (e) {
      var ok = HUB_ORIGINS.indexOf(e.origin) >= 0 || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(e.origin);
      if (!ok || !e.data || e.data.type !== 'ds:config') return;
      schedule({ content: e.data.content, brand: e.data.brand }, 'preview');
    });
    var ready = function () { try { window.parent.postMessage({ type: 'ds:ready' }, '*'); } catch (e) { /* noop */ } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
    return;
  }

  // live: caché local primero (sin parpadeo), red después
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && cached.cfg && Date.now() - cached.t < 7 * 864e5) schedule(cached.cfg, 'cache');
  } catch (e) { /* storage bloqueado: seguimos sin caché */ }
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT);
  fetch(HUB_API + '/api/ds/site.json', { cache: 'no-cache', signal: ctrl ? ctrl.signal : undefined, credentials: 'omit' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      clearTimeout(timer);
      var cfg = { content: data.content, brand: data.brand };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), cfg: cfg })); } catch (e) { /* noop */ }
      schedule(cfg, 'network');
    })
    .catch(function (e) { clearTimeout(timer); state.errors.push('fetch: ' + (e && e.message)); state.source = state.source || 'none'; });
})();
