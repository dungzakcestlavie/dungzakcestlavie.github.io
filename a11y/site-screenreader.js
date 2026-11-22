/* DUNGZAK.ART — semantic screen-reader access (2026-11-22)
 * Native buttons, tabs, language and image viewer. No text/data changes.
 * Complements existing Bio focus handling (bio-a11y.js). */
(function () {
  'use strict';
  if (window.__DUNGZAK_SR_INIT__) return;
  window.__DUNGZAK_SR_INIT__ = true;
  var doc = document;
  function one(s, root) { return (root || doc).querySelector(s); }
  function all(s, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(s)); }
  function mode() {
    if (doc.body.classList.contains('english')) return 'en';
    if (doc.body.classList.contains('hybrid')) return 'both';
    return 'ko';
  }
  function en() { return mode() === 'en'; }
  function txt(ko, english) { return en() ? english : ko; }
  function title(el, s) { if (el) el.setAttribute('aria-label', s); }
  function syncLangText(root) {
    all('.ko:not([lang]), .en:not([lang])', root).forEach(function (el) {
      el.setAttribute('lang', el.classList.contains('en') ? 'en' : 'ko');
    });
  }
  function syncSite() {
    var m = mode();
    doc.documentElement.lang = m === 'en' ? 'en' : 'ko';
    var nav = one('nav.primary');
    if (nav) {
      title(nav, txt('주요 메뉴', 'Primary navigation'));
      all('button[data-target]', nav).forEach(function (b) {
        var selected = b.classList.contains('active');
        if (selected) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
        var target = one('#' + b.dataset.target);
        if (target) {
          if (!target.id) return;
          b.setAttribute('aria-controls', target.id);
        }
      });
    }
    var langs = one('.lang-row .lang');
    if (langs) {
      langs.setAttribute('role', 'group');
      title(langs, txt('화면 언어 선택', 'Display language'));
      ['koBtn', 'enBtn', 'hyBtn'].forEach(function (id, idx) {
        var b = doc.getElementById(id);
        if (!b) return;
        var value = ['ko', 'en', 'both'][idx];
        b.setAttribute('aria-pressed', String(m === value));
        b.setAttribute('aria-label', ['한국어', 'English', '한국어와 영어'][idx]);
      });
    }
    var reportsFilter = one('#reports .r-tabs');
    if (reportsFilter) {
      reportsFilter.setAttribute('role', 'group');
      title(reportsFilter, txt('보고서 유형 필터', 'Report category filter'));
      all('.r-tab', reportsFilter).forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.classList.contains('is-active')));
      });
    }
    var rep = one('#reportsToggle');
    if (rep) {
      rep.setAttribute('aria-controls', 'reportGrid');
      title(rep, (rep.textContent || '').trim());
    }
    var lightbox = one('#lf-lightbox');
    if (lightbox) title(lightbox, txt('작품 이미지 보기', 'Artwork image viewer'));
    var sound = one('#soundBar');
    if (sound) title(sound, txt('배경 소리 켜기 또는 끄기', 'Toggle ambient sound'));
    syncLangText(doc);
    syncWorkTabs();
    syncCards();
  }

  function syncWorkTabs() {
    var tabs = one('#works .tabs');
    if (!tabs) return;
    tabs.setAttribute('role', 'tablist');
    title(tabs, txt('작품 시리즈', 'Artwork series'));
    all('.tab[data-panel]', tabs).forEach(function (b) {
      var active = b.classList.contains('active');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(active));
      b.setAttribute('tabindex', active ? '0' : '-1');
      var key = b.dataset.panel;
      var panel = one('#panel-' + key);
      if (!panel) return;
      var id = 'works-tab-' + key;
      b.id = id;
      b.setAttribute('aria-controls', panel.id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', id);
      panel.setAttribute('aria-hidden', String(!active));
      if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '0');
    });
  }

  function syncCards() {
    var m = mode();
    all('#works .w-card').forEach(function (card) {
      if (card.getAttribute('data-dz-sr-ready') !== '1') {
        card.setAttribute('data-dz-sr-ready', '1');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
      }
      var kr = (card.getAttribute('data-cap-kr') || '').split('\n')[0];
      var english = (card.getAttribute('data-cap-en') || '').split('\n')[0];
      var image = one('img.w-thumb', card);
      var id = card.getAttribute('data-work-id') || card.getAttribute('data-id') || '';
      if (!kr) kr = id;
      if (!english) english = image && image.alt || id;
      var name = m === 'en' ? english : m === 'both' ? kr + ' / ' + english : kr;
      title(card, (name || id) + ' · ' + txt('작품 상세 보기', 'Open artwork detail'));
      // Image content is already represented by the interactive card name.
      if (image) image.alt = (m === 'en' ? english : kr) || id;
    });
  }

  function bindViewer() {
    var box = one('#lf-lightbox');
    if (!box) return;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', txt('작품 이미지 보기', 'Artwork image viewer'));
    var restore = null, back = [], was = false;
    function active() {
      return box.getAttribute('aria-hidden') === 'false' && box.classList.contains('active');
    }
    function refresh() {
      var opened = active();
      if (opened === was) return;
      was = opened;
      if (opened) {
        restore = doc.activeElement;
        back = [];
        Array.prototype.forEach.call(doc.body.children, function (el) {
          if (el === box || el.contains(box) || el.tagName === 'SCRIPT' || el.inert) return;
          el.inert = true; back.push(el);
        });
        var close = one('#lf-close', box);
        if (close) setTimeout(function () {
          if (active()) close.focus({ preventScroll: true });
        }, 30);
      } else {
        back.forEach(function (el) { el.inert = false; }); back = [];
        var target = restore;
        restore = null;
        if (target && target.isConnected) setTimeout(function () {
          try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
        }, 40);
      }
    }
    new MutationObserver(refresh).observe(box, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
    doc.addEventListener('keydown', function (event) {
      if (!active()) return;
      if (event.key === 'Tab') {
        var focusables = all('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])', box)
          .filter(function (el) { return el.getClientRects().length > 0; });
        if (!focusables.length) { event.preventDefault(); return; }
        var first = focusables[0], last = focusables[focusables.length - 1], current = doc.activeElement;
        if (event.shiftKey && (current === first || !box.contains(current))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (current === last || !box.contains(current))) {
          event.preventDefault(); first.focus();
        }
      }
    }, true);
  }

  function boot() {
    if (!one('main') || !one('nav.primary')) return;
    var main = one('main');
    main.id = main.id || 'dz-main';
    var skip = doc.createElement('a');
    skip.href = '#' + main.id; skip.id = 'dz-sr-skip'; skip.className = 'dz-sr-skip';
    skip.textContent = '본문으로 이동 / Skip to content';
    skip.addEventListener('click', function (e) {
      e.preventDefault();
      main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
      main.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    doc.body.insertBefore(skip, doc.body.firstChild);
    var sound = one('#soundBar');
    if (sound) {
      sound.setAttribute('tabindex', '0');
      sound.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sound.click(); }
      });
    }
    var works = one('#works');
    if (works) {
      works.addEventListener('keydown', function (e) {
        var card = e.target.closest && e.target.closest('.w-card');
        if (card && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault(); card.click(); return;
        }
        var tab = e.target.closest && e.target.closest('.tabs .tab');
        if (!tab) return;
        var keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (keys.indexOf(e.key) < 0) return;
        var tabs = all('.tabs .tab', works);
        var i = tabs.indexOf(tab);
        if (i < 0) return;
        e.preventDefault();
        var next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 :
          (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next].click(); tabs[next].focus();
        setTimeout(syncWorkTabs, 0);
      });
      var job = 0;
      new MutationObserver(function () {
        if (job) return;
        job = setTimeout(function () { job = 0; syncWorkTabs(); syncCards(); }, 75);
      }).observe(works, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    var reports = one('#reports');
    if (reports) {
      var t = 0;
      new MutationObserver(function () {
        if (t) return;
        t = setTimeout(function () { t = 0; syncSite(); }, 75);
      }).observe(reports, { attributes: true, subtree: true, attributeFilter: ['class', 'aria-expanded'] });
    }
    var nav = one('nav.primary');
    var lang = one('.lang-row');
    [nav, lang].filter(Boolean).forEach(function (el) {
      el.addEventListener('click', function () { setTimeout(syncSite, 0); });
    });
    bindViewer();
    syncSite();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();