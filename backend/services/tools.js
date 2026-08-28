/**
 * KatChat external tools for Sage.
 *
 * - Weather:   Open-Meteo (free, keyless, HTTPS)
 * - News:      Google News RSS (keyless) with Hacker News fallback
 * - Announcements: pulled from the DB on demand
 *
 * Every external call is time-boxed and cached in-memory. Failures return
 * null (or throw) so callers can degrade gracefully instead of crashing.
 */

const supabase = require('../supabase');

const FETCH_TIMEOUT = 8000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Tiny in-memory TTL cache ──────────────────────────────────
const cache = new Map();
function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.exp) { cache.delete(key); return null; }
  return entry.value;
}
function setCached(key, value, ttlMs) {
  cache.set(key, { value, exp: Date.now() + ttlMs });
}

// ═══════════════════════════════════════════════════════════════
// WEATHER — Open-Meteo (free, no key, HTTPS)
// ═══════════════════════════════════════════════════════════════
const WMO_CODES = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'rime fog',
  51: 'light drizzle', 53: 'moderate drizzle', 55: 'dense drizzle',
  56: 'light freezing drizzle', 57: 'dense freezing drizzle',
  61: 'light rain', 63: 'moderate rain', 65: 'heavy rain',
  66: 'light freezing rain', 67: 'heavy freezing rain',
  71: 'light snow', 73: 'moderate snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light rain showers', 81: 'moderate rain showers', 82: 'violent rain showers',
  85: 'light snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with slight hail', 99: 'thunderstorm with heavy hail'
};
const weatherLabel = (code) => WMO_CODES[code] || 'unknown conditions';

async function geocodeLocation(location) {
  const url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' +
    encodeURIComponent(location);
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data && data.results && data.results[0];
  if (!hit || !hit.latitude || !hit.longitude) return null;
  return { name: hit.name, country: hit.country || '', lat: hit.latitude, lon: hit.longitude };
}

async function fetchWeatherData(location) {
  const key = 'w:' + String(location || '').toLowerCase().trim();
  const cached = getCached(key);
  if (cached) return cached;

  const geo = await geocodeLocation(location);
  if (!geo) return null;

  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + geo.lat +
    '&longitude=' + geo.lon +
    '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3';
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const d = await res.json();
  if (!d || !d.current) return null;

  const daily = (d.daily && d.daily.time || []).map((day, i) => ({
    day: i === 0 ? 'Today' : new Date(day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
    label: weatherLabel(d.daily.weather_code[i]),
    hi: Math.round(d.daily.temperature_2m_max[i]),
    lo: Math.round(d.daily.temperature_2m_min[i])
  }));

  const result = {
    location: geo.name + (geo.country ? ', ' + geo.country : ''),
    fetchedAt: Date.now(),
    current: {
      temp: Math.round(d.current.temperature_2m),
      humidity: d.current.relative_humidity_2m,
      wind: d.current.wind_speed_10m,
      label: weatherLabel(d.current.weather_code)
    },
    daily
  };
  setCached(key, result, 15 * 60 * 1000);
  return result;
}

// Compact one-liner string for Sage (never raw API JSON).
function formatWeatherForSage(w) {
  if (!w) return null;
  const t = new Date(w.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const lines = [
    `Weather in ${w.location} (fetched ${t}): ${w.current.temp}°C, ${w.current.label}, humidity ${w.current.humidity}%, wind ${w.current.wind} km/h`
  ];
  w.daily.forEach((d) => lines.push(`- ${d.day}: ${d.lo}°C to ${d.hi}°C, ${d.label}`));
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// NEWS — Google News RSS (keyless) with Hacker News fallback
// ═══════════════════════════════════════════════════════════════
const NEWS_CATEGORY_URLS = {
  world: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en',
  technology: 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en',
  science: 'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-US&gl=US&ceid=US:en',
  sports: 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-US&gl=US&ceid=US:en',
  business: 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en',
  entertainment: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en-US&gl=US&ceid=US:en',
  top: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en'
};
// Categories without a Google News topic page fall back to a keyless RSS
// search so they still return category-appropriate headlines.
const NEWS_SEARCH_DEFAULT_QUERY = {
  ai: 'artificial intelligence',
  gaming: 'video games'
};
const NEWS_SEARCH = (q) =>
  'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=en-US&gl=US&ceid=US:en';

const decodeEntities = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");

function parseRssItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const grab = (tag) => {
      const r = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
      return r ? decodeEntities(r[1].trim()) : '';
    };
    const title = grab('title');
    const link = grab('link');
    if (!title || !link) continue;
    const source = grab('source');
    const pubDate = grab('pubDate');
    const desc = grab('description').replace(/<[^>]*>/g, '').replace(/&hellip;/g, '…').slice(0, 160);
    items.push({ title, link, source, pubDate, desc });
  }
  return items;
}

async function fetchNewsRss(url) {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 KatChat' } });
  if (!res.ok) return null;
  const xml = await res.text();
  const items = parseRssItems(xml).slice(0, 5);
  return items.length ? items : null;
}

async function fetchHackerNews(query) {
  const url = 'https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5' +
    (query ? '&query=' + encodeURIComponent(query) : '');
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const d = await res.json();
  return (d && d.hits || []).filter((h) => h.title).map((h) => ({
    title: h.title,
    link: h.url || ('https://news.ycombinator.com/item?id=' + h.objectID),
    source: 'Hacker News',
    pubDate: '',
    desc: ''
  }));
}

async function fetchNews({ category, query }) {
  const cat = NEWS_CATEGORY_URLS[category] ? category : 'top';
  // Categories without a topic page (ai/gaming) get a sensible keyless search.
  if (!query && NEWS_SEARCH_DEFAULT_QUERY[category]) query = NEWS_SEARCH_DEFAULT_QUERY[category];
  const key = 'n:' + cat + ':' + String(query || '').toLowerCase().trim();
  const cached = getCached(key);
  if (cached) return cached;

  let items = null;
  if (query) items = await fetchNewsRss(NEWS_SEARCH(query + ' when:1d'));
  if (!items && NEWS_CATEGORY_URLS[cat]) items = await fetchNewsRss(NEWS_CATEGORY_URLS[cat]);
  if (!items && (category === 'technology' || category === 'ai')) items = await fetchHackerNews(query || 'technology');

  if (!items) return null;
  setCached(key, items, 10 * 60 * 1000);
  return items;
}

function formatNewsForSage(items) {
  if (!items || !items.length) return null;
  const lines = items.map((it, i) => {
    const when = it.pubDate ? ' (' + it.pubDate + ')' : '';
    const src = it.source ? ' — ' + it.source : '';
    const desc = it.desc ? ' — ' + it.desc : '';
    const url = it.link ? ' [' + it.link + ']' : '';
    return (i + 1) + '. ' + it.title + src + when + desc + url;
  });
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// ANNOUNCEMENTS — from the DB, compact for Sage
// ═══════════════════════════════════════════════════════════════
async function fetchAnnouncementsForSage(limit = 3) {
  const key = 'ann:' + limit;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const { data } = await supabase
      .from('announcements')
      .select('title, content, created_at, pinned')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!data || !data.length) return null;
    const lines = data.map((a) => {
      const pin = a.pinned ? '[PINNED] ' : '';
      const date = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const content = String(a.content || '').slice(0, 200);
      return `${pin}"${a.title}" (${date}): ${content}`;
    });
    const text = lines.join('\n');
    setCached(key, text, 5 * 60 * 1000);
    return text;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// INTENT DETECTION — which tool (if any) a Sage message needs
// ═══════════════════════════════════════════════════════════════
const WEATHER_RE = /\b(weather|forecast|temperature|rain|snow|humid|windy|sunny|cloudy|storm|thunder)\b/i;
const ANN_RE = /\bannouncements?\b|\bkatchat\s+(?:say|post|announc)|what(?:\s*'s|\s+is)?\s+(?:new\s+on\s+|happening\s+on\s+)?(?:katchat|the\s+app)\b|\b(?:new|any|the|latest|show|see|read)\s+posts?\b/i;
const NEWS_RE = /\bnews\b|\bheadlines?\b|\bwhat(?:'s|s|\s+is)\s+(?:going\s+on|happening|new|up)\b|\btoday'?s?\s+(?:news|headlines|stories)|latest\s+(?:news|updates|stories|headlines)/i;

function extractLocation(text) {
  let m = text.match(/(?:weather|forecast|temperature)(?:\s+(?:in|at|for|of|around|like))?\s+([A-Za-z][A-Za-z\s.'-]{1,40})/i);
  if (m) return cleanLocation(m[1]);
  m = text.match(/\b(?:in|at|for)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2})\b/);
  return m ? cleanLocation(m[1]) : null;
}
function cleanLocation(s) {
  let loc = String(s || '').trim();
  loc = loc.replace(/^(?:like|today|tomorrow|right\s+now|now|please|in|at|for|of|around|this\s+(?:week|weekend))\s+/i, '');
  loc = loc.replace(/\s+(?:today|tomorrow|right\s+now|now|please|in|at|for|of|around|rn|this\s+(?:week|weekend))$/i, '');
  loc = loc.replace(/[?.!,'"]$/g, '');
  return loc.trim().slice(0, 60);
}

const NEWS_CATEGORY_RE = {
  nepal: /\bnepal\b/i,
  world: /\bworld(?:wide)?\b/i,
  technology: /\btech(?:nology)?\b/i,
  science: /\bscience\b/i,
  sports: /\bsports?\b|football|cricket|soccer/i,
  ai: /\b(?:a\.i\.|ai|artificial\s+intelligence)\b/i,
  gaming: /\bgam(?:ing|es)?\b/i
};

function detectNewsCategory(text) {
  for (const [cat, re] of Object.entries(NEWS_CATEGORY_RE)) {
    if (re.test(text)) return cat;
  }
  return null;
}

function extractNewsQuery(text) {
  let m = text.match(/\bnews\s+(?:about|on|of)\s+([A-Za-z][\w\s.'-]{1,40})/i);
  if (!m) m = text.match(/\b(?:about|on|of|in)\s+([A-Z][\w\s.'-]{1,40})/i);
  if (m) {
    const q = cleanLocation(m[1]);
    if (q && q.toLowerCase() !== 'weather') return q;
  }
  return null;
}

async function detectToolIntent(text) {
  const msg = String(text || '').trim();
  if (!msg) return null;

  if (WEATHER_RE.test(msg)) return { type: 'weather', location: extractLocation(msg) };
  if (ANN_RE.test(msg)) return { type: 'announcements' };
  if (NEWS_RE.test(msg)) return { type: 'news', category: detectNewsCategory(msg), query: extractNewsQuery(msg) };
  return null;
}

// Build a compact context block appended to Sage's system prompt.
// Failures become short system notes so Sage answers gracefully instead
// of pretending the internet is gone.
async function buildToolContext(text) {
  const intent = await detectToolIntent(text);
  if (!intent) return '';

  switch (intent.type) {
    case 'weather': {
      if (!intent.location) {
        return '\n\n[System note] The user asked about the weather but did not name a city. Ask them which city they want weather for — do not guess.';
      }
      const w = await fetchWeatherData(intent.location);
      if (!w) {
        return '\n\n[System note] The user asked about the weather in "' + intent.location +
          '" but the weather service could not find that place. Tell them you could not find weather data for that location and suggest a nearby city.';
      }
      return '\n\nLive weather data (use this — you can access the internet):\n' + formatWeatherForSage(w);
    }
    case 'announcements': {
      const ann = await fetchAnnouncementsForSage(5);
      if (!ann) return '\n\n[System note] There are no announcements yet. Tell the user there are no posts yet.';
      return '\n\nRecent KatChat announcements (the user is asking about these):\n' + ann;
    }
    case 'news': {
      const items = await fetchNews({ category: intent.category || 'top', query: intent.query });
      if (!items) {
        return '\n\n[System note] The news service is temporarily unavailable. Tell the user you could not fetch news right now and to try again shortly.';
      }
      return '\n\nLive news headlines (use these — you can access the internet):\n' + formatNewsForSage(items);
    }
    default:
      return '';
  }
}

module.exports = {
  fetchWithTimeout,
  fetchWeatherData,
  formatWeatherForSage,
  fetchNews,
  formatNewsForSage,
  fetchAnnouncementsForSage,
  detectToolIntent,
  buildToolContext,
  sleep,
  NEWS_RE,
  ANN_RE,
  WEATHER_RE
};