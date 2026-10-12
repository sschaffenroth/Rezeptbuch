'use strict';
/* ---------- Grundlagen ---------- */
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'rezeptbuch.data.v1', CFG = 'rezeptbuch.cfg.v1';
const MIN_DISHES = 4, MAX_DISHES = 7;
const UNITS = ['g', 'kg', 'ml', 'l', 'EL', 'TL', 'Stk', 'Stück', 'Prise', 'Bund', 'Pck', 'Dose', 'Zehe', 'Zehen', 'Tasse', 'Becher', 'Scheibe', 'Scheiben'];

const SAMPLE = [
  ['Spaghetti Bolognese', 4, ['500 g Spaghetti', '400 g Hackfleisch', '1 Stk Zwiebel', '2 Zehe Knoblauch', '500 ml passierte Tomaten', '2 EL Tomatenmark', '2 EL Olivenöl', '1 Prise Salz'], 'Zwiebel und Knoblauch würfeln und im Öl anbraten.\nHack dazugeben und krümelig braten, Tomatenmark kurz mitrösten.\nTomaten zugeben und 25 Minuten köcheln lassen, würzen.\nSpaghetti kochen und mit der Sauce servieren.', ['Pasta', 'Fleisch', 'Klassiker']],
  ['Gemüsecurry', 4, ['2 Stk Süßkartoffel', '1 Stk Paprika', '400 ml Kokosmilch', '2 EL Currypaste', '200 g Kichererbsen', '250 g Basmatireis', '1 Stk Zwiebel'], 'Reis nach Packungsanleitung kochen.\nZwiebel andünsten, Currypaste kurz mitbraten.\nGewürfeltes Gemüse und Kokosmilch zugeben, 20 Minuten köcheln.\nKichererbsen dazugeben, abschmecken.', ['Vegan', 'Reis', 'Schnell']],
  ['Pfannkuchen', 4, ['250 g Mehl', '500 ml Milch', '3 Stk Eier', '1 Prise Salz', '2 EL Butter', '2 EL Zucker'], 'Mehl, Milch, Eier, Zucker und Salz glatt verrühren.\nTeig 10 Minuten quellen lassen.\nIn Butter portionsweise goldbraun ausbacken.', ['Süß', 'Vegetarisch', 'Schnell']],
  ['Ofenlachs mit Kartoffeln', 2, ['2 Stk Lachsfilet', '600 g Kartoffeln', '1 Stk Zitrone', '2 EL Olivenöl', '1 Bund Dill', '1 Prise Salz'], 'Kartoffeln würfeln, mit Öl und Salz 20 Minuten bei 200 °C backen.\nLachs daraufsetzen, mit Zitrone beträufeln.\nWeitere 12 Minuten backen, mit Dill bestreuen.', ['Fisch', 'Ofen']],
  ['Tomatensuppe', 4, ['800 g Tomaten', '1 Stk Zwiebel', '500 ml Gemüsebrühe', '100 ml Sahne', '2 EL Olivenöl', '1 Bund Basilikum'], 'Zwiebel in Öl andünsten, Tomaten und Brühe zugeben.\n20 Minuten köcheln, pürieren.\nSahne einrühren und mit Basilikum servieren.', ['Suppe', 'Vegetarisch']],
];

let cfg = { clientId: '', lastSync: 0 };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG))); } catch { }
let S = (() => {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.recipes) return d; } catch { }
  const now = Date.now();
  return {
    recipes: SAMPLE.map(([title, portions, ing, steps, tags]) => ({
      id: uid(), title, portions, tags, steps, ingredients: ing.map(parseIngredient), updatedAt: now,
    })), plans: [],
  };
})();
const view = { tab: 'plans', prevTab: 'plans', planId: null, shopId: null, q: '', pq: '', tag: '', sort: 'az' };

function persist() {
  localStorage.setItem(KEY, JSON.stringify(S));
  scheduleSync();
}
function saveCfg() { localStorage.setItem(CFG, JSON.stringify(cfg)); }
const liveRecipes = () => S.recipes.filter(r => !r.deleted);
const livePlans = () => S.plans.filter(p => !p.deleted);
const sortedPlans = () => livePlans().sort((a, b) => !!b.pinned - !!a.pinned || b.updatedAt - a.updatedAt);
const recipe = id => S.recipes.find(r => r.id === id && !r.deleted);
const plan = id => S.plans.find(p => p.id === id && !p.deleted);
/* Plan, auf den sich Einkaufs-Aktionen beziehen: im Einkaufen-Tab der gewählte, sonst der geöffnete */
const shopPlan = () => plan(view.tab === 'shop' ? view.shopId : view.planId);

/* ---------- Icons (Inline-SVG, einheitlich auf allen Geräten) ---------- */
const ICON = {
  pot: '<path d="M5 11h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M3 11h18M12 8v3M9 3.5c0 1.5 1 1.5 1 3M14 3.5c0 1.5 1 1.5 1 3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  cart: '<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="10" cy="20" r="1"/><circle cx="17" cy="20" r="1"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1 .5 7.97H7z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/><circle cx="12" cy="12" r="7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  more: '<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>',
  pin: '<path d="M9 3h6l-.6 6 2.6 2.6V13H7v-1.4L9.6 9z"/><path d="M12 13v8"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  download: '<path d="M12 3v12M8 11l4 4 4-4M5 19h14"/>',
  upload: '<path d="M12 15V3M8 7l4-4 4 4M5 19h14"/>',
  leaf: '<path d="M4 20c0-9 5-14 16-16-1 11-6 16-14 16"/><path d="M4 20c3-5 7-8 11-10"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
  home: '<path d="m3 11 9-8 9 8M5 10v10h14V10"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14"/><circle cx="12" cy="17.2" r=".8" fill="currentColor"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

/* ---------- Zutaten ---------- */
function parseAmount(t) {
  if (!t) return null;
  t = t.replace(',', '.');
  if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/'); return +a / +b; }
  const n = parseFloat(t); return isNaN(n) ? null : n;
}
function parseIngredient(line) {
  const parts = line.trim().split(/\s+/);
  let amount = null, unit = '';
  if (parts.length && /^[\d.,/]+$/.test(parts[0])) { amount = parseAmount(parts.shift()); }
  if (amount !== null && parts.length > 1 && UNITS.some(u => u.toLowerCase() === parts[0].toLowerCase())) unit = parts.shift();
  else if (amount === null && parts.length > 1 && parts[0].toLowerCase() === 'prise') unit = parts.shift();
  return { amount, unit, name: parts.join(' ') };
}
const fmtAmount = n => n === null || n === undefined ? '' : (Math.round(n * 100) / 100).toString().replace('.', ',');
const ingLine = i => [fmtAmount(i.amount), i.unit, i.name].filter(Boolean).join(' ');
const ingKey = i => i.name.trim().toLowerCase() + '|' + i.unit.trim().toLowerCase();
const amtTxt = (amount, unit) => (fmtAmount(amount) + ' ' + unit).trim();

/* Überschneidung: Grundzutaten zählen nicht, Vergleich über das letzte Wort ("passierte Tomaten" = "Tomaten") */
const STAPLES = ['salz', 'pfeffer', 'wasser', 'öl', 'olivenöl', 'zucker', 'mehl', 'butter', 'essig', 'prise', 'gewürze', 'brühe', 'gemüsebrühe'];
function stem(name) {
  let w = name.toLowerCase().trim().split(/\s+/).pop().replace(/[^a-zäöüß]/g, '');
  if (w.length > 5) w = w.replace(/(en|n|e|s)$/, '');
  return w;
}
const isStaple = s => STAPLES.some(x => s === x || s === stem(x));
const freshSet = r => new Set(r.ingredients.map(i => stem(i.name)).filter(s => s && !isStaple(s)));
function planUsage(p) { // stem -> {name, titles[]}
  const m = new Map();
  p.dishes.forEach(d => {
    const r = recipe(d.rid); if (!r) return;
    r.ingredients.forEach(i => {
      const s = stem(i.name); if (!s || isStaple(s)) return;
      const e = m.get(s) || { name: i.name, titles: [] }; e.titles.push(r.title); m.set(s, e);
    });
  });
  return m;
}
function overlap(r, p) {
  const use = planUsage(p), shared = [];
  freshSet(r).forEach(s => { if (use.has(s)) shared.push(r.ingredients.find(i => stem(i.name) === s).name); });
  return shared;
}
/* ---------- Kategorien (Reihenfolge ≈ Gang durch den Supermarkt) ---------- */
const CATS = [
  { id: 'obst', icon: '🥬', name: 'Obst & Gemüse' },
  { id: 'brot', icon: '🍞', name: 'Brot & Backwaren' },
  { id: 'milch', icon: '🧀', name: 'Milchprodukte & Eier' },
  { id: 'fleisch', icon: '🥩', name: 'Fleisch & Wurst' },
  { id: 'fisch', icon: '🐟', name: 'Fisch & Meeresfrüchte' },
  { id: 'tk', icon: '🧊', name: 'Tiefkühlprodukte' },
  { id: 'trocken', icon: '🍝', name: 'Nudeln, Reis & Getreide' },
  { id: 'konserven', icon: '🥫', name: 'Konserven & Soßen' },
  { id: 'gewuerze', icon: '🧂', name: 'Gewürze, Öl & Essig' },
  { id: 'backen', icon: '🧁', name: 'Backen & Süßes' },
  { id: 'getraenke', icon: '🥤', name: 'Getränke' },
  { id: 'haushalt', icon: '🧻', name: 'Haushalt & Drogerie' },
  { id: 'sonstiges', icon: '🛍️', name: 'Sonstiges' },
];
const CAT_RULES = [ // erste Regel, die passt, gewinnt
  ['haushalt', /papier|spül|waschmittel|müllbeutel|müllsack|seife|shampoo|zahnpasta|zahnbürste|windel|taschentuch|batterie|küchenrolle|alufolie|frischhaltefolie|schwamm|reiniger|duschgel|deo\b|tabs\b/],
  ['obst', /^(zitronen|limetten|orangen)saft/],
  ['gewuerze', /brühe|bouillon|salz|pfeffer|curry|paprikapulver|zimt|kreuzkümmel|kurkuma|gewürz|muskat|lorbeer|oregano|chiliflocken|chilipulver|vanille|öl\b|essig|senf|ketchup|mayo|tabasco|wasabi/],
  ['konserven', /tomatenmark|passierte|gehackte tomaten|dosentomaten|tomatensauce|tomatensoße|kokosmilch|kichererbse|bohnen|\bmais\b|dose|konserve|thunfisch|sauerkraut|(^|s)oliven(s|$)|kapern|pesto|sauce|soße|sosse|sojasauce|gewürzgurke|ajvar|marmelade/],
  ['tk', /tiefkühl|\btk\b|tk-|pommes|eiscreme|\beis\b|gefroren|fischstäbchen/],
  ['getraenke', /mineralwasser|sprudel|saft|wein\b|bier\b|limo|cola|\btee\b|kaffee|hafermilch|sojamilch|mandelmilch|reismilch|drink|schorle|smoothie|sekt|prosecco|tonic|energy/],
  ['brot', /brot|brötchen|toast|baguette|tortilla|wrap|fladen|semmel|pita|croissant|burger.?bun|blätterteig|pizzateig|hefeteig|knäcke|laugen|brezel/],
  ['fisch', /lachs|forelle|garnele|shrimp|fisch|kabeljau|seelachs|scholle|dorade|meeresfrüchte|muschel|tintenfisch|sardine|hering|makrele/],
  ['fleisch', /hack|fleisch|hähnchen|hühn|huhn|pute|truthahn|rind|schwein|steak|schnitzel|speck|schinken|wurst|würstchen|salami|bacon|lamm|gulasch|filet|keule|ente|kassler|leberkäs/],
  ['trocken', /nudel|spaghetti|pasta|penne|fusilli|tagliatelle|lasagne|reis\b|couscous|bulgur|haferflocken|müsli|quinoa|linsen|polenta|spätzle|gnocchi|cornflakes|grieß|graupen/],
  ['backen', /mehl|zucker|backpulver|\bhefe\b|natron|stärke|schokolade|kakao|nüsse|nuss|mandeln|rosinen|nutella|honig|sirup|gelatine|walnuss|haselnuss|kekse|chips|gummibär|süßigkeit|streusel|puderzucker/],
  ['milch', /milch|sahne|butter|käse|joghurt|quark|\beier?\b|eigelb|eiweiß|schmand|crème|creme|mozzarella|parmesan|feta|skyr|margarine|mascarpone|ricotta|gouda|emmentaler|halloumi|kefir|pudding/],
  ['obst', /tomat|zwiebel|knoblauch|kartoffel|karotte|möhre|paprika|gurke|salat|spinat|zucchini|aubergine|brokkoli|kohl|lauch|pilz|champignon|apfel|äpfel|banane|birne|orange|zitrone|limette|beere|trauben|avocado|mango|ingwer|sellerie|kürbis|erbsen|rote bete|fenchel|radies|rucola|basilikum|petersilie|dill|schnittlauch|koriander|minze|thymian|rosmarin|salbei|kräuter|gemüse|obst|pfirsich|kiwi|melone|ananas|kirsch|pflaume|zwetschge|rhabarber|spargel|chili|mangold|pak choi|sprossen|zitronengras/],
];
const catOf = name => { const n = name.toLowerCase(); return (CAT_RULES.find(([, re]) => re.test(n)) || ['sonstiges'])[0]; };

function shopping(p) {
  const map = new Map();
  p.dishes.forEach(d => {
    const r = recipe(d.rid); if (!r) return;
    const f = d.portions / (r.portions || 1);
    r.ingredients.filter(i => !i.home).forEach(i => {
      const k = ingKey(i), e = map.get(k) || { key: k, name: i.name, unit: i.unit, amount: null };
      if (i.amount !== null) e.amount = (e.amount || 0) + i.amount * f;
      map.set(k, e);
    });
  });
  const extras = (p.extras || []).map(x => ({ key: 'x:' + x.id, id: x.id, name: x.name, unit: x.unit, amount: x.amount, extra: true }));
  const idx = id => CATS.findIndex(c => c.id === id);
  return [...map.values(), ...extras].map(i => ({ ...i, cat: catOf(i.name) }))
    .sort((a, b) => idx(a.cat) - idx(b.cat) || a.name.localeCompare(b.name, 'de'));
}
const openCount = p => { const items = shopping(p); return [items.filter(i => !p.checked?.[i.key]).length, items.length]; };

/* ---------- Bewertung (0–5, halbe Sterne) ---------- */
const stars = (v = 0, id = '') => `<span class="stars ${id ? 'big' : ''}">${[1, 2, 3, 4, 5].map(i => {
  const f = Math.max(0, Math.min(1, v - (i - 1)));
  return `<span class="star" style="--f:${f * 100}%">★${id ? `<b data-a="rate" data-id="${id}" data-v="${i - 0.5}"></b><b data-a="rate" data-id="${id}" data-v="${i}"></b>` : ''}</span>`;
}).join('')}</span>`;
const ratingTxt = v => v ? '<span class="muted small">' + fmtAmount(v) + '</span>' : '';

/* ---------- Rendering ---------- */
const TABS = [['plans', 'calendar', 'Pläne'], ['recipes', 'book', 'Rezepte'], ['shop', 'cart', 'Einkaufen']];
function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === view.tab));
  $('#syncDot').className = cfg.lastSync ? 'ok' : '';
  const m = $('#main');
  if (view.tab === 'plans') m.innerHTML = view.planId && plan(view.planId) ? planView(plan(view.planId)) : plansList();
  else if (view.tab === 'shop') m.innerHTML = shopView();
  else if (view.tab === 'recipes') m.innerHTML = recipesView();
  else m.innerHTML = settingsView();
}
const searchBox = (id, ph, v) => `<div class="search">${ic('search')}<input id="${id}" type="search" placeholder="${ph}" value="${esc(v)}" autocomplete="off" enterkeyhint="search">
  ${v ? `<button class="ib sm" data-a="clearQ" data-id="${id}" aria-label="Suche leeren">${ic('x')}</button>` : ''}</div>`;
const searchHint = v => v.trim() ? '<div class="hint" style="margin:-4px 0 10px">Tipp: „-Nuss“ schließt Treffer mit Nuss aus.</div>' : '';
const emptyState = (icon, text, btn = '') => `<div class="empty">${ic(icon)}<p>${text}</p>${btn}</div>`;

/* Suche in Plänen: Planname, Gerichte, Zutaten, Tags; mit -Wort ausschließen */
function planHits(p, q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const rs = p.dishes.map(d => recipe(d.rid)).filter(Boolean);
  const hayOf = r => (r.title + ' ' + r.tags.join(' ') + ' ' + r.ingredients.map(i => i.name).join(' ')).toLowerCase();
  const name = p.name.toLowerCase(), all = name + ' ' + rs.map(hayOf).join(' ');
  const ok = terms.every(t => t.startsWith('-') ? t.length < 2 || !all.includes(t.slice(1)) : all.includes(t));
  if (!ok) return null;
  const pos = terms.filter(t => !t.startsWith('-'));
  return rs.filter(r => pos.some(t => hayOf(r).includes(t))).map(r => r.title);
}

function plansList() {
  const q = view.pq || '';
  let ps = sortedPlans();
  const hits = new Map();
  if (q.trim()) ps = ps.filter(p => { const h = planHits(p, q); if (h) hits.set(p.id, h); return !!h; });
  const card = p => {
    const titles = p.dishes.map(d => recipe(d.rid)?.title).filter(Boolean), h = hits.get(p.id) || [];
    const cooked = p.dishes.filter(d => d.done).length, [open, total] = openCount(p);
    const meta = [`${titles.length} ${titles.length === 1 ? 'Gericht' : 'Gerichte'}`];
    if (cooked) meta.push(`${cooked} gekocht`);
    if (total) meta.push(open ? `${open} einzukaufen` : 'eingekauft');
    return `<article class="card click ${p.pinned ? 'pinned' : ''}" data-a="openPlan" data-id="${p.id}">
      <div class="card-h"><h3>${esc(p.name)}</h3>${p.pinned ? `<span class="tag accent">${ic('pin')}Angepinnt</span>` : ''}</div>
      <div class="meta">${meta.join(' · ')}</div>
      <div class="muted small" style="margin-top:6px">${titles.length ? esc(titles.join(' · ')) : 'Noch keine Gerichte – tippen, um welche hinzuzufügen'}</div>
      ${q.trim() && h.length ? `<div class="small" style="color:var(--green);margin-top:6px">Treffer: ${esc([...new Set(h)].join(', '))}</div>` : ''}</article>`;
  };
  return `<div class="page-h"><h2>Wochenpläne</h2><button class="btn" data-a="newPlan">${ic('plus')}Neuer Plan</button></div>
    ${livePlans().length > 2 || q ? searchBox('pq', 'Pläne durchsuchen', q) + searchHint(q) : ''}
    ${ps.length ? ps.map(card).join('')
      : q.trim() ? emptyState('search', `Kein Plan passt zu „${esc(q)}“.`)
        : emptyState('calendar', `Noch kein Wochenplan.<br>Ein Plan hat ${MIN_DISHES} bis ${MAX_DISHES} Gerichte – die Einkaufsliste entsteht daraus automatisch.`, `<button class="btn" data-a="newPlan">${ic('plus')}Ersten Plan anlegen</button>`)}`;
}

const dishDots = n => `<span class="dots" aria-hidden="true">${Array.from({ length: MAX_DISHES }, (_, i) => `<i class="${i < n ? 'on' : ''} ${i >= MIN_DISHES ? 'opt' : ''}"></i>`).join('')}</span>`;

function planView(p) {
  const n = p.dishes.length, cooked = p.dishes.filter(d => d.done).length, [open, total] = openCount(p);
  const missing = MIN_DISHES - n;
  const status = n < MIN_DISHES ? `Noch ${missing} ${missing === 1 ? 'Gericht' : 'Gerichte'} bis zum Minimum`
    : n < MAX_DISHES ? `Vollständig · noch ${MAX_DISHES - n} möglich` : 'Plan ist voll';
  const dish = (d, i) => {
    const r = recipe(d.rid); if (!r) return '';
    return `<div class="card click dish ${d.done ? 'done' : ''}" data-a="showDish" data-i="${i}">
      <button class="tick ${d.done ? 'on' : ''}" data-a="togDish" data-i="${i}" aria-pressed="${!!d.done}" aria-label="${d.done ? 'Als nicht gekocht markieren' : 'Als gekocht markieren'}">${d.done ? ic('check') : i + 1}</button>
      <div class="grow"><div class="t">${esc(r.title)}</div><div class="row muted small" style="gap:8px">${d.portions} Portionen${r.rating ? stars(r.rating) : ''}</div></div>${ic('chev', 'chev')}</div>`;
  };
  return `<div class="bar"><button class="back" data-a="backPlans">${ic('back')}Pläne</button><button class="ib" data-a="planMenu" aria-label="Mehr Optionen">${ic('more')}</button></div>
    <div class="page-h col"><h2>${esc(p.name)}</h2>
      <div class="row wrap small muted" style="row-gap:4px">${dishDots(n)}<span>${status}</span></div></div>
    ${cooked ? `<div class="note ok">${cooked} von ${n} Gerichten gekocht${cooked === n ? ' – alles geschafft 🎉' : ''}</div>` : ''}
    ${p.dishes.map(dish).join('')}
    <button class="btn ${n ? 'soft' : ''} wide" data-a="addDish" ${n >= MAX_DISHES ? 'disabled' : ''}>${ic('plus')}Gericht hinzufügen</button>
    ${total ? `<div class="card click link" data-a="openShop" data-id="${p.id}"><span class="lic">${ic('cart')}</span>
      <div class="grow"><b>Einkaufsliste</b><div class="muted small">${open ? `${open} von ${total} Artikeln offen` : 'Alles eingekauft ✓'}</div></div>${ic('chev', 'chev')}</div>` : ''}`;
}

/* ---------- Einkaufen ---------- */
function shopView() {
  const ps = sortedPlans();
  if (!ps.length) return `<div class="page-h"><h2>Einkaufen</h2></div>` +
    emptyState('cart', 'Noch kein Wochenplan.<br>Lege einen an – die Einkaufsliste entsteht daraus automatisch.', `<button class="btn" data-a="newPlan">${ic('plus')}Neuer Plan</button>`);
  const p = plan(view.shopId) || ps[0]; view.shopId = p.id;
  const items = shopping(p), done = items.filter(i => p.checked?.[i.key]).length;
  const pick = ps.length > 1 ? `<select id="shopSel" class="sel" aria-label="Plan wählen">${ps.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`
    : `<span class="muted small">${esc(p.name)}</span>`;
  return `<div class="page-h"><h2>Einkaufen</h2>${pick}</div>
    ${items.length ? `<div class="prog"><div class="row between small"><span class="${done === items.length ? '' : 'muted'}" style="${done === items.length ? 'color:var(--green);font-weight:600' : ''}">${done === items.length ? 'Alles eingekauft 🎉' : `${items.length - done} von ${items.length} offen`}</span>
      ${done ? '<button class="lnk" data-a="clearChecks">Haken zurücksetzen</button>' : ''}</div>
      <div class="meter"><b style="width:${done / items.length * 100}%"></b></div></div>` : ''}
    <div class="add"><input id="xIn" placeholder="Artikel hinzufügen, z. B. 2 Pck Kaffee" autocomplete="off" enterkeyhint="done" aria-label="Eigenen Artikel hinzufügen"><button class="btn" data-a="addExtra" aria-label="Hinzufügen">${ic('plus')}</button></div>
    ${shoppingList(items, p) || `<div class="empty">${ic('cart')}<p>Noch nichts einzukaufen.<br>Füge dem Plan Gerichte hinzu oder trage oben eigene Artikel ein.</p><button class="btn soft" data-a="openPlan" data-id="${p.id}">Zum Plan</button></div>`}
    ${items.length ? `<div class="row wrap" style="margin-top:18px"><button class="btn soft" data-a="shareList">${ic('share')}Liste teilen</button></div>` : ''}`;
}
/* Einkaufsliste: oben der Block „Daheim nachsehen“ (unsichere Artikel), darunter die Kategorien */
const isUnsure = (p, i) => !p.checked?.[i.key] && !!p.unsure?.[i.key];
function shoppingList(items, p) {
  if (!items.length) return '';
  const row = i => { const c = !!p.checked?.[i.key]; return `<li><label class="item ${c ? 'done' : ''}"><input type="checkbox" data-a="check" data-k="${esc(i.key)}" ${c ? 'checked' : ''}>
    <span class="box">${ic('check')}</span><span class="nm">${esc(i.name)}</span><span class="amt">${esc(amtTxt(i.amount, i.unit))}</span></label>
    ${c ? '' : `<button class="ib sm ask" data-a="unsure" data-k="${esc(i.key)}" aria-label="Daheim nachsehen" title="Daheim nachsehen">${ic('help')}</button>`}
    ${i.extra ? `<button class="ib sm" data-a="delExtra" data-id="${i.id}" aria-label="Artikel entfernen">${ic('x')}</button>` : ''}</li>`; };
  const unsureRow = i => { const c = CATS.find(x => x.id === i.cat); return `<li class="unsure-row"><span class="cat-ic" title="${esc(c.name)}">${c.icon}</span><span class="nm grow">${esc(i.name)}</span><span class="amt">${esc(amtTxt(i.amount, i.unit))}</span>
    <button class="btn sm soft green" data-a="haveIt" data-k="${esc(i.key)}" title="Ist daheim – kommt von der Liste">${ic('check')}Hab ich</button>
    <button class="ib sm" data-a="needIt" data-k="${esc(i.key)}" aria-label="Brauche ich – zurück auf die Liste" title="Brauche ich – zurück auf die Liste">${ic('undo')}</button></li>`; };
  const unsure = items.filter(i => isUnsure(p, i)), rest = items.filter(i => !isUnsure(p, i));
  const top = unsure.length ? `<div class="cat unsure"><div class="cat-h"><span>${ic('help')} Daheim nachsehen</span><span>${unsure.length}</span></div>
    <ul class="list">${unsure.map(unsureRow).join('')}</ul><div class="hint" style="margin:4px 2px 0">Vor dem Einkauf prüfen: „Hab ich“ streicht den Artikel, der Pfeil legt ihn zurück auf die Liste.</div></div>` : '';
  return top + CATS.map(c => [c, rest.filter(i => i.cat === c.id)]).filter(([, l]) => l.length).map(([c, l]) => `<div class="cat">
    <div class="cat-h"><span>${c.icon} ${c.name}</span><span>${l.filter(i => p.checked?.[i.key]).length}/${l.length}</span></div>
    <ul class="list">${l.map(row).join('')}</ul></div>`).join('');
}

/* ---------- Rezepte ---------- */
function allTags() { return [...new Set(liveRecipes().flatMap(r => r.tags))].sort((a, b) => a.localeCompare(b, 'de')); }
/* Tags mit Häufigkeit, meistgenutzte zuerst */
function tagCounts() {
  const m = new Map(); liveRecipes().forEach(r => r.tags.forEach(t => m.set(t, (m.get(t) || 0) + 1)));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
}
const TOP_TAGS = 7;
/* Filterzeile: die häufigsten Tags als Chips, der gewählte immer vorne, Rest hinter „Alle Tags“ */
function tagChips(active, action, sheet) {
  const all = tagCounts().map(([t]) => t);
  let show = all.slice(0, TOP_TAGS);
  if (active && !show.includes(active)) show = [active, ...show.slice(0, TOP_TAGS - 1)];
  const chips = show.map(t => `<button class="chip ${active === t ? 'on' : ''}" data-a="${action}" data-t="${esc(t)}" aria-pressed="${active === t}">${esc(t)}</button>`);
  if (all.length > show.length) chips.push(`<button class="chip" data-a="${sheet}">Alle Tags${ic('chev')}</button>`);
  return chips.join('');
}
function tagSheet(active, action, back) {
  const body = q => tagCounts().filter(([t]) => !q || t.toLowerCase().includes(q.toLowerCase()))
    .map(([t, n]) => `<button data-a="${action}" data-t="${esc(t)}" class="${active === t ? 'on' : ''}">${active === t ? ic('check') : '<span class="ic"></span>'}<span class="grow">${esc(t)}</span><span class="muted small">${n}</span></button>`).join('')
    || '<p class="muted small" style="padding:10px 0">Kein Tag passt.</p>';
  openDlg('Alle Tags', `${searchBox('tagQ', 'Tag suchen', '')}
    ${active ? `<button class="btn ghost sm" data-a="${action}" data-t="${esc(active)}" style="margin-bottom:6px">${ic('x')}Filter „${esc(active)}“ entfernen</button>` : ''}
    <div class="menu" id="tagList">${body('')}</div>`, true);
  if (back) dlg.querySelector('[data-a=close]').dataset.a = back; // zurück zum Picker statt alles schließen
  $('#tagQ').addEventListener('input', e => { $('#tagList').innerHTML = body(e.target.value.trim()); });
  $('#tagQ').focus();
}
function matches(r, q, tag) {
  if (tag && !r.tags.includes(tag)) return false;
  const hay = (r.title + ' ' + r.tags.join(' ') + ' ' + r.ingredients.map(i => i.name).join(' ')).toLowerCase();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every(t => t.startsWith('-') ? t.length < 2 || !hay.includes(t.slice(1)) : hay.includes(t));
}
function recipesView() {
  const byRating = view.sort === 'rating';
  const list = liveRecipes().filter(r => matches(r, view.q, view.tag))
    .sort((a, b) => byRating ? (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title, 'de') : a.title.localeCompare(b.title, 'de'));
  const filtered = view.q.trim() || view.tag;
  const total = liveRecipes().length;
  return `<div class="page-h"><h2>Rezepte <span class="cnt" title="${total} Rezepte">${total}</span></h2><button class="btn" data-a="editRecipe">${ic('plus')}Neu</button></div>
    ${searchBox('q', 'Titel, Zutat oder Tag suchen', view.q)}${searchHint(view.q)}
    <div class="chips scroll"><button class="chip sep ${byRating ? 'on' : ''}" data-a="sort" data-s="${byRating ? 'az' : 'rating'}" aria-pressed="${byRating}">${ic('star')}Beste zuerst</button>
      ${tagChips(view.tag, 'tag', 'tagSheet')}</div>
    ${filtered ? `<div class="count">${list.length} von ${total} ${total === 1 ? 'Rezept' : 'Rezepten'}</div>` : ''}
    ${list.length ? list.map(r => `<article class="card click" data-a="showRecipe" data-id="${r.id}"><h3>${esc(r.title)}</h3>
      <div class="row" style="margin-top:6px;gap:8px">${stars(r.rating)}<span class="muted small">${r.rating ? `<b>${fmtAmount(r.rating)}</b> von 5` : 'Noch nicht bewertet'}</span></div>${tagsHtml(r, 3, view.tag)}</article>`).join('')
      : emptyState('search', filtered ? 'Kein Rezept passt zu den Filtern.' : 'Noch keine Rezepte.', filtered ? `<button class="btn ghost" data-a="resetFilters">Filter zurücksetzen</button>` : `<button class="btn" data-a="editRecipe">${ic('plus')}Erstes Rezept anlegen</button>`)}`;
}

function settingsView() {
  const redirect = location.origin;
  return `<div class="bar"><button class="back" data-a="settingsBack">${ic('back')}Zurück</button></div>
    <div class="page-h"><h2>Einstellungen</h2></div>
    <div class="card"><h3>Google Drive</h3>
      <p class="status" style="margin:6px 0 0"><i class="${cfg.lastSync ? 'ok' : ''}"></i>${cfg.lastSync ? 'Zuletzt synchronisiert: ' + new Date(cfg.lastSync).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : cfg.clientId ? 'Noch nicht synchronisiert' : 'Nicht eingerichtet – Daten liegen nur auf diesem Gerät'}</p>
      <label class="f" for="clientId">OAuth-Client-ID</label>
      <input id="clientId" placeholder="123456-abc.apps.googleusercontent.com" value="${esc(cfg.clientId)}" autocomplete="off">
      <div class="row wrap" style="margin-top:14px"><button class="btn" data-a="saveClient">${ic('cloud')}Speichern & synchronisieren</button></div>
      <details class="help" style="margin-top:14px"><summary>Einmalige Einrichtung</summary><ol>
        <li><b>console.cloud.google.com</b> öffnen und ein neues Projekt anlegen.</li>
        <li>„APIs & Dienste“ → „Bibliothek“ → <b>Google Drive API</b> aktivieren.</li>
        <li>„OAuth-Zustimmungsbildschirm“: Typ <i>Extern</i>, dich selbst als <i>Testnutzer</i> eintragen.</li>
        <li>„Anmeldedaten“ → „OAuth-Client-ID erstellen“ → Typ <b>Webanwendung</b>.</li>
        <li>Bei „Autorisierte JavaScript-Quellen“ eintragen: <code>${esc(redirect)}</code></li>
        <li>Die Client-ID oben einfügen und speichern.</li></ol>
        <p class="hint">Die Daten liegen in deinem privaten App-Ordner in Drive (Scope <code>drive.appdata</code>); die App kann keine anderen Dateien sehen.</p></details></div>
    <div class="card"><h3>Rezepte teilen & sichern</h3>
      <p class="muted small" style="margin-top:6px">Alle Rezepte als Datei exportieren (z. B. per Mail oder WhatsApp) oder Rezepte aus so einer Datei übernehmen.</p>
      <div class="row wrap"><button class="btn soft" data-a="exportRecipes">${ic('upload')}Exportieren</button><button class="btn soft" data-a="importRecipes">${ic('download')}Importieren</button></div>
      <input type="file" id="impFile" accept=".json,application/json" hidden></div>
    <div class="card"><h3>Komplettes Backup</h3>
      <p class="muted small" style="margin-top:6px">Rezepte, Wochenpläne und Einkaufslisten als eine JSON-Datei.</p>
      <button class="btn ghost" data-a="export">${ic('save')}Backup herunterladen</button></div>`;
}

/* ---------- Dialoge (Bottom-Sheets) ---------- */
const dlg = $('#dlg');
function openDlg(title, body, tall = false) {
  dlg.classList.toggle('tall', tall);
  dlg.innerHTML = `<div class="handle"></div><div class="dh"><h2 tabindex="-1" autofocus>${title}</h2><button class="ib" data-a="close" aria-label="Schließen">${ic('x')}</button></div><div class="db">${body}</div>`;
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('.db').scrollTop = 0;
}
const closeDlg = () => dlg.open && dlg.close();
dlg.addEventListener('click', e => { if (e.target === dlg) closeDlg(); });
function toast(t, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(t)}</span>${action ? `<button data-a="toastAct">${esc(action.label)}</button>` : ''}`;
  toast.fn = action?.fn; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}

function askText(title, label, value, cb) {
  openDlg(esc(title), `<label class="f" for="askIn">${esc(label)}</label><input id="askIn" value="${esc(value)}" autofocus enterkeyhint="done">
    <div class="foot"><button class="btn ghost" data-a="close">Abbrechen</button><button class="btn" data-a="askOk">Speichern</button></div>`);
  askText.cb = cb;
  const inp = $('#askIn'); inp.focus(); inp.select();
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') document.querySelector('[data-a=askOk]').click(); });
}
function askConfirm(title, text, okLabel, cb, onCancel) {
  openDlg(esc(title), `<p class="muted">${esc(text)}</p>
    <div class="foot"><button class="btn ghost" data-a="confirmNo">Abbrechen</button><button class="btn danger" data-a="confirmOk">${esc(okLabel)}</button></div>`);
  askConfirm.cb = cb; askConfirm.cancel = onCancel;
}
const stepsHtml = r => `<ol class="steps">${r.steps.split('\n').filter(Boolean).map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
/* Tag-Chips; mit max: nur die ersten Tags, der aktive Filter-Tag zuerst, Rest als „+n“ */
function tagsHtml(r, max = 0, first = '') {
  if (!r.tags.length) return '';
  let tags = r.tags; if (first && tags.includes(first)) tags = [first, ...tags.filter(t => t !== first)];
  const more = max && tags.length > max ? tags.length - max : 0;
  if (more) tags = tags.slice(0, max);
  return `<div class="chips" style="margin:8px 0 0">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}${more ? `<span class="tag plain">+${more}</span>` : ''}</div>`;
}

function showRecipe(id) {
  const r = recipe(id); if (!r) return;
  openDlg(esc(r.title), `${tagsHtml(r)}
    <div class="rate-box">${stars(r.rating || 0, r.id)}
      <div class="hint">${r.rating ? `${fmtAmount(r.rating)} von 5 · <button class="lnk" data-a="unrate" data-id="${r.id}" style="padding:0">Bewertung löschen</button>` : 'Tippe auf einen Stern (linke Hälfte = halber Stern)'}</div></div>
    <div class="row between" style="margin-top:8px"><h3>Zutaten</h3><span class="muted small">${r.portions} Portionen</span></div>
    <ul class="list plain">${r.ingredients.map(i => `<li><span class="grow">${i.home ? '🏠 ' : ''}${esc(i.name)}${i.home ? ' <span class="muted small">(daheim)</span>' : ''}</span><span class="amt">${esc(amtTxt(i.amount, i.unit))}</span></li>`).join('') || '<li class="muted">Keine Zutaten eingetragen</li>'}</ul>
    <h3 style="margin-top:18px">Zubereitung</h3>${r.steps.trim() ? stepsHtml(r) : '<p class="muted small">Keine Schritte eingetragen.</p>'}
    <div class="foot"><button class="btn" data-a="addToPlan" data-id="${r.id}">${ic('calendar')}In Plan</button><button class="btn ghost" data-a="editRecipe" data-id="${r.id}">${ic('edit')}Bearbeiten</button></div>
    <div class="foot" style="margin-top:10px"><button class="btn ghost" data-a="exportRecipes" data-id="${r.id}">${ic('share')}Teilen</button><button class="btn danger" data-a="delRecipe" data-id="${r.id}">${ic('trash')}Löschen</button></div>`);
}

function showDish(i) {
  const p = plan(view.planId), d = p?.dishes[i], r = d && recipe(d.rid); if (!r) return;
  const f = d.portions / (r.portions || 1);
  const toBuy = r.ingredients.filter(ing => !ing.home), home = r.ingredients.filter(ing => ing.home);
  openDlg(esc(r.title), `${tagsHtml(r)}
    ${r.rating ? `<div style="margin:4px 0 2px">${stars(r.rating)} ${ratingTxt(r.rating)}</div>` : ''}
    <div class="row between" style="margin-top:10px"><span><b>Portionen</b><div class="hint" style="margin:0">Rezept ist für ${r.portions}</div></span>
      <span class="stepper"><button class="ib" data-a="port" data-i="${i}" data-d="-1" aria-label="Weniger Portionen">${ic('minus')}</button><b>${d.portions}</b><button class="ib" data-a="port" data-i="${i}" data-d="1" aria-label="Mehr Portionen">${ic('plus')}</button></span></div>
    <div class="row between" style="margin-top:18px"><h3>Einkaufen für dieses Gericht</h3></div>
    <ul class="list">${toBuy.map(ing => { const k = ingKey(ing), c = !!p.checked?.[k]; return `<li><label class="item ${c ? 'done' : ''}">
      <input type="checkbox" data-a="check" data-k="${esc(k)}" ${c ? 'checked' : ''}><span class="box">${ic('check')}</span><span class="nm">${esc(ing.name)}${p.unsure?.[k] && !c ? ' <span class="tag plain">nachsehen</span>' : ''}</span>
      <span class="amt">${esc(amtTxt(ing.amount === null ? null : ing.amount * f, ing.unit))}</span></label></li>`; }).join('') || '<li class="muted small" style="padding:8px 0">Alles daheim – nichts einzukaufen 🎉</li>'}</ul>
    ${home.length ? `<div class="hint">🏠 Daheim: ${esc(home.map(i => i.name).join(', '))}</div>` : ''}
    <h3 style="margin-top:18px">Zubereitung</h3>${r.steps.trim() ? stepsHtml(r) : '<p class="muted small">Keine Schritte eingetragen.</p>'}
    <div class="foot"><button class="btn ghost" data-a="togDish" data-i="${i}">${ic('check')}${d.done ? 'Doch nicht gekocht' : 'Gekocht'}</button><button class="btn danger" data-a="rmDish" data-i="${i}">${ic('trash')}Aus Plan entfernen</button></div>`);
  showDish.i = i;
}

function editRecipe(id) {
  const r = id ? recipe(id) : { title: '', portions: 4, tags: [], ingredients: [], steps: '' };
  openDlg(id ? 'Rezept bearbeiten' : 'Neues Rezept', `
    <label class="f" for="eT">Titel</label><input id="eT" value="${esc(r.title)}" placeholder="z. B. Linsensuppe" autocomplete="off">
    <div class="row" style="align-items:flex-start"><div style="flex:0 0 110px"><label class="f" for="eP">Portionen</label><input id="eP" type="number" min="1" inputmode="numeric" value="${r.portions}"></div>
    <div class="grow"><label class="f" for="eG">Tags <small>durch Komma getrennt</small></label><input id="eG" value="${esc(r.tags.join(', '))}" placeholder="Vegetarisch, Schnell" autocomplete="off"></div></div>
    <div class="chips" id="eGs" style="margin:6px 0 0"></div>
    <label class="f" for="eI">Zutaten <small>eine pro Zeile, Menge zuerst – z. B. „200 g Mehl“</small></label><textarea id="eI" placeholder="500 g Spaghetti&#10;1 Stk Zwiebel&#10;2 Zehen Knoblauch">${esc(r.ingredients.filter(i => !i.home).map(ingLine).join('\n'))}</textarea>
    <label class="f" for="eH">🏠 Zutaten, die immer daheim sind <small>landen nicht auf der Einkaufsliste</small></label><textarea id="eH" style="min-height:64px" placeholder="Salz&#10;Olivenöl">${esc(r.ingredients.filter(i => i.home).map(ingLine).join('\n'))}</textarea>
    <label class="f" for="eS">Zubereitung <small>ein Schritt pro Zeile</small></label><textarea id="eS" placeholder="Zwiebel würfeln und anbraten.&#10;…">${esc(r.steps)}</textarea>
    <div class="foot"><button class="btn ghost" data-a="${id ? 'showRecipe' : 'close'}" data-id="${id || ''}">Abbrechen</button><button class="btn" data-a="saveRecipe" data-id="${id || ''}">Speichern</button></div>`);
  const sug = () => { $('#eGs').innerHTML = tagSuggestions($('#eG').value); };
  $('#eG').addEventListener('input', sug); sug();
  if (!id) $('#eT').focus();
}
/* Vorschläge für das Tag-Feld: passende vorhandene Tags zum angefangenen Wort, sonst die häufigsten */
function tagSuggestions(value) {
  const parts = value.split(','), cur = parts[parts.length - 1].trim().toLowerCase();
  const have = new Set(parts.slice(0, -1).map(t => t.trim().toLowerCase()).filter(Boolean));
  const list = tagCounts().map(([t]) => t).filter(t => !have.has(t.toLowerCase()) && (!cur || t.toLowerCase().includes(cur)) && t.toLowerCase() !== cur).slice(0, 6);
  return list.map(t => `<button type="button" class="chip" data-a="tagPick" data-t="${esc(t)}">${ic('plus')}${esc(t)}</button>`).join('');
}

/* ---------- Gericht wählen ---------- */
const pickF = { q: '', inc: '', exc: '', tag: '', shared: false, five: false, more: false };
const terms = t => t.toLowerCase().split(/[,;]+/).map(x => x.trim()).filter(Boolean);
function pickList() {
  const p = plan(view.planId); if (!p) return '';
  const count = {}; p.dishes.forEach(d => count[d.rid] = (count[d.rid] || 0) + 1);
  const hasPlan = p.dishes.length > 0, inc = terms(pickF.inc), exc = terms(pickF.exc);
  const list = liveRecipes().filter(r => {
    const names = r.ingredients.map(i => i.name.toLowerCase());
    return matches(r, pickF.q, pickF.tag) && (!pickF.five || r.rating >= 5)
      && inc.every(t => names.some(n => n.includes(t)))
      && !exc.some(t => names.some(n => n.includes(t)));
  }).map(r => ({ r, shared: hasPlan ? overlap(r, p) : [] }))
    .filter(x => !pickF.shared || x.shared.length)
    .sort((a, b) => b.shared.length - a.shared.length || a.r.title.localeCompare(b.r.title, 'de'));
  return `<div class="count">${list.length} ${list.length === 1 ? 'Rezept' : 'Rezepte'}</div>` +
    (list.map(({ r, shared }) => `<div class="card click" data-a="pick" data-id="${r.id}" style="padding:12px 14px;margin-bottom:8px">
      <div class="card-h"><b>${esc(r.title)}</b>${count[r.id] ? `<span class="tag accent">${count[r.id]}× im Plan</span>` : ''}</div>
      ${r.rating ? `<div style="margin-top:3px">${stars(r.rating)}</div>` : ''}${tagsHtml(r, 3, pickF.tag)}
      ${shared.length ? `<div class="small" style="color:var(--green);margin-top:4px">${shared.length} gemeinsame Zutat${shared.length === 1 ? '' : 'en'}: ${esc(shared.join(', '))}</div>` : ''}</div>`).join('')
      || emptyState('search', 'Kein Rezept passt zu den Filtern.'));
}
function pickFilters() {
  const p = plan(view.planId);
  return `<button class="chip ${pickF.five ? 'on' : ''}" data-a="pickFive" aria-pressed="${pickF.five}">${ic('star')}Nur 5 Sterne</button>
    ${p.dishes.length ? `<button class="chip ${pickF.shared ? 'on' : ''}" data-a="pickShared" aria-pressed="${pickF.shared}">${ic('leaf')}Gemeinsame Zutaten</button>` : ''}
    <button class="chip ${pickF.more ? 'on' : ''}" data-a="pickMore" aria-pressed="${pickF.more}">${ic('filter')}Nach Zutat</button>`;
}
const pickTags = () => tagChips(pickF.tag, 'pickTag', 'pickTagSheet');
function addDishPicker(keep = false) {
  const p = plan(view.planId); if (!p) return;
  if (!keep) Object.assign(pickF, { q: '', inc: '', exc: '', tag: '', shared: false, five: false, more: false });
  openDlg('Gericht wählen', `${searchBox('pickQ', 'Titel, Zutat oder Tag suchen', pickF.q)}
    <div class="chips scroll" id="pickFilters" style="margin-top:0">${pickFilters()}</div>
    <div id="pickMore" class="row" ${pickF.more ? '' : 'hidden'} style="margin:0 0 8px"><input id="pickInc" placeholder="Mit Zutat …" autocomplete="off" value="${esc(pickF.inc)}"><input id="pickExc" placeholder="Ohne Zutat …" autocomplete="off" value="${esc(pickF.exc)}"></div>
    <div class="chips scroll" id="pickTags" style="margin-top:0">${pickTags()}</div>
    <div id="pickList">${pickList()}</div>`, true);
  const upd = () => { $('#pickList').innerHTML = pickList(); $('#pickTags').innerHTML = pickTags(); $('#pickFilters').innerHTML = pickFilters(); $('#pickMore').hidden = !pickF.more; };
  addDishPicker.upd = upd;
  [['pickQ', 'q'], ['pickInc', 'inc'], ['pickExc', 'exc']].forEach(([id, k]) => $('#' + id).addEventListener('input', e => { pickF[k] = e.target.value; upd(); }));
}

/* ---------- Aktionen ---------- */
const actions = {
  tab(el) { view.tab = el.dataset.v; view.planId = null; render(); window.scrollTo(0, 0); },
  settings() { if (view.tab !== 'settings') view.prevTab = view.tab; view.tab = 'settings'; view.planId = null; render(); window.scrollTo(0, 0); },
  settingsBack() { view.tab = view.prevTab || 'plans'; render(); },
  close: closeDlg,
  sync() { sync(true); },
  toastAct() { $('#toast').classList.remove('show'); const fn = toast.fn; toast.fn = null; fn?.(); },
  clearQ(el) { if (el.dataset.id === 'q') view.q = ''; else view.pq = ''; render(); $('#' + el.dataset.id)?.focus(); },
  resetFilters() { view.q = ''; view.tag = ''; render(); },
  newPlan() {
    askText('Neuer Wochenplan', 'Name', 'Woche ' + new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }), name => {
      const p = { id: uid(), name: name || 'Wochenplan', dishes: [], checked: {}, updatedAt: Date.now() };
      S.plans.push(p); view.tab = 'plans'; view.planId = p.id; persist(); render(); window.scrollTo(0, 0);
    });
  },
  openPlan(el) { view.tab = 'plans'; view.planId = el.dataset.id; render(); window.scrollTo(0, 0); },
  openShop(el) { view.tab = 'shop'; view.shopId = el.dataset.id; view.planId = null; render(); window.scrollTo(0, 0); },
  backPlans() { view.planId = null; render(); },
  planMenu() {
    const p = plan(view.planId);
    openDlg(esc(p.name), `<div class="menu">
      <button data-a="pinPlan" data-id="${p.id}">${ic('pin')}${p.pinned ? 'Nicht mehr anpinnen' : 'Anpinnen – oben halten'}</button>
      <button data-a="renamePlan">${ic('edit')}Umbenennen</button>
      <button data-a="openShop" data-id="${p.id}">${ic('cart')}Einkaufsliste öffnen</button>
      <button class="danger" data-a="delPlan">${ic('trash')}Plan löschen</button></div>`);
  },
  pinPlan(el, e) {
    e.stopPropagation(); closeDlg();
    const p = plan(el.dataset.id); p.pinned = !p.pinned; p.updatedAt = Date.now(); persist(); render();
    toast(p.pinned ? 'Plan angepinnt' : 'Plan gelöst');
  },
  renamePlan() { const p = plan(view.planId); askText('Plan umbenennen', 'Name', p.name, n => { p.name = n || p.name; touch(p); }); },
  delPlan() {
    const p = plan(view.planId);
    askConfirm('Plan löschen?', `„${p.name}“ wird mit seiner Einkaufsliste gelöscht. Die Rezepte bleiben erhalten.`, 'Löschen',
      () => { p.deleted = true; touch(p); view.planId = null; render(); toast('Plan gelöscht'); });
  },
  addDish() { addDishPicker(); },
  pickTag(el) { pickF.tag = pickF.tag === el.dataset.t ? '' : el.dataset.t; if ($('#pickList')) addDishPicker.upd(); else addDishPicker(true); },
  pickTagBack() { addDishPicker(true); },
  pickFive() { pickF.five = !pickF.five; addDishPicker.upd(); },
  pickShared() { pickF.shared = !pickF.shared; addDishPicker.upd(); },
  pickMore() { pickF.more = !pickF.more; addDishPicker.upd(); if (pickF.more) $('#pickInc').focus(); },
  pick(el) {
    const p = plan(view.planId), r = recipe(el.dataset.id);
    if (p.dishes.length >= MAX_DISHES) return toast(`Maximal ${MAX_DISHES} Gerichte pro Plan`);
    p.dishes.push({ rid: r.id, portions: r.portions }); touch(p); closeDlg();
    toast(`${r.title} hinzugefügt`);
  },
  togDish(el, e) {
    e.stopPropagation(); const p = plan(view.planId), i = +el.dataset.i, d = p.dishes[i]; d.done = !d.done; touch(p);
    if (dlg.open) showDish(i);
  },
  rmDish(el, e) {
    e.stopPropagation(); const p = plan(view.planId), i = +el.dataset.i, [d] = p.dishes.splice(i, 1); closeDlg(); touch(p);
    toast('Gericht entfernt', { label: 'Rückgängig', fn: () => { p.dishes.splice(Math.min(i, p.dishes.length), 0, d); touch(p); } });
  },
  showDish(el) { showDish(+el.dataset.i); },
  port(el) {
    const p = plan(view.planId), d = p.dishes[+el.dataset.i]; d.portions = Math.max(1, d.portions + +el.dataset.d);
    touch(p); showDish(+el.dataset.i);
  },
  check(el) {
    const p = shopPlan(); if (!p) return; p.checked = p.checked || {};
    if (el.checked) { p.checked[el.dataset.k] = true; delete p.unsure?.[el.dataset.k]; } else delete p.checked[el.dataset.k];
    touch(p); if (dlg.open && showDish.i !== undefined && dlg.querySelector('.stepper')) showDish(showDish.i);
  },
  addExtra() {
    const inp = $('#xIn'), v = inp.value.trim(); if (!v) return inp.focus();
    const p = shopPlan(), x = parseIngredient(v); if (!p || !x.name) return;
    (p.extras = p.extras || []).push({ id: uid(), ...x }); touch(p); $('#xIn').focus();
  },
  delExtra(el) { const p = shopPlan(); p.extras = p.extras.filter(x => x.id !== el.dataset.id); touch(p); },
  async shareList() {
    const p = shopPlan();
    const open = shopping(p).filter(i => !p.checked?.[i.key]), line = i => '☐ ' + [fmtAmount(i.amount), i.unit, i.name].filter(Boolean).join(' ');
    const unsure = open.filter(i => isUnsure(p, i));
    const blocks = CATS.map(c => [c, open.filter(i => i.cat === c.id && !isUnsure(p, i))]).filter(([, l]) => l.length)
      .map(([c, l]) => `${c.icon} ${c.name}\n` + l.map(line).join('\n'));
    if (unsure.length) blocks.push('❓ Daheim nachsehen\n' + unsure.map(line).join('\n'));
    const text = `🛒 Einkaufsliste – ${p.name}\n\n${blocks.join('\n\n')}`;
    if (navigator.share) { try { await navigator.share({ title: 'Einkaufsliste', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); toast('Liste in die Zwischenablage kopiert'); } catch { openDlg('Einkaufsliste', `<textarea readonly style="min-height:260px">${esc(text)}</textarea>`); }
  },
  clearChecks() { const p = shopPlan(); p.checked = {}; touch(p); },
  unsure(el) { const p = shopPlan(); (p.unsure = p.unsure || {})[el.dataset.k] = true; touch(p); },
  needIt(el) { const p = shopPlan(); delete p.unsure?.[el.dataset.k]; touch(p); },
  haveIt(el) {
    const p = shopPlan(), k = el.dataset.k; delete p.unsure?.[k]; (p.checked = p.checked || {})[k] = true; touch(p);
    toast('Als daheim markiert', { label: 'Rückgängig', fn: () => { delete p.checked[k]; (p.unsure = p.unsure || {})[k] = true; touch(p); } });
  },
  sort(el) { view.sort = el.dataset.s; render(); },
  rate(el) {
    const r = recipe(el.dataset.id), v = +el.dataset.v;
    r.rating = (r.rating === v) ? 0 : v; r.updatedAt = Date.now(); persist(); showRecipe(r.id); render();
  },
  unrate(el) { const r = recipe(el.dataset.id); r.rating = 0; r.updatedAt = Date.now(); persist(); showRecipe(r.id); render(); },
  tag(el) { view.tag = view.tag === el.dataset.t ? '' : el.dataset.t; if (dlg.open) closeDlg(); render(); },
  tagSheet() { tagSheet(view.tag, 'tag'); },
  pickTagSheet() { tagSheet(pickF.tag, 'pickTag', 'pickTagBack'); },
  tagPick(el) {
    const inp = $('#eG'), parts = inp.value.split(','); parts[parts.length - 1] = ' ' + el.dataset.t;
    inp.value = parts.map(t => t.trim()).filter(Boolean).join(', ') + ', '; inp.focus();
    $('#eGs').innerHTML = tagSuggestions(inp.value);
  },
  showRecipe(el) { showRecipe(el.dataset.id); },
  editRecipe(el) { editRecipe(el?.dataset?.id); },
  saveRecipe(el) {
    const title = $('#eT').value.trim(); if (!title) { toast('Bitte einen Titel angeben'); return $('#eT').focus(); }
    const data = {
      title, portions: Math.max(1, +$('#eP').value || 1),
      tags: $('#eG').value.split(',').map(t => t.trim()).filter(Boolean),
      ingredients: [
        ...$('#eI').value.split('\n').map(l => l.trim()).filter(Boolean).map(parseIngredient),
        ...$('#eH').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => ({ ...parseIngredient(l), home: true })),
      ].filter(i => i.name),
      steps: $('#eS').value.trim(), updatedAt: Date.now(),
    };
    const id = el.dataset.id;
    if (id) Object.assign(recipe(id), data); else S.recipes.push({ id: uid(), ...data });
    persist(); closeDlg(); render(); toast(id ? 'Rezept gespeichert' : 'Rezept angelegt');
  },
  delRecipe(el) {
    const r = recipe(el.dataset.id);
    askConfirm('Rezept löschen?', `„${r.title}“ wird auch aus allen Wochenplänen entfernt.`, 'Löschen', () => {
      r.deleted = true; r.updatedAt = Date.now();
      livePlans().forEach(p => { const n = p.dishes.length; p.dishes = p.dishes.filter(d => d.rid !== r.id); if (n !== p.dishes.length) p.updatedAt = Date.now(); });
      persist(); render(); toast('Rezept gelöscht');
    }, () => showRecipe(r.id));
  },
  addToPlan(el) {
    const r = recipe(el.dataset.id), ps = sortedPlans();
    if (!ps.length) return toast('Lege zuerst einen Wochenplan an');
    if (ps.length === 1) return actions.addToPlanId({ dataset: { id: ps[0].id, rid: r.id } });
    openDlg('In welchen Plan?', `<div class="menu">${ps.map(p => `<button data-a="addToPlanId" data-id="${p.id}" data-rid="${r.id}">${ic(p.pinned ? 'pin' : 'calendar')}<span class="grow">${esc(p.name)}</span><span class="muted small">${p.dishes.length}/${MAX_DISHES}</span></button>`).join('')}</div>`);
  },
  addToPlanId(el) {
    const p = plan(el.dataset.id), r = recipe(el.dataset.rid);
    if (p.dishes.length >= MAX_DISHES) return toast(`„${p.name}“ ist voll (${MAX_DISHES} Gerichte)`);
    p.dishes.push({ rid: r.id, portions: r.portions }); closeDlg(); touch(p);
    toast(`Zu „${p.name}“ hinzugefügt`, { label: 'Öffnen', fn: () => { view.tab = 'plans'; view.planId = p.id; render(); window.scrollTo(0, 0); } });
  },
  askOk() { const v = $('#askIn').value.trim(); closeDlg(); askText.cb(v); },
  confirmOk() { closeDlg(); askConfirm.cb(); },
  confirmNo() { closeDlg(); askConfirm.cancel?.(); },
  saveClient() { cfg.clientId = $('#clientId').value.trim(); saveCfg(); if (cfg.clientId) sync(true); else { render(); toast('Client-ID entfernt'); } },
  async exportRecipes(el) {
    const one = el?.dataset?.id && recipe(el.dataset.id);
    const list = one ? [one] : liveRecipes();
    if (!list.length) return toast('Keine Rezepte zum Exportieren');
    const json = JSON.stringify({ type: 'rezeptbuch-rezepte', version: 1, exported: new Date().toISOString(), recipes: list }, null, 1);
    const name = one ? one.title.replace(/[^\wäöüÄÖÜß -]+/g, '').trim().replace(/\s+/g, '-') + '.json' : 'rezepte-' + new Date().toISOString().slice(0, 10) + '.json';
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: one ? one.title : 'Rezepte' }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(list.length + ' Rezept' + (list.length === 1 ? '' : 'e') + ' exportiert');
  },
  importRecipes() { $('#impFile')?.click(); },
  export() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }));
    a.download = 'rezeptbuch-backup.json'; a.click();
  },
};
function touch(p) { p.updatedAt = Date.now(); persist(); render(); }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.a]; if (fn) fn(el, e);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'xIn') { e.preventDefault(); actions.addExtra(); } });
function cleanRecipe(x) {
  if (!x || typeof x.title !== 'string' || !x.title.trim()) return null;
  const rating = Math.min(5, Math.max(0, Math.round((+x.rating || 0) * 2) / 2));
  return {
    id: typeof x.id === 'string' && x.id ? x.id : uid(), title: x.title.trim().slice(0, 200),
    portions: Math.max(1, Math.round(+x.portions) || 1),
    tags: (Array.isArray(x.tags) ? x.tags : []).map(t => String(t).trim()).filter(Boolean),
    steps: Array.isArray(x.steps) ? x.steps.map(String).join('\n') : String(x.steps || ''),
    rating,
    ingredients: (Array.isArray(x.ingredients) ? x.ingredients : []).map(i => typeof i === 'string' ? parseIngredient(i)
      : { amount: i && i.amount != null && i.amount !== '' ? parseAmount(String(i.amount)) : null, unit: String(i?.unit || ''), name: String(i?.name || ''), ...(i?.home ? { home: true } : {}) })
      .filter(i => i.name.trim()),
    updatedAt: +x.updatedAt || Date.now(),
  };
}
function importRecipeData(data) {
  const raw = Array.isArray(data) ? data : data?.recipes;
  if (!Array.isArray(raw)) return toast('Keine gültige Rezept-Datei');
  let added = 0, updated = 0, same_ = 0, invalid = 0;
  raw.forEach(x => {
    const r = cleanRecipe(x); if (!r) { invalid++; return; }
    r.updatedAt = Date.now(); // Import ist eine bewusste Aktion und gewinnt auch gegen Lösch-Marker
    const same = S.recipes.find(o => o.id === r.id);
    if (same && same.deleted) { Object.assign(same, r, { deleted: false }); added++; return; }
    if (same) { same_++; return; }
    if (liveRecipes().some(o => o.title.toLowerCase() === r.title.toLowerCase())) { same_++; return; }
    S.recipes.push(r); added++;
  });
  if (added) persist();
  render();
  const parts = [`${added} importiert`];
  if (same_) parts.push(`${same_} bereits vorhanden`);
  if (invalid) parts.push(`${invalid} ungültig`);
  toast(parts.join(', '));
}
document.addEventListener('change', async e => {
  if (e.target.id === 'impFile') {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { importRecipeData(JSON.parse(await f.text())); } catch { toast('Datei konnte nicht gelesen werden'); }
    return;
  }
  if (e.target.id === 'shopSel') { view.shopId = e.target.value; render(); return; }
  if (e.target.dataset?.a === 'check') actions.check(e.target);
});
document.addEventListener('input', e => {
  const map = { pq: 'pq', q: 'q' }, k = map[e.target.id]; if (!k) return;
  view[k] = e.target.value; const pos = e.target.selectionStart; render();
  const inp = $('#' + e.target.id); inp.focus(); inp.setSelectionRange(pos, pos);
});

/* ---------- Google Drive Sync ---------- */
const FILE = 'rezeptbuch.json', SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
let token = null, tokenExp = 0, syncing = false, timer;

function loadGis() {
  return new Promise((res, rej) => {
    if (window.google?.accounts?.oauth2) return res();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client';
    s.onload = res; s.onerror = () => rej(new Error('Google-Skript nicht erreichbar (offline?)')); document.head.appendChild(s);
  });
}
async function getToken(interactive) {
  if (token && Date.now() < tokenExp - 60000) return token;
  await loadGis();
  return new Promise((res, rej) => {
    google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId, scope: SCOPE,
      callback: r => { if (r.error) return rej(new Error(r.error)); token = r.access_token; tokenExp = Date.now() + r.expires_in * 1000; res(token); },
      error_callback: e => rej(new Error(e.type || 'Anmeldung abgebrochen')),
    }).requestAccessToken({ prompt: interactive && !cfg.lastSync ? 'consent' : '' });
  });
}
const api = (path, opt = {}) => fetch('https://www.googleapis.com/' + path, { ...opt, headers: { Authorization: 'Bearer ' + token, ...opt.headers } })
  .then(r => { if (!r.ok) throw new Error('Drive-Fehler ' + r.status); return r; });

function merge(local, remote) {
  const out = {};
  for (const k of ['recipes', 'plans']) {
    const m = new Map((local[k] || []).map(x => [x.id, x]));
    (remote[k] || []).forEach(x => { const l = m.get(x.id); if (!l || (x.updatedAt || 0) > (l.updatedAt || 0)) m.set(x.id, x); });
    out[k] = [...m.values()];
  }
  return out;
}

async function sync(interactive) {
  if (syncing) return;
  if (!cfg.clientId) { if (interactive) { actions.settings(); toast('Bitte zuerst die Client-ID eintragen'); } return; }
  syncing = true; setBusy(true);
  try {
    await getToken(interactive);
    const q = encodeURIComponent(`name='${FILE}'`);
    const list = await (await api(`drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`)).json();
    let fileId = list.files[0]?.id;
    if (fileId) {
      const remote = await (await api(`drive/v3/files/${fileId}?alt=media`)).json();
      const m = merge(S, remote); S.recipes = m.recipes; S.plans = m.plans;
      localStorage.setItem(KEY, JSON.stringify(S));
    }
    const body = JSON.stringify(S);
    if (fileId) await api(`upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    else {
      const b = '-----rb' + uid();
      await api('upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b },
        body: `--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: FILE, parents: ['appDataFolder'] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`,
      });
    }
    cfg.lastSync = Date.now(); saveCfg();
    if (interactive) toast('Mit Google Drive synchronisiert');
    if (view.planId && !plan(view.planId)) view.planId = null;
    if (!dlg.open) render();
  } catch (err) {
    toast('Sync fehlgeschlagen: ' + err.message);
  } finally { syncing = false; setBusy(false); }
}
function setBusy(b) { $('#syncBtn').classList.toggle('busy', b); }
function scheduleSync() {
  clearTimeout(timer);
  if (cfg.clientId && token && Date.now() < tokenExp - 60000) timer = setTimeout(() => sync(false), 3000);
}

/* ---------- Start ---------- */
$('.brand').innerHTML = ic('pot') + '<span>Rezeptbuch</span>';
$('.top-actions').innerHTML = `<button class="ib" id="syncBtn" data-a="sync" aria-label="Mit Google Drive abgleichen" title="Mit Google Drive abgleichen">${ic('cloud')}<i id="syncDot"></i></button>
  <button class="ib" data-a="settings" aria-label="Einstellungen" title="Einstellungen">${ic('gear')}</button>`;
$('.tabs').innerHTML = TABS.map(([v, i, l]) => `<button data-a="tab" data-v="${v}">${ic(i)}<span>${l}</span></button>`).join('');
render();
if (new URLSearchParams(location.search).get('import')) { // per "Teilen" an die App geschickte Datei
  view.tab = 'recipes'; render();
  history.replaceState(null, '', location.pathname);
  caches.open('rezeptbuch-share').then(async c => {
    const r = await c.match('shared'); if (!r) return toast('Keine Datei empfangen');
    await c.delete('shared');
    try { importRecipeData(JSON.parse(await r.text())); } catch { toast('Datei konnte nicht gelesen werden'); }
  }).catch(() => toast('Import fehlgeschlagen'));
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
