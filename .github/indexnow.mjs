import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const { SITE_HOST: host, INDEXNOW_BASELINE: baseline, INDEXNOW_KEY_FILE: keyFile, GITHUB_REPOSITORY: repo, GH_TOKEN: token, GITHUB_EVENT_NAME: event, GITHUB_SHA: eventSha } = process.env;
const origin = `https://${host}`;
const stateBranch = 'indexnow-state';
const message = 'Record IndexNow deployment receipt';
const allowedHost = new Set(['dungzak.art', 'dungzaklab.art']);
const restricted = /(?:^|\/)(?:app|admin|account|delete-account|log[-_]?in|sign[-_]?(?:in|up)|private|dashboard|subscribe|subscription|checkout|billing|auth|members?|reports\/(?:reader|print)[^/]*)(?:[/.\-_]|$)/i;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const readAt = (sha, path) => {
  try { return git('show', `${sha}:${path}`); } catch { return undefined; }
};
const pagePath = url => {
  const path = new URL(url).pathname;
  return (path.endsWith('/') ? `${path}index.html` : path).slice(1);
};
const eligible = url => {
  try {
    const parsed = new URL(url);
    return parsed.origin === origin && !parsed.search && !parsed.hash && !parsed.username && !parsed.password
      && !restricted.test(decodeURIComponent(parsed.pathname)) && /(?:\/|\.html)$/.test(parsed.pathname);
  } catch { return false; }
};
const noindex = /\b(?:noindex|none)\b/i;
const attribute = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find(value => value !== undefined);

function metadata(html) {
  const head = html.split(/<\/head\s*>/i, 1)[0].replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script\s*>/gi, '');
  const meta = [...head.matchAll(/<meta\b[^>]*>/gi)].map(match => match[0]);
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]);
  return {
    excluded: meta.some(tag => /^(robots|bingbot|googlebot|yeti)$/i.test(attribute(tag, 'name') ?? '') && noindex.test(attribute(tag, 'content') ?? '')),
    canonical: links.filter(tag => attribute(tag, 'rel')?.toLowerCase() === 'canonical').map(tag => attribute(tag, 'href')),
    refresh: meta.some(tag => attribute(tag, 'http-equiv')?.toLowerCase() === 'refresh'),
  };
}

function inventory(sha) {
  const xml = readAt(sha, 'sitemap.xml');
  if (!xml || !/<urlset\b/.test(xml)) throw new Error(`Expected sitemap urlset at ${sha}`);
  const inventory = new Map();
  for (const [, loc] of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    const url = loc.replaceAll('&amp;', '&');
    if (!eligible(url)) continue;
    const path = pagePath(url);
    const html = readAt(sha, path);
    if (!html) continue;
    const info = metadata(html);
    if (info.excluded || info.refresh || info.canonical.some(target => !target || new URL(target, url).href !== url)) continue;
    inventory.set(url, path);
  }
  return inventory;
}

function dependencies(url, path) {
  if (host === 'dungzak.art' && path === 'index.html') return /^(?:data\/(?:works|artworks|reports)\.json$|artworks\.json$|images\/standard\/|public\/thumbs\/|assets\/artworks\/)/;
  if (host === 'dungzak.art' && path === 'reports/index.html') return /^data\/reports\.json$/;
  if (host === 'dungzaklab.art' && url.endsWith('/archivepro/')) return /^archivepro\/(?:data\/works\.json|archive-runtime\.js)$/;
  if (host === 'dungzaklab.art' && path === 'index.html') return /^data\/(?:dcap|dcao)\.json$/;
  return /(?!) /;
}

function artworkInventory(text) {
  const data = JSON.parse(text);
  const works = Array.isArray(data) ? data : data.works;
  if (!Array.isArray(works)) throw new Error('Invalid artwork inventory');
  const counts = new Map();
  for (const { id } of works) if (typeof id === 'string') counts.set(id.toUpperCase(), (counts.get(id.toUpperCase()) ?? 0) + 1);
  const published = new Map();
  for (const work of works) {
    if (typeof work.id !== 'string' || !/^[\w-]+$/.test(work.id) || work.private === true || work.published === false || work.noindex === true) continue;
    const url = new URL('/work.html', origin);
    url.searchParams.set('id', work.id);
    if (counts.get(work.id.toUpperCase()) > 1) {
      if (!/^[\w-]+$/.test(String(work.section_id ?? ''))) continue;
      url.searchParams.set('section', String(work.section_id));
    }
    if (published.has(url.href)) throw new Error(`Ambiguous public artwork URL: ${url.href}`);
    published.set(url.href, JSON.stringify(work));
  }
  return published;
}

function candidates(previous, deployed) {
  const before = inventory(previous);
  const after = inventory(deployed);
  const diff = git('diff', '--no-renames', '--name-only', '-z', previous, deployed).split('\0');
  const changes = new Set(diff);
  const updated = [...after].filter(([url, path]) => changes.has(path)
    || diff.some(file => dependencies(url, path).test(file))).map(([url]) => [url, 'updated']);
  const removed = [...before].filter(([url, path]) => !after.has(url) && changes.has(path)
    && (!readAt(deployed, path) || metadata(readAt(deployed, path)).refresh))
    .map(([url]) => [url, 'removed']);
  if (host === 'dungzak.art' && changes.has('data/works.json') && readAt(deployed, 'work.html')) {
    const oldWorks = artworkInventory(readAt(previous, 'data/works.json'));
    const newWorks = artworkInventory(readAt(deployed, 'data/works.json'));
    for (const [url, record] of newWorks) if (oldWorks.get(url) !== record) updated.push([url, 'artwork']);
    // The static artwork viewer still returns 200 for unknown IDs. Submit removals only for routes serving a real redirect or 404/410.
    for (const url of oldWorks.keys()) if (!newWorks.has(url)) removed.push([url, 'removed']);
  }
  return [...updated, ...removed];
}

function allowedByRobots(robots, path) {
  const groups = [];
  let group;
  for (const line of robots.split(/\r?\n/)) {
    const [, field, value] = line.split('#', 1)[0].match(/^\s*([\w-]+):\s*(.*?)\s*$/) ?? [];
    if (field?.toLowerCase() === 'user-agent') {
      if (!group || group.hasRules) groups.push(group = { agents: [], rules: [], hasRules: false });
      group.agents.push(value.toLowerCase());
    } else if (group && /^(allow|disallow)$/i.test(field ?? '')) {
      group.hasRules = true;
      if (value) group.rules.push([field.toLowerCase(), value]);
    }
  }
  return ['bingbot', 'yeti'].every(bot => {
    const exact = groups.filter(g => g.agents.includes(bot));
    const selected = exact.length ? exact : groups.filter(g => g.agents.includes('*'));
    const matches = selected.flatMap(g => g.rules).filter(([, pattern]) => {
      const end = pattern.endsWith('$');
      const literal = (end ? pattern.slice(0, -1) : pattern).split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
      return new RegExp(`^${literal}${end ? '$' : ''}`).test(path);
    });
    matches.sort((a, b) => b[1].replaceAll('*', '').length - a[1].replaceAll('*', '').length || a[0].localeCompare(b[0]));
    return matches[0]?.[0] !== 'disallow';
  });
}

const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) });

async function api(path, method = 'GET', body, allowMissing = false) {
  const result = await request(`https://api.github.com/repos/${repo}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: body && JSON.stringify(body),
  });
  if (allowMissing && result.status === 404) return null;
  if (!result.ok) throw new Error(`GitHub API ${method} ${path.split('?')[0]} returned HTTP ${result.status}`);
  return result.json();
}

async function latestDeployment() {
  const deployments = await api('deployments?environment=github-pages&per_page=30');
  for (const deployment of deployments) {
    if (deployment.ref !== 'main') continue;
    const [status] = await api(`deployments/${deployment.id}/statuses?per_page=1`);
    if (status?.state === 'success' && status.environment_url && new URL(status.environment_url).hostname === host) return deployment.sha;
  }
  throw new Error(`No successful main deployment found for ${host}`);
}

async function loadState() {
  const file = await api(`contents/receipt.json?ref=${stateBranch}`, 'GET', undefined, true);
  if (!file) return { deployed: baseline };
  return { ...JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')), blob: file.sha };
}

async function saveState(previous, deployed, urls, status) {
  const content = JSON.stringify({ deployed, count: urls.length, batch: digest(JSON.stringify(urls)), status, recordedAt: new Date().toISOString() }, null, 2) + '\n';
  if (previous.blob) {
    await api('contents/receipt.json', 'PUT', { branch: stateBranch, message, sha: previous.blob, content: Buffer.from(content).toString('base64') });
    return;
  }
  const tree = await api('git/trees', 'POST', { tree: [{ path: 'receipt.json', mode: '100644', type: 'blob', content }] });
  const commit = await api('git/commits', 'POST', { message, tree: tree.sha, parents: [] });
  await api('git/refs', 'POST', { ref: `refs/heads/${stateBranch}`, sha: commit.sha });
}

const digest = value => createHash('sha256').update(value).digest('hex');

async function checkLive(url, operation, robots, deployed, liveArtworks) {
  const parsed = new URL(url);
  if (!allowedByRobots(robots, parsed.pathname)) return 'excluded by robots.txt';
  const checkedUrl = new URL(url);
  checkedUrl.searchParams.set('_indexnow', deployed);
  const response = await request(checkedUrl, { redirect: 'manual' });
  const html = await response.text();
  const info = metadata(html);
  if (response.status >= 500 || response.status === 429) throw new Error(`${url} returned HTTP ${response.status}`);
  if (response.headers.has('www-authenticate') || [401, 403].includes(response.status)
    || noindex.test(response.headers.get('x-robots-tag') ?? '') || info.excluded) return 'excluded by access or indexing directive';
  if (operation === 'removed') {
    if ([404, 410].includes(response.status)) return 'send';
    const location = response.headers.get('location');
    if ([301, 308].includes(response.status) && location && new URL(location, url).href !== url) return 'send';
    return 'previous URL still public or removal is unconfirmed';
  }
  if (response.status !== 200) throw new Error(`Published ${url} returned HTTP ${response.status}; will retry on next run`);
  if (operation === 'artwork') {
    if (!liveArtworks?.has(url)) throw new Error(`Artwork is absent from the deployed inventory: ${url}`);
    if (info.canonical.length !== 1 || new URL(info.canonical[0], url).href !== `${origin}/work.html` || !html.includes('pageUrl.searchParams.set("id", work.id)')) return 'artwork template canonical is unconfirmed';
    return 'send';
  }
  if (!response.headers.get('content-type')?.includes('text/html') || info.refresh
    || info.canonical.some(target => !target || new URL(target, url).href !== url)) return 'excluded by content type, redirect or canonical';
  return 'send';
}

async function submit(payload) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await request('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload) });
    } catch (error) {
      console.warn(`IndexNow attempt ${attempt}: ${error.message}`);
      if (attempt === 3) throw error;
    }
    if (response) {
      const { status } = response;
      console.log(`IndexNow attempt ${attempt}: HTTP ${status}`);
      if (status === 200 || status === 202) return status;
      if (attempt === 3 || (status !== 429 && status < 500)) throw new Error(`IndexNow rejected submission with HTTP ${status}`);
    }
    const header = response?.headers.get('retry-after');
    const wait = header ? (/^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
    if (wait > 60000) throw new Error(`IndexNow retry deferred (${header})`);
    await delay(Math.max(2000 * 2 ** attempt, Number.isFinite(wait) ? wait : 0));
  }
}

if (!allowedHost.has(host)) throw new Error('Unrecognized official production host');
if (process.argv[2] === '--plan') {
  console.log(JSON.stringify(candidates(process.argv[3], process.argv[4]), null, 2));
  process.exit(0);
}
const previous = await loadState();
let deployed = await latestDeployment();
if (event === 'push') {
  if (!/^[a-f0-9]{40}$/.test(eventSha)) throw new Error('Invalid push commit');
  for (let attempt = 0; deployed !== eventSha; attempt++) {
    try { git('merge-base', '--is-ancestor', eventSha, deployed); break; } catch { /* Pages is still deploying this push. */ }
    if (attempt === 19) throw new Error('No successful Pages deployment for this push yet; the scheduled workflow will retry');
    await delay(15000);
    deployed = await latestDeployment();
  }
}
if (previous.deployed === deployed) {
  console.log(`Deployment ${deployed} already processed`);
  process.exit(0);
}
for (const sha of [previous.deployed, deployed]) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid deployment commit');
}
git('merge-base', '--is-ancestor', previous.deployed, deployed);
const changes = candidates(previous.deployed, deployed);
const base = new URL(`/${keyFile}`, origin);
const key = readFileSync(keyFile, 'utf8').trim();
if (!/^[a-f0-9]{32}$/.test(key) || keyFile !== `${key}.txt`) throw new Error('Invalid public IndexNow key file');
const keyCheck = await request(base, { redirect: 'manual' });
if (keyCheck.status !== 200 || (await keyCheck.text()).trim() !== key) throw new Error(`Public key verification failed: HTTP ${keyCheck.status}`);
const robots = await request(`${origin}/robots.txt`, { redirect: 'manual' });
if (robots.status !== 200) throw new Error(`robots.txt returned HTTP ${robots.status}`);
const rules = await robots.text();
let liveArtworks;
if (changes.some(([, operation]) => operation === 'artwork')) {
  const data = await request(`${origin}/data/works.json?_indexnow=${deployed}`, { redirect: 'manual' });
  const body = await data.text();
  if (!data.ok || digest(body) !== digest(readAt(deployed, 'data/works.json'))) throw new Error('Published artwork inventory does not match the completed deployment');
  liveArtworks = artworkInventory(body);
}
const urlList = [];
for (const [url, operation] of changes) {
  const result = await checkLive(url, operation, rules, deployed, liveArtworks);
  console.log(`${operation} ${url}: ${result}`);
  if (result === 'send') urlList.push(url);
}
if (urlList.length > 10000) throw new Error('Submission exceeds the IndexNow limit of 10,000 URLs');
if (await latestDeployment() !== deployed) throw new Error('A newer Pages deployment completed during verification');
const status = urlList.length ? await submit({ host, key, keyLocation: base.href, urlList }) : null;
await saveState(previous, deployed, urlList, status);
console.log(`${deployed}: ${urlList.length} submitted; ${status === 202 ? 'key validation pending' : status === 200 ? 'accepted' : 'no eligible changes'}`);
