/* DUNGZAK.ART — Artist Bio 저시력 접근성 (2026-11-22 a11y-bio1)
   - 글자 크기 100·150·200·300·400%, 기본/고대비, KR / EN / KR+EN (작가 소개 원문·문단 순서는 그대로)
   - 설정은 리포트 리더와 같은 저장값(dcar-accessibility-v2)을 쓰므로 Bio를 닫았다 열어도, 리포트에서도 유지
   - VoiceOver·TalkBack: 열면 제목으로 초점 이동, 닫으면 Artist Bio 버튼으로 복귀, 뒤 화면 비활성(inert), Esc 닫기, Tab 가두기
   - 음성 자동 재생 없음 */
(function () {
  'use strict';
  var KEY = 'dcar-accessibility-v2';
  var SIZES = ['1', '1.5', '2', '3', '4'];
  var modal = document.getElementById('bio-modal');
  if (!modal) return;
  var card = modal.querySelector('.bio-card'), head = modal.querySelector('.bio-head'), langBox = modal.querySelector('.bio-lang');
  var closeBtn = modal.querySelector('.bio-close');
  if (!card || !head) return;

  var prefs = { lang: 'ko', size: '1', contrast: false };
  try {
    var st = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (['both', 'ko', 'en'].indexOf(st.lang) !== -1) prefs.lang = st.lang;
    if (SIZES.indexOf(String(st.size)) !== -1) prefs.size = String(st.size);
    if (typeof st.contrast === 'boolean') prefs.contrast = st.contrast;
    if (!st.lang) prefs.lang = 'ko'; // Bio는 처음에 기존처럼 한국어로 연다
  } catch (e) {}
  function save() {
    try {
      var st = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      st.lang = prefs.lang; st.size = prefs.size; st.contrast = prefs.contrast;
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch (e) {}
  }
  function bioLang() { return prefs.lang === 'ko' ? 'kr' : prefs.lang; }
  function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }

  // ---------------------------------------------------------------- 언어 정보(낭독 언어)
  modal.querySelectorAll('.bio-body.ko, .bio-head h2.ko, .expo-kicker .ko').forEach(function (n) { n.setAttribute('lang', 'ko'); });
  modal.querySelectorAll('.bio-body.en, .bio-head h2.en, .expo-kicker .en').forEach(function (n) { n.setAttribute('lang', 'en'); });
  var hKo = head.querySelector('h2.ko'), hEn = head.querySelector('h2.en');
  if (hEn && !hEn.id) hEn.id = 'bio-title-en';
  [hKo, hEn].forEach(function (h) { if (h) h.setAttribute('tabindex', '-1'); });

  // ---------------------------------------------------------------- KR+EN 버튼
  if (langBox && !langBox.querySelector('[data-bio-lang="both"]')) {
    var both = el('button', { type: 'button', 'class': 'lang', 'data-bio-lang': 'both', 'aria-pressed': 'false' }, 'KR+EN');
    langBox.appendChild(both);
  }
  if (langBox) {
    langBox.setAttribute('role', 'group');
    langBox.querySelectorAll('button').forEach(function (b) { b.type = 'button'; });
    langBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-bio-lang]'); if (!b) return;
      var v = b.getAttribute('data-bio-lang'); prefs.lang = v === 'kr' ? 'ko' : v; save();
      setTimeout(apply, 0); // 기존 KR/EN 처리 뒤에 상태를 맞춘다
    });
  }

  // ---------------------------------------------------------------- 보기 설정(글자 크기·고대비)
  var wrap = el('div', { 'class': 'bio-a11y' });
  var tog = el('button', { type: 'button', 'class': 'bio-a11y-toggle', 'aria-expanded': 'false', 'aria-controls': 'bioA11yPanel' });
  var panel = el('div', { 'class': 'bio-a11y-panel', id: 'bioA11yPanel', hidden: '' });
  var lblSize = el('p', { 'class': 'bio-a11y-label', id: 'bioA11ySize' });
  var chipsSize = el('div', { 'class': 'bio-a11y-chips', role: 'group', 'aria-labelledby': 'bioA11ySize' });
  SIZES.forEach(function (s) { var b = el('button', { type: 'button', 'data-bio-size': s, 'aria-pressed': 'false' }, Math.round(parseFloat(s) * 100) + '%'); chipsSize.appendChild(b); });
  var lblHc = el('p', { 'class': 'bio-a11y-label', id: 'bioA11yHc' });
  var chipsHc = el('div', { 'class': 'bio-a11y-chips', role: 'group', 'aria-labelledby': 'bioA11yHc' });
  var bStd = el('button', { type: 'button', 'data-bio-hc': 'off', 'aria-pressed': 'false' }), bHc = el('button', { type: 'button', 'data-bio-hc': 'on', 'aria-pressed': 'false' });
  chipsHc.appendChild(bStd); chipsHc.appendChild(bHc);
  panel.appendChild(lblSize); panel.appendChild(chipsSize); panel.appendChild(lblHc); panel.appendChild(chipsHc);
  wrap.appendChild(tog); wrap.appendChild(panel);
  head.parentNode.insertBefore(wrap, head.nextSibling);
  tog.addEventListener('click', function () { var open = panel.hasAttribute('hidden'); if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', ''); tog.setAttribute('aria-expanded', String(open)); });
  chipsSize.addEventListener('click', function (e) { var b = e.target.closest('[data-bio-size]'); if (!b) return; prefs.size = b.getAttribute('data-bio-size'); save(); apply(); });
  chipsHc.addEventListener('click', function (e) { var b = e.target.closest('[data-bio-hc]'); if (!b) return; prefs.contrast = b.getAttribute('data-bio-hc') === 'on'; save(); apply(); });

  function T(ko, en) { var l = prefs.lang; return l === 'en' ? en : l === 'both' ? ko + ' · ' + en : ko; }
  function apply() {
    var s = parseFloat(prefs.size) || 1;
    modal.style.setProperty('--bio-s', String(s));
    modal.style.setProperty('--bio-sh', String(Math.round((1 + (s - 1) * .5) * 100) / 100)); // 고정 머리 제목은 덜 키워 본문 자리를 확보
    modal.classList.toggle('bio-big', s >= 2);
    modal.classList.toggle('bio-hc', !!prefs.contrast);
    modal.dataset.bio = bioLang();
    if (langBox) langBox.querySelectorAll('[data-bio-lang]').forEach(function (b) { var on = b.getAttribute('data-bio-lang') === bioLang(); b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    if (langBox) langBox.setAttribute('aria-label', T('언어', 'Language'));
    chipsSize.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-bio-size') === prefs.size)); });
    bStd.textContent = T('기본', 'Standard'); bHc.textContent = T('고대비', 'High contrast');
    bStd.setAttribute('aria-pressed', String(!prefs.contrast)); bHc.setAttribute('aria-pressed', String(!!prefs.contrast));
    lblSize.textContent = T('글자 크기', 'Text size'); lblHc.textContent = T('화면', 'Display');
    tog.replaceChildren();
    tog.appendChild(el('span', { 'class': 'aa', 'aria-hidden': 'true' }, 'Aa'));
    tog.appendChild(document.createTextNode(T('글자 크기·고대비', 'Text size · Contrast') + ' — ' + Math.round(s * 100) + '%' + (prefs.contrast ? ' · ' + T('고대비', 'High contrast') : '')));
    if (closeBtn) closeBtn.setAttribute('aria-label', T('닫기', 'Close'));
    // 대화상자 이름: 보이는 제목
    card.setAttribute('aria-labelledby', prefs.lang === 'en' && hEn ? hEn.id : 'bio-title');
    if (hKo && hKo.id !== 'bio-title' && !hKo.id) hKo.id = 'bio-title';
  }
  apply();

  // ---------------------------------------------------------------- 열기·닫기: 초점, 뒤 화면 비활성, Esc, Tab
  var opener = null, inerted = [];
  function visibleTitle() { return prefs.lang === 'en' ? hEn : hKo; }
  function onOpen() {
    apply();
    var a = document.activeElement; opener = a && a !== document.body && !modal.contains(a) ? a : document.getElementById('tab-bio');
    inerted = [];
    Array.prototype.forEach.call(document.body.children, function (c) {
      if (c === modal || c.contains(modal) || c.tagName === 'SCRIPT' || c.inert) return;
      c.inert = true; inerted.push(c);
    });
    var t = visibleTitle();
    if (t) setTimeout(function () { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }, 30);
  }
  function onClose() {
    inerted.forEach(function (c) { c.inert = false; }); inerted = [];
    var o = opener; opener = null;
    if (o && document.contains(o)) setTimeout(function () { try { o.focus({ preventScroll: true }); } catch (e) { o.focus(); } }, 0);
  }
  var wasOpen = !modal.hidden;
  new MutationObserver(function () {
    var open = !modal.hidden;
    if (open && !wasOpen) onOpen(); else if (!open && wasOpen) onClose();
    wasOpen = open;
  }).observe(modal, { attributes: true, attributeFilter: ['hidden'] });

  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); if (closeBtn) closeBtn.click(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(card.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])'), function (x) { return !x.disabled && x.getClientRects().length; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || !card.contains(a) || a === hKo || a === hEn)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !card.contains(a))) { e.preventDefault(); first.focus(); }
  });
})();
