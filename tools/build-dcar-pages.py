#!/usr/bin/env python3
"""DCAR 검색 노출용 정적 페이지 생성기 (2026-11-27)

data/reports.json + reports/DCAR-NN-YYYY.md 를 읽어
  - reports/dcar-NN/index.html   (보고서별 정적 페이지: 본문·초록·JSON-LD 포함)
  - reports/index.html           (DCAR 전체 목록 허브)
  - reports/feed.xml             (RSS — 네이버 서치어드바이저 제출용)
  - sitemap.xml                  (홈 + 허브 + 모든 보고서)
를 만든다. 기존 파일(index.html, reader.html, *.md)은 바꾸지 않는다.
이미 단독 HTML이 있는 보고서(DCAR-33, 34 등)는 그 HTML을 정본으로 두고
reports/dcar-NN/ 은 그 주소로 이동시키는 안내 페이지만 만든다.

새 보고서를 추가한 뒤에는:  python3 tools/build-dcar-pages.py
"""
import html
import json
import os
import re
import subprocess
from datetime import datetime, timezone, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SITE = 'https://dungzak.art'
OG_IMAGE = SITE + '/og/dungzak-share.jpg?v=20261005'
KST = timezone(timedelta(hours=9))
SERIES_KO = 'DCAR — 등작 개념 미학 보고서'
SERIES_EN = 'DCAR — Dungzak Concept Aesthetics Report'
AUTHOR = {
    '@type': 'Person',
    '@id': SITE + '/#person',
    'name': 'DUNGZAK CESTLAVIE',
    'alternateName': ['등작', '燈酌', '등작 燈酌'],
    'url': SITE + '/',
    'sameAs': [
        'https://instagram.com/dungzakcestlavie',
        'https://youtube.com/@dungzakcestlavie',
        'https://flickr.com/photos/dungzak',
    ],
}

# 첫 공개(저장소 최초 커밋) 날짜 — 새 보고서는 아래 표에 없으면 git 기록 또는 오늘 날짜를 쓴다.
DATES = {
    'DCAR-01-2025': '2025-11-16', 'DCAR-02-2025': '2025-11-17', 'DCAR-03-2025': '2025-11-17',
    'DCAR-04-2025': '2025-11-17', 'DCAR-05-2025': '2025-11-17', 'DCAR-06-2025': '2025-11-17',
    'DCAR-07-2025': '2025-11-17', 'DCAR-08-2025': '2025-11-17', 'DCAR-09-2025': '2025-11-17',
    'DCAR-10-2025': '2025-11-28', 'DCAR-11-2026': '2026-01-09', 'DCAR-12-2026': '2026-01-09',
    'DCAR-13-2026': '2026-01-12', 'DCAR-14-2026': '2026-03-14', 'DCAR-15-2026': '2026-03-14',
    'DCAR-16-2026': '2026-03-21', 'DCAR-17-2026': '2026-03-14', 'DCAR-18-2026': '2026-03-14',
    'DCAR-19-2026': '2026-03-14', 'DCAR-20-2026': '2026-03-14', 'DCAR-21-2026': '2026-03-14',
    'DCAR-22-2026': '2026-03-14', 'DCAR-23-2026': '2026-03-14', 'DCAR-24-2026': '2026-03-14',
    'DCAR-25-2026': '2026-03-14', 'DCAR-26-2026': '2026-03-14', 'DCAR-27-2026': '2026-03-14',
    'DCAR-28-2026': '2026-04-06', 'DCAR-29-2026': '2026-04-06', 'DCAR-30-2026': '2026-04-25',
    'DCAR-31-2026': '2026-05-26', 'DCAR-32-2026': '2026-06-30', 'DCAR-33-2026': '2026-11-17',
    'DCAR-34-2026': '2026-11-23',
}

esc = lambda s: html.escape(s or '', quote=True)


def pub_date(rid, md_path):
    if rid in DATES:
        return DATES[rid]
    try:
        out = subprocess.run(['git', '-C', ROOT, 'log', '--diff-filter=A', '--format=%aI', '--', md_path],
                             capture_output=True, text=True).stdout.split()
        if out:
            return datetime.fromisoformat(out[-1]).astimezone(KST).date().isoformat()
    except Exception:
        pass
    return datetime.now(KST).date().isoformat()


def short_id(rid):
    m = re.match(r'DCAR-(\d+)-\d{4}$', rid)
    return 'DCAR-' + m.group(1) if m else rid


def slug(rid):
    m = re.match(r'DCAR-(\d+)-\d{4}$', rid)
    return 'dcar-' + m.group(1) if m else rid.lower()


# ---------------------------------------------------------------- 본문 변환 (reader.html renderMarkdown 과 같은 규칙)
HANGUL = re.compile(r'[ᄀ-ᇿ㄰-㆏가-힣]')
LATIN = re.compile(r'[A-Za-z]')
HEAD_RE = re.compile(r'^(?:\d{1,2}\.(?:\d{1,2}\.?)?\s+\S|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]+\.\s+\S|(?:초록|요약|서론|서문|결론|맺음말|에필로그|프롤로그|부록|주제어|키워드|참고문헌|Abstract|Introduction|Prologue|Epilogue|Conclusion|Appendix|Keywords|References|Bibliography)(?:\s|$|[/·:—-]))')
SEP_RE = re.compile(r'^(?:⸻+|─{4,}|-{3,}|—{1,3})$')
REF_RE = re.compile(r'^(?:참고문헌|References\b|Bibliography\b)', re.I)
URL_RE = re.compile(r'https?://[^\s<>]+')


def lang_of(t):
    if HANGUL.search(t):
        return 'kr'
    if LATIN.search(t):
        return 'en'
    return ''


def is_head(t):
    return (len(t) <= 70 and HEAD_RE.search(t) and not re.search(r'[,，]$', t)
            and not re.search(r'(?:은|는|을|를|의|와|과|며)$', t))


def linkify(text):
    out, pos = [], 0
    for m in URL_RE.finditer(text):
        out.append(esc(text[pos:m.start()]))
        orig = m.group(0)
        url = re.sub(r'[.,;)\]]+$', '', orig)
        out.append('<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>' % (esc(url), esc(url)))
        out.append(esc(orig[len(url):]))
        pos = m.end()
    out.append(esc(text[pos:]))
    return ''.join(out)


def parse(raw):
    """블록 목록: ('h2', [(lang, text), ...]) / ('p', lang, text) / ('hr',)"""
    lines = raw.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    blocks, buf = [], []
    st = {'lang': '', 'refs': False, 'after_sep': True, 'pending': None}

    def flush():
        if buf:
            blocks.append(['p', st['lang'], '\n'.join(buf)])
            buf.clear()

    def sep_soon(idx):
        seen = 0
        for k in range(idx + 1, len(lines)):
            if seen >= 3:
                break
            u = lines[k].strip()
            if not u:
                continue
            if SEP_RE.match(u):
                return True
            seen += 1
            if seen > 1 and not re.match(r'^\(.*\)$', u):
                return False
        return False

    for idx, line in enumerate(lines):
        t = line.strip()
        if not t:
            flush(); continue
        if SEP_RE.match(t):
            flush(); blocks.append(['hr']); st['after_sep'] = True; st['pending'] = None; continue
        lg = lang_of(t)
        t_head = re.sub(r'^#{1,6}\s+', '', t)
        if (st['after_sep'] or sep_soon(idx)) and not st['refs'] and is_head(t_head):
            flush()
            h = ['h2', [(lg, t_head.replace('\t', ' '))]]
            blocks.append(h); st['pending'] = h; st['lang'] = ''; st['after_sep'] = False
            if REF_RE.match(t_head):
                st['refs'] = True
            continue
        p = st['pending']
        if p and p[1][0][0] == 'kr' and lg == 'en' and len(t) <= 100 and not re.search(r'[.!?]$', t) and len(p[1]) == 1:
            p[1].append(('en', re.sub(r'^#{1,6}\s+', '', t))); st['pending'] = None; continue
        st['pending'] = None; st['after_sep'] = False
        if not st['refs'] and len(t) < 100 and REF_RE.match(t):
            flush(); st['refs'] = True; st['lang'] = ''
        detected = '' if st['refs'] else lang_of(t)
        if detected != st['lang']:
            flush(); st['lang'] = detected
        line = re.sub(r'^\s*#{1,6}\s+', '', line)
        buf.append(line.rstrip())
    flush()
    return blocks


def render(blocks):
    out = []
    for b in blocks:
        if b[0] == 'hr':
            out.append('<hr class="separator">')
        elif b[0] == 'h2':
            parts = b[1]
            cls = 'dz-sec' if len(parts) > 1 else 'dz-sec' + (' en' if parts[0][0] == 'en' else (' kr' if parts[0][0] == 'kr' else ''))
            spans = ''.join('<span class="%s" lang="%s">%s</span>' % ('en' if l == 'en' else 'kr', 'en' if l == 'en' else 'ko', esc(x)) for l, x in parts)
            out.append('<h2 class="%s">%s</h2>' % (cls, spans))
        else:
            lg, text = b[1], b[2]
            cls = 'passage' + (' ' + lg if lg else '')
            la = ' lang="%s"' % ('ko' if lg == 'kr' else 'en') if lg else ''
            out.append('<p class="%s"%s>%s</p>' % (cls, la, linkify(text)))
    return '\n'.join(out)


def section_text(blocks, head_re):
    """head_re 로 시작하는 절의 한국어·영어 본문을 돌려준다."""
    ko, en, on = [], [], False
    for b in blocks:
        # 구분선 없이 이어지는 짧은 절 제목 줄(예: "주제어 · Keywords")도 제목으로 본다
        pseudo = b[0] == 'p' and '\n' not in b[2] and is_head(b[2].strip())
        if b[0] == 'h2' or pseudo:
            if on and (ko or en):
                break
            if on:  # "주제어" 다음 줄 "Keywords" 처럼 제목이 두 줄로 나뉜 경우
                continue
            on = bool(re.match(head_re, (' '.join(x for _, x in b[1]) if b[0] == 'h2' else b[2]).strip(), re.I))
            continue
        if b[0] == 'hr' and on and (ko or en):
            break
        if on and b[0] == 'p':
            (ko if b[1] == 'kr' else en if b[1] == 'en' else ko).append(b[2].replace('\n', ' ').strip())
    return ' '.join(ko).strip(), ' '.join(en).strip()


def clip(s, n):
    s = re.sub(r'\s+', ' ', s or '').strip()
    return s if len(s) <= n else s[:n - 1].rstrip() + '…'


def plain_text(blocks):
    return ' '.join((b[2] if b[0] == 'p' else ' '.join(x for _, x in b[1])) for b in blocks if b[0] != 'hr')


# ---------------------------------------------------------------- 페이지 템플릿
READER_CSS = None


def reader_css():
    global READER_CSS
    if READER_CSS is None:
        src = open(os.path.join(ROOT, 'reports/reader.html'), encoding='utf-8').read()
        READER_CSS = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
    return READER_CSS


EXTRA_CSS = """
.abstract-box{margin:1.2rem 0 .4rem;padding:1rem 1.1rem;border:1px solid var(--border);border-left:3px solid #b8964a;background:rgba(184,150,74,.06)}
.abstract-box h2{font-size:.82rem;letter-spacing:.1em;margin:0 0 .5rem;color:var(--muted)}
.abstract-box p{margin:.3rem 0;font-size:calc(.98rem * var(--scale));line-height:1.75}
.kw{font-size:calc(.85rem * var(--scale));color:var(--muted);margin-top:.5rem}
.series-nav{display:flex;flex-wrap:wrap;gap:.6rem 1.2rem;justify-content:space-between;border-top:1px solid var(--border);margin-top:2rem;padding-top:1rem;font-size:.9rem}
.series-nav a,.crumbs a{color:#164ca3}
.contrast .series-nav a,.contrast .crumbs a{color:#a5c7ff}
.crumbs{font-size:.82rem;color:var(--muted);margin:0 0 .4rem}
.cite-box{margin-top:1.4rem;font-size:.84rem;color:var(--muted);border-top:1px dashed var(--border);padding-top:.8rem;overflow-wrap:anywhere}
article[data-lang="ko"] .abstract-box .en,article[data-lang="en"] .abstract-box .kr{display:none}
"""

TOOLBAR = """<div class="toolbar" role="group" aria-label="언어 및 글자 크기 / Language and text size">
<span class="toolname">언어 · Language</span>
<button type="button" data-choose-lang="both" aria-pressed="true">KR+EN</button>
<button type="button" data-choose-lang="ko" aria-pressed="false">한국어</button>
<button type="button" data-choose-lang="en" aria-pressed="false">English</button>
<span class="toolname">글자 크기 · Text size</span>
<button type="button" data-size="1" aria-pressed="true">100%</button>
<button type="button" data-size="1.5" aria-pressed="false">150%</button>
<button type="button" data-size="2" aria-pressed="false">200%</button>
<button type="button" data-size="3" aria-pressed="false">300%</button>
<button type="button" data-size="4" aria-pressed="false">400%</button>
<button type="button" id="contrast" aria-pressed="false">고대비 · Contrast</button>
</div>"""

# reader.html 과 같은 보기 설정 저장 키를 써서 리더와 설정이 이어진다.
PREFS_JS = """<script>
(function(){'use strict';
var KEY='dcar-accessibility-v2',paper=document.getElementById('paper'),p={lang:'both',size:'1',contrast:false};
try{var s=JSON.parse(localStorage.getItem(KEY)||'{}');if(['both','ko','en'].indexOf(s.lang)>-1)p.lang=s.lang;if(['1','1.5','2','3','4'].indexOf(String(s.size))>-1)p.size=String(s.size);if(typeof s.contrast==='boolean')p.contrast=s.contrast;}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(p));}catch(e){}}
function apply(){paper.dataset.lang=p.lang;document.documentElement.style.setProperty('--scale',p.size);document.body.classList.toggle('contrast',p.contrast);
document.querySelectorAll('[data-choose-lang]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.chooseLang===p.lang));});
document.querySelectorAll('[data-size]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.size===p.size));});
document.getElementById('contrast').setAttribute('aria-pressed',String(p.contrast));}
document.querySelectorAll('[data-choose-lang]').forEach(function(b){b.addEventListener('click',function(){p.lang=b.dataset.chooseLang;apply();save();});});
document.querySelectorAll('[data-size]').forEach(function(b){b.addEventListener('click',function(){p.size=b.dataset.size;apply();save();});});
document.getElementById('contrast').addEventListener('click',function(){p.contrast=!p.contrast;apply();save();});
apply();})();
</script>"""


def jsonld(obj):
    return '<script type="application/ld+json">\n%s\n</script>' % json.dumps(obj, ensure_ascii=False, indent=1).replace('</', '<\\/')


def article_ld(r, url, date, abs_ko, abs_en, keywords, body_text=None):
    ld = {
        '@context': 'https://schema.org',
        '@type': 'ScholarlyArticle',
        '@id': url + '#article',
        'url': url,
        'mainEntityOfPage': url,
        'identifier': r['id'],
        'headline': clip(r['title_ko'], 110),
        'name': r['title_ko'],
        'alternativeHeadline': r['title_en'],
        'author': AUTHOR,
        'publisher': {'@id': SITE + '/#person', '@type': 'Person', 'name': 'DUNGZAK CESTLAVIE', 'url': SITE + '/'},
        'datePublished': date,
        'inLanguage': ['ko', 'en'],
        'genre': r.get('category', 'Theory'),
        'about': ['Aesthetics', 'Contemporary art', 'Art criticism', '미학', '현대미술', '미술비평'],
        'abstract': (abs_ko + '\n\n' + abs_en).strip(),
        'description': clip(r.get('summary_ko', '') + ' ' + r.get('summary_en', ''), 300),
        'image': OG_IMAGE,
        'isAccessibleForFree': True,
        'isPartOf': {'@type': 'CreativeWorkSeries', 'name': SERIES_EN, 'alternateName': SERIES_KO,
                     'url': SITE + '/reports/', 'author': {'@id': SITE + '/#person'}},
        'about_artist': None,
    }
    ld.pop('about_artist')
    if keywords:
        ld['keywords'] = keywords
    if body_text:
        ld['wordCount'] = len(body_text.split())
    return ld


def head_common(title, desc, url, og_type='article'):
    return f"""<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="author" content="DUNGZAK CESTLAVIE (등작 燈酌)">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<link rel="canonical" href="{esc(url)}">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="등작 燈酌 DUNGZAK CESTLAVIE">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{esc(url)}">
<meta property="og:image" content="{OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ko_KR">
<meta property="og:locale:alternate" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{OG_IMAGE}">"""


def build_report_page(r, prev_r, next_r, date):
    md_path = os.path.join(ROOT, r['md_path'])
    raw = open(md_path, encoding='utf-8').read()
    blocks = parse(raw)
    body = render(blocks)
    abs_ko, abs_en = section_text(blocks, r'^(초록.*Abstract|초록\s*[·/:]|요약|Abstract)')
    kw_ko, kw_en = section_text(blocks, r'^(주제어|키워드|Keywords)')
    keywords = ', '.join(x for x in [kw_ko, kw_en] if x)
    keywords = re.sub(r'\s*[·,，]\s*', ', ', keywords)
    if not abs_ko:
        abs_ko = r.get('summary_ko', '')
    if not abs_en:
        abs_en = r.get('summary_en', '')
    sid, url = short_id(r['id']), f"{SITE}/reports/{slug(r['id'])}/"
    title = f"{sid} · {r['title_ko']} / {r['title_en']} | 등작 DUNGZAK CESTLAVIE"
    desc = clip(f"{sid} 등작 燈酌 미학 보고서 — {r.get('summary_ko', '')} {r.get('summary_en', '')}", 300)
    y, m, d = date.split('-')
    ld = article_ld(r, url, date, abs_ko, abs_en, keywords, plain_text(blocks))
    crumbs = jsonld({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'DUNGZAK CESTLAVIE', 'item': SITE + '/'},
        {'@type': 'ListItem', 'position': 2, 'name': 'DCAR Reports', 'item': SITE + '/reports/'},
        {'@type': 'ListItem', 'position': 3, 'name': sid, 'item': url}]})

    def nav_link(x, label):
        if not x:
            return '<span></span>'
        return f'<a href="../{slug(x["id"])}/">{label} {esc(short_id(x["id"]))} · <span class="kr" lang="ko">{esc(x["title_ko"])}</span><span class="en" lang="en"> {esc(x["title_en"])}</span></a>'

    kw_html = ''
    if keywords:
        kw_html = f'<p class="kw"><strong>주제어 · Keywords</strong> — {esc(keywords)}</p>'
    abstract_html = f"""<section class="abstract-box" aria-labelledby="abs-h">
<h2 id="abs-h">요약 · SUMMARY</h2>
<p class="kr" lang="ko">{esc(r.get('summary_ko', ''))}</p>
<p class="en" lang="en">{esc(r.get('summary_en', ''))}</p>
{kw_html}
</section>"""
    page = f"""<!doctype html>
<html lang="ko">
<head>
{head_common(title, desc, url)}
<meta property="article:published_time" content="{date}">
<meta property="article:author" content="{SITE}/">
<meta property="article:section" content="{esc(r.get('category', 'Theory'))}">
<meta name="citation_title" content="{esc(r['title_ko'])}">
<meta name="citation_title" content="{esc(r['title_en'])}">
<meta name="citation_author" content="DUNGZAK CESTLAVIE">
<meta name="citation_publication_date" content="{y}/{m}/{d}">
<meta name="citation_journal_title" content="{esc(SERIES_EN)}">
<meta name="citation_technical_report_number" content="{esc(sid)}">
<meta name="citation_language" content="ko">
<meta name="citation_abstract_html_url" content="{esc(url)}">
<meta name="citation_fulltext_html_url" content="{esc(url)}">
{('<meta name="keywords" content="%s">' % esc(keywords)) if keywords else ''}
<link rel="alternate" type="application/rss+xml" title="DCAR Reports" href="{SITE}/reports/feed.xml">
{jsonld(ld)}
{crumbs}
<style>{reader_css()}{EXTRA_CSS}</style>
<link rel="stylesheet" href="../accessibility-reflow.css?v=20261117-2">
<link rel="stylesheet" href="../report-a11y.css?v=20261122-readable3">
</head>
<body>
<a class="skip" href="#paper">본문으로 이동 / Skip to report</a>
{TOOLBAR}
<main>
<article id="paper" data-lang="both">
<header class="paper-head">
<p class="crumbs"><a href="/">DUNGZAK CESTLAVIE</a> › <a href="../">DCAR Reports</a> › {esc(sid)}</p>
<p class="over">{esc(r['id'])} · {esc(r.get('year', ''))} · {esc(r.get('category', 'Theory'))}</p>
<h1 class="kr" lang="ko">{esc(r['title_ko'])}</h1>
<h1 class="en" lang="en">{esc(r['title_en'])}</h1>
<p class="authors">등작 燈酌 / DUNGZAK CESTLAVIE · <time datetime="{date}">{y}.{m}.{d}</time></p>
</header>
{abstract_html}
<div id="report-text" class="report-text">
{body}
</div>
<p class="cite-box"><span class="kr" lang="ko">인용 · </span><span class="en" lang="en">Cite · </span>DUNGZAK CESTLAVIE (등작 燈酌). ({y}). {esc(r['title_en'])} [{esc(r['title_ko'])}]. {esc(SERIES_EN)}, {esc(sid)}. {esc(url)}</p>
<nav class="series-nav" aria-label="DCAR 이전·다음 보고서 / Previous and next report">
{nav_link(prev_r, '←')}
<a href="../">DCAR 전체 목록 · All reports</a>
{nav_link(next_r, '→')}
</nav>
</article>
</main>
{PREFS_JS}
<script src="../report-a11y.js?v=20261122-readable3"></script>
</body>
</html>
"""
    return page, ld


def build_redirect_page(r, target):
    url = SITE + '/' + target
    title = f"{short_id(r['id'])} · {r['title_ko']} / {r['title_en']}"
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title>
<link rel="canonical" href="{esc(url)}">
<meta name="robots" content="noindex, follow">
<meta http-equiv="refresh" content="0; url=/{esc(target)}">
<script>location.replace('/{target}'+location.hash);</script>
</head>
<body><p><a href="/{esc(target)}">{esc(title)}</a></p></body>
</html>
"""


def build_hub(reports, dates):
    url = SITE + '/reports/'
    items, ld_items = [], []
    for i, r in enumerate(sorted(reports, key=lambda x: x['id'], reverse=True)):
        href = page_url(r)
        items.append(f"""<li class="hub-item">
<p class="over">{esc(r['id'])} · {esc(dates[r['id']])} · {esc(r.get('category', 'Theory'))}</p>
<h2><a href="{esc(href)}"><span class="kr" lang="ko">{esc(r['title_ko'])}</span><span class="en" lang="en">{esc(r['title_en'])}</span></a></h2>
<p class="kr" lang="ko">{esc(r.get('summary_ko', ''))}</p>
<p class="en" lang="en">{esc(r.get('summary_en', ''))}</p>
</li>""")
    for i, r in enumerate(sorted(reports, key=lambda x: x['id'])):
        ld_items.append({'@type': 'ListItem', 'position': i + 1, 'url': page_url(r),
                         'name': f"{short_id(r['id'])} · {r['title_ko']} / {r['title_en']}"})
    title = 'DCAR 미학 보고서 전체 목록 · Dungzak Concept Aesthetics Report | 등작 燈酌 DUNGZAK CESTLAVIE'
    desc = ('등작 燈酌 DUNGZAK CESTLAVIE의 미학 보고서 DCAR 시리즈 전체(DCAR-01~%02d). 빛·기억·존재, 색채와 형태의 언어, 전시와 예술 시장, '
            '존재–서사 역전 이론(BNIT), 촉각 감상권에 관한 작가 자신의 이론과 비평. '
            'The complete DCAR aesthetic report series by artist DUNGZAK CESTLAVIE (KR/EN).') % len(reports)
    ld = {'@context': 'https://schema.org', '@type': 'CollectionPage', '@id': url, 'url': url, 'name': SERIES_EN,
          'alternateName': SERIES_KO, 'description': desc, 'inLanguage': ['ko', 'en'], 'author': AUTHOR,
          'mainEntity': {'@type': 'ItemList', 'numberOfItems': len(reports), 'itemListElement': ld_items}}
    series = {'@context': 'https://schema.org', '@type': 'CreativeWorkSeries', '@id': url + '#series', 'name': SERIES_EN,
              'alternateName': [SERIES_KO, 'DCAR'], 'url': url, 'author': AUTHOR, 'inLanguage': ['ko', 'en'],
              'startDate': min(dates.values()), 'genre': ['Aesthetics', 'Art criticism', 'Art theory']}
    return f"""<!doctype html>
<html lang="ko">
<head>
{head_common(title, desc, url, 'website')}
<link rel="alternate" type="application/rss+xml" title="DCAR Reports" href="{SITE}/reports/feed.xml">
{jsonld(ld)}
{jsonld(series)}
<style>{reader_css()}{EXTRA_CSS}
.hub-list{{list-style:none;margin:0;padding:0}}
.hub-item{{padding:1.1rem 0;border-bottom:1px solid var(--border)}}
.hub-item h2{{font-size:calc(1.12rem * var(--scale));line-height:1.45;margin:.25rem 0 .4rem}}
.hub-item h2 a{{color:inherit;text-decoration:none}}
.hub-item h2 a:hover,.hub-item h2 a:focus-visible{{text-decoration:underline}}
.hub-item h2 .en{{display:block;font-size:.86em;font-weight:560;color:var(--muted)}}
.hub-item p{{margin:.2rem 0;font-size:calc(.95rem * var(--scale));line-height:1.7}}
article[data-lang="ko"] .hub-item .en,article[data-lang="en"] .hub-item .kr{{display:none}}
</style>
<link rel="stylesheet" href="./accessibility-reflow.css?v=20261117-2">
</head>
<body>
<a class="skip" href="#paper">본문으로 이동 / Skip to list</a>
{TOOLBAR}
<main>
<article id="paper" data-lang="both">
<header class="paper-head">
<p class="crumbs"><a href="/">DUNGZAK CESTLAVIE</a> › DCAR Reports</p>
<p class="over">DCAR · DUNGZAK CONCEPT AESTHETICS REPORT</p>
<h1 class="kr" lang="ko">DCAR 미학 보고서 전체 목록</h1>
<h1 class="en" lang="en">Dungzak Concept Aesthetics Report — All Reports</h1>
<p class="authors">등작 燈酌 / DUNGZAK CESTLAVIE · {len(reports)}편 · {len(reports)} reports</p>
</header>
<section class="abstract-box">
<p class="kr" lang="ko">DCAR는 작가 등작 燈酌이 자신의 작품 세계와 동시대 예술을 직접 이론화한 미학 보고서 시리즈입니다. 작품에 관한 가장 정확한 1차 비평 자료입니다.</p>
<p class="en" lang="en">DCAR is the aesthetic report series in which artist DUNGZAK CESTLAVIE theorizes his own work and contemporary art — the primary critical source on his practice.</p>
</section>
<ol class="hub-list" reversed>
{chr(10).join(items)}
</ol>
</article>
</main>
{PREFS_JS}
</body>
</html>
"""


PAGE_TARGET = {}


def page_url(r):
    return SITE + '/' + PAGE_TARGET[r['id']]


def rfc822(date):
    return datetime.fromisoformat(date + 'T09:00:00+09:00').strftime('%a, %d %b %Y %H:%M:%S +0900')


def build_feed(reports, dates):
    items = []
    for r in sorted(reports, key=lambda x: (dates[x['id']], x['id']), reverse=True):
        u = page_url(r)
        items.append(f"""  <item>
    <title>{esc(short_id(r['id']) + ' · ' + r['title_ko'] + ' / ' + r['title_en'])}</title>
    <link>{esc(u)}</link>
    <guid isPermaLink="true">{esc(u)}</guid>
    <pubDate>{rfc822(dates[r['id']])}</pubDate>
    <category>{esc(r.get('category', 'Theory'))}</category>
    <description>{esc(r.get('summary_ko', '') + ' ' + r.get('summary_en', ''))}</description>
  </item>""")
    now = datetime.now(KST).strftime('%a, %d %b %Y %H:%M:%S +0900')
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>DCAR 미학 보고서 · Dungzak Concept Aesthetics Report</title>
  <link>{SITE}/reports/</link>
  <atom:link href="{SITE}/reports/feed.xml" rel="self" type="application/rss+xml"/>
  <description>등작 燈酌 DUNGZAK CESTLAVIE 미학 보고서 시리즈 / Aesthetic reports by DUNGZAK CESTLAVIE</description>
  <language>ko</language>
  <lastBuildDate>{now}</lastBuildDate>
{chr(10).join(items)}
</channel>
</rss>
"""


def build_sitemap(reports, dates):
    today = datetime.now(KST).date().isoformat()
    urls = [(SITE + '/', today, '1.0'), (SITE + '/reports/', today, '0.9')]
    for r in sorted(reports, key=lambda x: x['id']):
        urls.append((page_url(r), dates[r['id']], '0.8'))
    body = '\n'.join(f'  <url>\n    <loc>{esc(u)}</loc>\n    <lastmod>{d}</lastmod>\n    <priority>{p}</priority>\n  </url>' for u, d, p in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}\n</urlset>\n'


def inject_ld(path, ld):
    """단독 HTML 보고서(head)에 JSON-LD 한 덩어리만 추가 — 화면·본문은 그대로."""
    src = open(path, encoding='utf-8').read()
    marker = '<!-- dcar-seo-jsonld -->'
    block = marker + jsonld(ld) + '<!-- /dcar-seo-jsonld -->'
    if marker in src:
        src = re.sub(re.escape(marker) + r'.*?<!-- /dcar-seo-jsonld -->', lambda m: block, src, flags=re.S)
    else:
        src = src.replace('</head>', block + '</head>', 1)
    open(path, 'w', encoding='utf-8').write(src)


def write(rel, text):
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8').write(text)


def main():
    reports = json.load(open(os.path.join(ROOT, 'data/reports.json'), encoding='utf-8'))['reports']
    reports = [r for r in reports if re.match(r'^DCAR-\d{2}-20\d{2}$', r.get('id', ''))]
    reports.sort(key=lambda x: x['id'])
    dates = {r['id']: pub_date(r['id'], r['md_path']) for r in reports}
    standalone = {}
    for r in reports:
        hp = r.get('html_path', '')
        if hp.endswith('.html') and 'reader.html' not in hp and os.path.exists(os.path.join(ROOT, hp)):
            standalone[r['id']] = hp
            PAGE_TARGET[r['id']] = hp
        else:
            PAGE_TARGET[r['id']] = f"reports/{slug(r['id'])}/"
    for i, r in enumerate(reports):
        prev_r = reports[i - 1] if i > 0 else None
        next_r = reports[i + 1] if i + 1 < len(reports) else None
        if r['id'] in standalone:
            write(f"reports/{slug(r['id'])}/index.html", build_redirect_page(r, standalone[r['id']]))
            raw = open(os.path.join(ROOT, r['md_path']), encoding='utf-8').read()
            blocks = parse(raw)
            a_ko, a_en = section_text(blocks, r'^(초록.*Abstract|초록\s*[·/:]|요약|Abstract)')
            k_ko, k_en = section_text(blocks, r'^(주제어|키워드|Keywords)')
            kw = re.sub(r'\s*[·,，]\s*', ', ', ', '.join(x for x in [k_ko, k_en] if x))
            inject_ld(os.path.join(ROOT, standalone[r['id']]),
                      article_ld(r, page_url(r), dates[r['id']], a_ko or r.get('summary_ko', ''),
                                 a_en or r.get('summary_en', ''), kw, plain_text(blocks)))
        else:
            page, _ = build_report_page(r, prev_r, next_r, dates[r['id']])
            write(f"reports/{slug(r['id'])}/index.html", page)
    write('reports/index.html', build_hub(reports, dates))
    write('reports/feed.xml', build_feed(reports, dates))
    write('sitemap.xml', build_sitemap(reports, dates))
    print('reports:', len(reports), '| static pages:', len(reports) - len(standalone), '| standalone kept:', sorted(standalone))


if __name__ == '__main__':
    main()
