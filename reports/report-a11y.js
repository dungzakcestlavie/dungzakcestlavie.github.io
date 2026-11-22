/* DCAR 리포트 접근성 고도화 (2026-11-22 a11y-report1)
   리더(reader.html)와 단독 리포트(DCAR-33 등) 공용. 원문·번역·번호·날짜·저자는 바꾸지 않는다.
   1) 목차: 절 제목(h2)으로 목차를 만들고 제목 단위로 이동
   2) 제목 맞춤: 크게 키운 제목의 긴 단어가 화면 폭보다 길면 그 제목만 단어가 들어갈 만큼 줄인다(원래 크기의 200% 아래로는 줄이지 않음)
   3) 보기 설정 접기·펴기: 큰 글자에서 읽는 공간 확보(선택은 기억) */
(function () {
  'use strict';
  var root = document.documentElement;
  var paper = document.getElementById('paper');
  if (!paper) return;
  var TB_KEY = 'dcar-toolbar-v1';

  function lang() { return paper.getAttribute('data-lang') || 'both'; }
  function scale() { var v = parseFloat(getComputedStyle(root).getPropertyValue('--scale')); return isFinite(v) && v > 0 ? v : 1; }
  function span(cls, l, text) { var s = document.createElement('span'); s.className = cls; s.lang = l; s.textContent = text; return s; }

  // ---------------------------------------------------------------- 목차
  function buildToc() {
    var old = document.getElementById('dz-toc'); if (old) old.remove();
    var hs = Array.prototype.slice.call(paper.querySelectorAll('h2')).filter(function (h) { return !h.closest('.paper-head, .dz-toc, .references-head'); });
    var entries = [], n = 0;
    hs.forEach(function (h) {
      // DCAR-33처럼 한국어 h2 바로 다음에 영어 h2가 오면 한 항목으로 묶는다
      var prev = entries[entries.length - 1];
      if (h.classList.contains('en') && prev && !prev.en && prev.kr && h.previousElementSibling === prev.kr) { prev.en = h; return; }
      var e = { kr: null, en: null, one: null };
      if (h.classList.contains('dz-sec')) e.one = h; else if (h.classList.contains('en')) e.en = h; else e.kr = h;
      entries.push(e);
    });
    if (entries.length < 2) return;
    var nav = document.createElement('nav'); nav.className = 'dz-toc'; nav.id = 'dz-toc'; nav.setAttribute('aria-labelledby', 'dz-toc-title');
    var det = document.createElement('details');
    var sum = document.createElement('summary'); sum.id = 'dz-toc-title';
    sum.appendChild(span('kr', 'ko', '목차 '));
    sum.appendChild(span('en', 'en', 'Contents'));
    var ol = document.createElement('ol');
    entries.forEach(function (e) {
      n++;
      var target = e.one || (e.kr && e.kr.closest('.section')) || e.kr || e.en;
      if (!target.id) target.id = 'dz-sec-' + n;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = '#' + target.id;
      var kr = e.one ? e.one.querySelector('span.kr') : e.kr, en = e.one ? e.one.querySelector('span.en') : e.en;
      if (e.one && !kr && !en) { a.appendChild(span(e.one.classList.contains('en') ? 'en' : 'kr', e.one.lang || 'ko', e.one.textContent.trim())); }
      if (kr) a.appendChild(span('kr', 'ko', kr.textContent.trim()));
      if (en) a.appendChild(span('en', 'en', en.textContent.trim()));
      if (!kr && !en && !e.one) return;
      if (!kr && en && !e.one) li.className = 'en';
      if (kr && !en && !e.one) li.className = 'kr';
      if (e.one && e.one.classList.contains('kr')) li.className = 'kr';
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var t = document.getElementById(target.id);
        // 보이지 않는 언어의 제목이면 같은 절의 보이는 제목으로
        if (t && !t.getClientRects().length && e.en && e.en.getClientRects().length) t = e.en;
        if (!t) return;
        if (!t.id) t.id = target.id + '-v';
        if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
        var tb = document.querySelector('.toolbar'), off = tb && getComputedStyle(tb).position === 'sticky' ? tb.getBoundingClientRect().height : 0;
        window.scrollTo({ top: Math.max(0, t.getBoundingClientRect().top + window.pageYOffset - off - 12), behavior: 'instant' });
        try { t.focus({ preventScroll: true }); } catch (x) { t.focus(); }
        try { history.replaceState(null, '', '#' + target.id); } catch (x) {}
      });
      li.appendChild(a); ol.appendChild(li);
    });
    det.appendChild(sum); det.appendChild(ol); nav.appendChild(det);
    var head = paper.querySelector('.paper-head');
    if (head && head.parentNode) head.parentNode.insertBefore(nav, head.nextSibling);
  }

  // ---------------------------------------------------------------- 제목 맞춤
  var WORD = /[A-Za-z0-9À-ɏ가-힣.'’_]{2,}/g;
  function fitOnce(el, sc) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false), n, worst = 1;
    var box = el.getBoundingClientRect(), cs = getComputedStyle(el);
    var avail = el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    while ((n = w.nextNode())) {
      if (!n.parentElement || !n.parentElement.getClientRects().length) continue;
      var t = n.nodeValue, m; WORD.lastIndex = 0;
      while ((m = WORD.exec(t))) {
        var r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
        var rs = r.getClientRects(), lines = {}, cnt = 0, wid = 0, k;
        for (k = 0; k < rs.length; k++) { if (rs[k].width < .5) continue; wid += rs[k].width; var key = Math.round(rs[k].top / 4); if (!lines[key]) { lines[key] = 1; cnt++; } }
        if (cnt > 1 && avail > 20) worst = Math.min(worst, .92, (avail * .96) / wid);
      }
    }
    if (worst >= 1) return false;
    var base = parseFloat(el.getAttribute('data-dz-fit')) || parseFloat(cs.fontSize);
    if (!el.hasAttribute('data-dz-fit')) el.setAttribute('data-dz-fit', String(base));
    var floor = base / sc * Math.min(sc, 2), cur = parseFloat(cs.fontSize);
    var nv = Math.max(floor, Math.floor(cur * worst * 10) / 10);
    if (nv >= cur - .3) return false;
    el.style.setProperty('font-size', nv + 'px', 'important');
    return true;
  }
  var fitT = 0;
  function fit() {
    fitT = 0;
    var els = paper.querySelectorAll('.paper-head h1, .paper-head .over, .paper-head .authors, h2, .dz-toc summary, .dz-toc li');
    for (var i = 0; i < els.length; i++) { els[i].style.removeProperty('font-size'); els[i].removeAttribute('data-dz-fit'); }
    var sc = scale(); root.classList.toggle('dz-report-enlarged', sc > 1); root.classList.toggle('dz-big', sc >= 2); if (sc <= 1) return;
    for (var j = 0; j < els.length; j++) for (var p = 0; p < 6; p++) if (!fitOnce(els[j], sc)) break;
  }
  function later() { if (fitT) clearTimeout(fitT); fitT = setTimeout(fit, 120); }

  // ---------------------------------------------------------------- 보기 설정 접기·펴기
  function toolbar() {
    var tb = document.querySelector('.toolbar'); if (!tb || tb.querySelector('.dz-tb-toggle')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'dz-tb-toggle'; b.setAttribute('aria-controls', tb.id || (tb.id = 'dz-toolbar'));
    var first = tb.querySelector('.lab-top'); tb.insertBefore(b, first ? first.nextSibling : tb.firstChild);
    var saved = null; try { saved = localStorage.getItem(TB_KEY); } catch (e) {}
    var closed = saved ? saved === 'closed' : scale() >= 2; // 처음에는 큰 글자일 때만 접어서 시작
    function pressed(sel) { var x = tb.querySelector(sel + '[aria-pressed="true"]'); return x ? x.textContent.trim() : ''; }
    function label() {
      var st = [pressed('[data-size]'), pressed('[data-choose-lang]')].filter(Boolean);
      if (document.body.classList.contains('contrast')) st.push('고대비 · Contrast');
      b.replaceChildren();
      var ar = document.createElement('span'); ar.setAttribute('aria-hidden', 'true'); ar.textContent = closed ? '▸ ' : '▾ ';
      b.appendChild(ar);
      b.appendChild(document.createTextNode(closed ? '보기 설정 · Display — ' + st.join(' · ') : '보기 설정 접기 · Hide display settings'));
      b.setAttribute('aria-expanded', String(!closed));
      tb.classList.toggle('dz-collapsed', closed);
    }
    b.addEventListener('click', function () { closed = !closed; try { localStorage.setItem(TB_KEY, closed ? 'closed' : 'open'); } catch (e) {} label(); });
    tb.addEventListener('click', function (e) { if (e.target !== b) setTimeout(label, 0); });
    label();
  }

  // 위에 붙어 있는 보기 설정 막대 높이만큼 제목 이동 위치를 내린다
  function tbHeight() { var tb = document.querySelector('.toolbar'); var h = tb && getComputedStyle(tb).position === 'sticky' ? tb.getBoundingClientRect().height : 0; root.style.setProperty('--dz-tb-h', Math.ceil(h) + 'px'); }
  function quietDupHead() {
    var head = paper.querySelector('.paper-head'), txt = paper.querySelector('#report-text'); if (!head || !txt) return;
    var known = [];
    head.querySelectorAll('h1').forEach(function (h) { known.push(h.textContent.trim()); });
    var num = (paper.querySelector('.paper-head .over') || {}).textContent || '';
    var m = /^(DCAR-\d{2})/.exec(num.trim()); if (m) known.push(m[1]);
    var kids = txt.children;
    for (var i = 0; i < kids.length && i < 4; i++) {
      var el = kids[i]; if (el.tagName !== 'P') break;
      var lines = el.textContent.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      if (!lines.length || !lines.every(function (l) { return known.indexOf(l) !== -1; })) break;
      el.setAttribute('aria-hidden', 'true'); // 머리글(제목)과 같은 줄 — 낭독 중복 방지, 화면 표시는 그대로
    }
  }
  // 화면 회전·창 크기 변경: 읽던 문단을 같은 자리로 되돌린다
  var anchor = null, anchorTop = 0, restoring = false;
  function pickAnchor() {
    if (restoring) return;
    var tb = document.querySelector('.toolbar'), top = tb && getComputedStyle(tb).position === 'sticky' ? tb.getBoundingClientRect().bottom : 0;
    // 읽는 줄(보기 설정 막대 바로 아래)에 실제로 있는 문단·제목
    var x = paper.getBoundingClientRect().left + Math.min(40, paper.clientWidth / 3);
    for (var dy = 8; dy < 200; dy += 24) {
      var hit = document.elementFromPoint(x, top + dy), el = hit && hit.closest && hit.closest('.passage, h2, h1, p, li');
      if (el && paper.contains(el)) { anchor = el; anchorTop = el.getBoundingClientRect().top - top; return; }
    }
  }
  var pickT = 0;
  window.addEventListener('scroll', function () { if (!pickT) pickT = setTimeout(function () { pickT = 0; pickAnchor(); }, 150); }, { passive: true });
  function restoreAnchor() {
    restoring = true;
    if (!anchor || !document.contains(anchor) || window.pageYOffset < 40) { setTimeout(function () { restoring = false; }, 200); return; }
    var tb = document.querySelector('.toolbar'), top = tb && getComputedStyle(tb).position === 'sticky' ? tb.getBoundingClientRect().bottom : 0;
    var r = anchor.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, r.top + window.pageYOffset - top - Math.max(0, anchorTop)), behavior: 'instant' });
    setTimeout(function () { restoring = false; }, 200);
  }
  var resT = 0;
  function onResize() { restoring = true; /* 크기가 바뀌는 동안 생기는 스크롤로 읽던 문단을 바꾸지 않는다 */ if (resT) clearTimeout(resT); resT = setTimeout(function () { resT = 0; fit(); restoreAnchor(); setTimeout(restoreAnchor, 160); }, 180); }
  function ready() {
    quietDupHead(); pickAnchor();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    buildToc(); toolbar(); fit(); tbHeight();
    try { new ResizeObserver(tbHeight).observe(document.querySelector('.toolbar')); } catch (e) {}
    // 글자 크기·언어·고대비가 바뀌거나 화면 크기가 바뀌면 다시 맞춘다
    try { new MutationObserver(later).observe(root, { attributes: true, attributeFilter: ['style'] }); } catch (e) {}
    try { new MutationObserver(later).observe(paper, { attributes: true, attributeFilter: ['data-lang'] }); } catch (e) {}
    if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(function () { t.scrollIntoView({ block: 'start' }); }, 60); }
  }
  if (paper.getAttribute('aria-busy') === 'true') {
    var mo = new MutationObserver(function () { if (paper.getAttribute('aria-busy') !== 'true') { mo.disconnect(); ready(); } });
    mo.observe(paper, { attributes: true, attributeFilter: ['aria-busy'] });
  } else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
