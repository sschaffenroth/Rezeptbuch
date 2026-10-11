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
const view = { tab: 'plans', planId: null, q: '', tag: '' };

function persist() {
  localStorage.setItem(KEY, JSON.stringify(S));
  scheduleSync();
}
function saveCfg() { localStorage.setItem(CFG, JSON.stringify(cfg)); }
const liveRecipes = () => S.recipes.filter(r => !r.deleted);
const livePlans = () => S.plans.filter(p => !p.deleted);
const recipe = id => S.recipes.find(r => r.id === id && !r.deleted);
const plan = id => S.plans.find(p => p.id === id && !p.deleted);

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

/* ---------- Bewertung (0–5, halbe Sterne) ---------- */
const stars = (v = 0, id = '') => `<span class="stars ${id ? 'big' : ''}">${[1, 2, 3, 4, 5].map(i => {
  const f = Math.max(0, Math.min(1, v - (i - 1)));
  return `<span class="star" style="--f:${f * 100}%">★${id ? `<b data-a="rate" data-id="${id}" data-v="${i - 0.5}"></b><b data-a="rate" data-id="${id}" data-v="${i}"></b>` : ''}</span>`;
}).join('')}</span>`;
const ratingTxt = v => v ? '<span class="muted small">' + fmtAmount(v) + '</span>' : '';

/* ---------- Rendering ---------- */
function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === view.tab));
  const m = $('#main');
  if (view.tab === 'plans') m.innerHTML = view.planId && plan(view.planId) ? planView(plan(view.planId)) : plansList();
  else if (view.tab === 'recipes') m.innerHTML = recipesView();
  else m.innerHTML = settingsView();
}

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
  let ps = livePlans().sort((a, b) => !!b.pinned - !!a.pinned || b.updatedAt - a.updatedAt);
  const hits = new Map();
  if (q.trim()) ps = ps.filter(p => { const h = planHits(p, q); if (h) hits.set(p.id, h); return !!h; });
  return `<div class="sec"><h2>Wochenpläne</h2><button class="btn" data-a="newPlan">+ Neuer Plan</button></div>
    <input id="pq" type="search" placeholder="Pläne durchsuchen: Name, Gericht, Zutat, Tag … (-Nuss schließt aus)" value="${esc(q)}" style="margin-bottom:14px">` +
    (ps.length ? ps.map(p => {
      const titles = p.dishes.map(d => recipe(d.rid)?.title).filter(Boolean), h = hits.get(p.id) || [];
      return `<div class="card click ${p.pinned ? 'pinned' : ''}" data-a="openPlan" data-id="${p.id}">
        <div class="row between"><h3>${p.pinned ? '📌 ' : ''}${esc(p.name)}</h3><span class="row" style="gap:8px"><span class="chip static">${p.dishes.length} / ${MAX_DISHES} Gerichte</span><button class="icon pin ${p.pinned ? 'on' : ''}" data-a="pinPlan" data-id="${p.id}" title="${p.pinned ? 'Lösen' : 'Anpinnen'}">📌</button></span></div>
        <div class="muted small">${titles.length ? esc(titles.join(' · ')) : 'Noch keine Gerichte'}</div>
        ${q.trim() && h.length ? `<div class="small" style="color:var(--green);margin-top:4px">🔍 Treffer: ${esc([...new Set(h)].join(', '))}</div>` : ''}</div>`;
    }).join('') : q.trim() ? `<div class="empty"><div class="big">🔍</div>Kein Plan passt zu „${esc(q)}“.</div>`
      : `<div class="empty"><div class="big">📅</div>Noch kein Wochenplan.<br>Lege deinen ersten an – mit ${MIN_DISHES} bis ${MAX_DISHES} Gerichten.</div>`);
}

function planView(p) {
  const n = p.dishes.length, items = shopping(p), done = items.filter(i => p.checked?.[i.key]).length;
  const cooked = p.dishes.filter(d => d.done).length;
  const status = n < MIN_DISHES ? `<div class="warn">Noch ${MIN_DISHES - n} ${MIN_DISHES - n === 1 ? 'Gericht' : 'Gerichte'} bis zum Minimum (${MIN_DISHES}).</div>`
    : `<div class="ok">${cooked ? `🍽 ${cooked} von ${n} Gerichten gekocht` : `✓ Plan vollständig – du kannst noch bis zu ${MAX_DISHES - n} Gerichte hinzufügen.`}</div>`;
  return `<button class="back" data-a="backPlans">‹ Alle Pläne</button>
    <div class="sec"><h2>${esc(p.name)}</h2>
      <div class="row"><button class="btn ${p.pinned ? '' : 'soft'} sm" data-a="pinPlan" data-id="${p.id}">📌 ${p.pinned ? 'Angepinnt' : 'Anpinnen'}</button><button class="btn soft sm" data-a="renamePlan">Umbenennen</button><button class="btn danger sm" data-a="delPlan">Löschen</button></div></div>
    ${status}
    ${p.dishes.map((d, i) => { const r = recipe(d.rid); if (!r) return ''; return `
      <div class="card click dish ${d.done ? 'done' : ''}" data-a="showDish" data-i="${i}">
        <button class="tick ${d.done ? 'on' : ''}" data-a="togDish" data-i="${i}" title="Als gekocht markieren" aria-label="Gekocht">${d.done ? '✓' : i + 1}</button>
        <div class="grow"><div class="t">${esc(r.title)}</div><div class="muted small">${d.portions} Portionen · ${r.ingredients.length} Zutaten</div></div>
        <button class="icon" data-a="rmDish" data-i="${i}" title="Entfernen">✕</button></div>`; }).join('')}
    <button class="btn soft" style="width:100%;margin-bottom:22px" data-a="addDish" ${n >= MAX_DISHES ? 'disabled' : ''}>+ Gericht hinzufügen (${n}/${MAX_DISHES})</button>
    <div class="card"><div class="row between"><h3>🛒 Einkaufsliste</h3><span class="muted small">${done}/${items.length}</span></div>
      <div class="meter"><b style="width:${items.length ? done / items.length * 100 : 0}%"></b></div>
      <div class="row" style="margin:4px 0 8px"><input id="xIn" placeholder="Eigenen Artikel hinzufügen, z. B. 2 Pck Kaffee" autocomplete="off"><button class="btn" data-a="addExtra">+</button></div>
      ${shoppingList(items, p) || '<div class="muted small">Füge Gerichte hinzu, dann erscheint hier alles, was du kaufen musst.</div>'}
      <div class="row wrap" style="margin-top:12px">${items.length ? '<button class="btn soft sm" data-a="shareList">📤 Teilen / Kopieren</button>' : ''}
      ${done ? '<button class="btn ghost sm" data-a="clearChecks">Haken zurücksetzen</button>' : ''}</div></div>`;
}

function shoppingList(items, p) {
  if (!items.length) return '';
  const row = i => `<li><input type="checkbox" data-a="check" data-k="${esc(i.key)}" ${p.checked?.[i.key] ? 'checked' : ''}>
    <span class="${p.checked?.[i.key] ? 'done' : ''}">${esc(i.name)}</span><span class="amt muted">${esc((fmtAmount(i.amount) + ' ' + i.unit).trim())}</span>${i.extra ? `<button class="icon" data-a="delExtra" data-id="${i.id}" title="Entfernen" style="width:28px;height:28px;font-size:.8rem">✕</button>` : ''}</li>`;
  return CATS.map(c => [c, items.filter(i => i.cat === c.id)]).filter(([, l]) => l.length).map(([c, l]) => `<div class="cat">
    <div class="cat-h"><span>${c.icon} ${c.name}</span><span>${l.filter(i => p.checked?.[i.key]).length}/${l.length}</span></div>
    <ul class="list">${l.map(row).join('')}</ul></div>`).join('');
}

function allTags() { return [...new Set(liveRecipes().flatMap(r => r.tags))].sort((a, b) => a.localeCompare(b, 'de')); }
function matches(r, q, tag) {
  if (tag && !r.tags.includes(tag)) return false;
  const hay = (r.title + ' ' + r.tags.join(' ') + ' ' + r.ingredients.map(i => i.name).join(' ')).toLowerCase();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every(t => t.startsWith('-') ? t.length < 2 || !hay.includes(t.slice(1)) : hay.includes(t));
}
function recipesView() {
  const list = liveRecipes().filter(r => matches(r, view.q, view.tag))
    .sort((a, b) => view.sort === 'rating' ? (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title, 'de') : a.title.localeCompare(b.title, 'de'));
  return `<div class="sec"><h2>Rezepte</h2><button class="btn" data-a="editRecipe">+ Neu</button></div>
    <input id="q" type="search" placeholder="Suchen: Titel, Zutat, Tag … (mit -Nuss ausschließen)" value="${esc(view.q)}">
    <div class="row small muted" style="margin:10px 0 0">Sortierung: <button class="chip ${view.sort !== 'rating' ? 'on' : ''}" data-a="sort" data-s="az">A–Z</button><button class="chip ${view.sort === 'rating' ? 'on' : ''}" data-a="sort" data-s="rating">★ Beste zuerst</button></div>
    <div class="chips">${allTags().map(t => `<button class="chip ${view.tag === t ? 'on' : ''}" data-a="tag" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    ${list.length ? list.map(r => `<div class="card click" data-a="showRecipe" data-id="${r.id}"><h3>${esc(r.title)}</h3>
      <div class="row"><div class="muted small">${r.portions} Portionen · ${r.ingredients.length} Zutaten</div><span class="grow"></span>${stars(r.rating)}${ratingTxt(r.rating)}</div>
      <div class="chips">${r.tags.map(t => `<span class="chip static">${esc(t)}</span>`).join('')}</div></div>`).join('')
      : `<div class="empty"><div class="big">🔍</div>Keine Rezepte gefunden.</div>`}
    <div class="card" style="margin-top:22px"><h3>Rezepte sichern & teilen</h3>
      <p class="muted small">Exportiere alle Rezepte als Datei (z. B. per Mail oder WhatsApp teilen) oder importiere Rezepte aus einer solchen Datei.</p>
      <div class="row wrap"><button class="btn soft" data-a="exportRecipes">⬆ Exportieren</button><button class="btn soft" data-a="importRecipes">⬇ Importieren</button></div>
      <input type="file" id="impFile" accept=".json,application/json" hidden></div>`;
}

function settingsView() {
  const redirect = location.origin;
  return `<div class="sec"><h2>Google Drive</h2></div>
    <div class="card"><h3>Status</h3>
      <p class="muted">${cfg.lastSync ? 'Zuletzt synchronisiert: ' + new Date(cfg.lastSync).toLocaleString('de-DE') : 'Noch nicht synchronisiert.'}</p>
      <label class="f">OAuth-Client-ID</label>
      <input id="clientId" placeholder="123456-abc.apps.googleusercontent.com" value="${esc(cfg.clientId)}" autocomplete="off">
      <div class="row wrap" style="margin-top:14px"><button class="btn" data-a="saveClient">Speichern & jetzt synchronisieren</button>
      <button class="btn ghost" data-a="export">Backup (JSON)</button></div></div>
    <div class="card hint"><h3 style="color:var(--ink)">Einmalige Einrichtung</h3><ol>
      <li><b>console.cloud.google.com</b> öffnen → neues Projekt anlegen.</li>
      <li>„APIs & Dienste“ → „Bibliothek“ → <b>Google Drive API</b> aktivieren.</li>
      <li>„OAuth-Zustimmungsbildschirm“: Typ <i>Extern</i>, dich selbst als <i>Testnutzer</i> eintragen.</li>
      <li>„Anmeldedaten“ → „OAuth-Client-ID erstellen“ → Typ <b>Webanwendung</b>.</li>
      <li>Bei „Autorisierte JavaScript-Quellen“ eintragen: <code>${esc(redirect)}</code></li>
      <li>Die Client-ID hier einfügen und speichern.</li></ol>
      Die Daten liegen in deinem privaten App-Ordner in Drive (Scope <code>drive.appdata</code>); die App kann keine anderen Dateien sehen.</div>`;
}

/* ---------- Dialoge ---------- */
const dlg = $('#dlg');
function openDlg(title, body, foot = '') {
  dlg.innerHTML = `<div class="dh"><h2>${title}</h2><button class="icon" data-a="close">✕</button></div><div class="db">${body}${foot}</div>`;
  if (!dlg.open) dlg.showModal();
}
const closeDlg = () => dlg.open && dlg.close();
dlg.addEventListener('click', e => { if (e.target === dlg) closeDlg(); });
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }

function askText(title, label, value, cb) {
  openDlg(esc(title), `<label class="f">${esc(label)}</label><input id="askIn" value="${esc(value)}" autofocus>
    <div class="row" style="margin-top:18px"><button class="btn grow" data-a="askOk">OK</button></div>`);
  askText.cb = cb;
  $('#askIn').addEventListener('keydown', e => { if (e.key === 'Enter') document.querySelector('[data-a=askOk]').click(); });
}

function showRecipe(id) {
  const r = recipe(id); if (!r) return;
  openDlg(esc(r.title), `<div class="chips">${r.tags.map(t => `<span class="chip static">${esc(t)}</span>`).join('')}</div>
    <div class="row between"><span class="muted">${r.portions} Portionen</span><span class="row" style="gap:6px">${stars(r.rating || 0, r.id)}<b>${r.rating ? fmtAmount(r.rating) : ''}</b></span></div>
    <div class="hint" style="text-align:right">${r.rating ? 'Nochmal auf denselben Stern tippen = zurücksetzen' : 'Tippe auf einen Stern (linke Hälfte = halber Stern)'}</div>
    <h3 style="margin-top:10px">Zutaten</h3><ul class="list">${r.ingredients.map(i => `<li><span>${i.home ? '🏠 ' : ''}${esc(i.name)}${i.home ? ' <span class="muted small">(daheim)</span>' : ''}</span><span class="amt muted">${esc((fmtAmount(i.amount) + ' ' + i.unit).trim())}</span></li>`).join('')}</ul>
    <h3 style="margin-top:18px">Zubereitung</h3><ol class="steps">${r.steps.split('\n').filter(Boolean).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="row" style="margin-top:20px"><button class="btn soft grow" data-a="editRecipe" data-id="${r.id}">Bearbeiten</button>
    <button class="btn ghost" data-a="exportRecipes" data-id="${r.id}" title="Dieses Rezept teilen">📤</button>
    <button class="btn danger" data-a="delRecipe" data-id="${r.id}">Löschen</button></div>`);
}

function showDish(i) {
  const p = plan(view.planId), d = p?.dishes[i], r = d && recipe(d.rid); if (!r) return;
  const f = d.portions / (r.portions || 1);
  openDlg(esc(r.title), `<div class="chips">${r.tags.map(t => `<span class="chip static">${esc(t)}</span>`).join('')}</div>
    <div style="margin-bottom:6px">${stars(r.rating)} ${ratingTxt(r.rating)}</div>
    <div class="row between"><span class="muted">Portionen</span>
      <span class="stepper"><button class="icon" data-a="port" data-i="${i}" data-d="-1">−</button><b>${d.portions}</b><button class="icon" data-a="port" data-i="${i}" data-d="1">+</button></span></div>
    <h3 style="margin-top:18px">🛒 Einkaufsliste für dieses Gericht</h3>
    <ul class="list">${r.ingredients.filter(ing => !ing.home).map(ing => { const k = ingKey(ing), c = p.checked?.[k]; return `<li>
      <input type="checkbox" data-a="check" data-k="${esc(k)}" ${c ? 'checked' : ''}><span class="${c ? 'done' : ''}">${esc(ing.name)}</span>
      <span class="amt muted">${esc((fmtAmount(ing.amount === null ? null : ing.amount * f) + ' ' + ing.unit).trim())}</span></li>`; }).join('') || '<li class="muted">Alles daheim – nichts einzukaufen 🎉</li>'}</ul>
    ${r.ingredients.some(i => i.home) ? `<div class="hint" style="margin-top:6px">🏠 Daheim: ${esc(r.ingredients.filter(i => i.home).map(i => i.name).join(', '))}</div>` : ''}
    <h3 style="margin-top:18px">Zubereitung</h3><ol class="steps">${r.steps.split('\n').filter(Boolean).map(s => `<li>${esc(s)}</li>`).join('')}</ol>`);
  showDish.i = i;
}

function editRecipe(id) {
  const r = id ? recipe(id) : { title: '', portions: 4, tags: [], ingredients: [], steps: '' };
  openDlg(id ? 'Rezept bearbeiten' : 'Neues Rezept', `
    <label class="f">Titel</label><input id="eT" value="${esc(r.title)}">
    <div class="row"><div class="grow"><label class="f">Portionen</label><input id="eP" type="number" min="1" value="${r.portions}"></div>
    <div class="grow"><label class="f">Tags (Komma)</label><input id="eG" value="${esc(r.tags.join(', '))}"></div></div>
    <label class="f">Zutaten (eine pro Zeile, z. B. „200 g Mehl“)</label><textarea id="eI">${esc(r.ingredients.filter(i => !i.home).map(ingLine).join('\n'))}</textarea>
    <label class="f">🏠 Zutaten daheim (kommen nicht auf die Einkaufsliste)</label><textarea id="eH" style="min-height:70px" placeholder="z. B. Salz, Olivenöl, Mehl – eine pro Zeile">${esc(r.ingredients.filter(i => i.home).map(ingLine).join('\n'))}</textarea>
    <label class="f">Zubereitung (ein Schritt pro Zeile)</label><textarea id="eS">${esc(r.steps)}</textarea>
    <div class="row" style="margin-top:18px"><button class="btn grow" data-a="saveRecipe" data-id="${id || ''}">Speichern</button></div>`);
}

const pickF = { q: '', inc: '', exc: '', tag: '', shared: false, five: false };
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
  return `<div class="muted small" style="margin-bottom:8px">${list.length} Rezept${list.length === 1 ? '' : 'e'}</div>` +
    (list.map(({ r, shared }) => `<div class="card click" data-a="pick" data-id="${r.id}" style="padding:12px 16px;margin-bottom:8px">
      <div class="row between"><b>${esc(r.title)}</b>${count[r.id] ? `<span class="chip static">${count[r.id]}× im Plan</span>` : ''}</div>
      ${shared.length ? `<div class="small" style="color:var(--green)">♻️ ${shared.length} gemeinsam: ${esc(shared.join(', '))}</div>` : ''}
      <div class="row"><span class="muted small grow">${esc(r.tags.join(' · '))}</span>${stars(r.rating)}</div></div>`).join('') || '<div class="empty">Keine passenden Rezepte.</div>');
}
function pickTags() {
  return allTags().map(t => `<button class="chip ${pickF.tag === t ? 'on' : ''}" data-a="pickTag" data-t="${esc(t)}">${esc(t)}</button>`).join('');
}
function addDishPicker() {
  const p = plan(view.planId); if (!p) return;
  Object.assign(pickF, { q: '', inc: '', exc: '', tag: '', shared: false, five: false });
  openDlg('Gericht wählen', `<input id="pickQ" type="search" placeholder="Suchen: Titel, Zutat, Tag …">
    <div class="row" style="margin-top:8px"><input id="pickInc" placeholder="Enthält Zutat (z. B. Zwiebel, Tomate)"><input id="pickExc" placeholder="Ohne Zutat"></div>
    <div class="chips" id="pickTags">${pickTags()}</div>
    <label class="row small muted" style="margin:4px 0 6px"><input type="checkbox" id="pickFive" style="width:20px;height:20px;accent-color:var(--green)"> ★ Nur 5-Sterne-Gerichte</label>
    ${p.dishes.length ? '<label class="row small muted" style="margin:4px 0 10px"><input type="checkbox" id="pickShared" style="width:20px;height:20px;accent-color:var(--green)"> Nur Rezepte mit gemeinsamen Zutaten (weniger Reste)</label>' : ''}
    <div id="pickList">${pickList()}</div>`);
  const upd = () => { $('#pickList').innerHTML = pickList(); $('#pickTags').innerHTML = pickTags(); };
  addDishPicker.upd = upd;
  [['pickQ', 'q'], ['pickInc', 'inc'], ['pickExc', 'exc']].forEach(([id, k]) => $('#' + id).addEventListener('input', e => { pickF[k] = e.target.value; upd(); }));
  $('#pickFive').addEventListener('change', e => { pickF.five = e.target.checked; upd(); });
  $('#pickShared')?.addEventListener('change', e => { pickF.shared = e.target.checked; upd(); });
}

/* ---------- Aktionen ---------- */
const actions = {
  tab(el) { view.tab = el.dataset.v; view.planId = null; render(); window.scrollTo(0, 0); },
  close: closeDlg,
  sync() { sync(true); },
  newPlan() {
    askText('Neuer Wochenplan', 'Name', 'Woche ' + new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }), name => {
      const p = { id: uid(), name: name || 'Wochenplan', dishes: [], checked: {}, updatedAt: Date.now() };
      S.plans.push(p); view.planId = p.id; persist(); render();
    });
  },
  openPlan(el) { view.planId = el.dataset.id; render(); window.scrollTo(0, 0); },
  backPlans() { view.planId = null; render(); },
  pinPlan(el, e) {
    e.stopPropagation();
    const p = plan(el.dataset.id); p.pinned = !p.pinned; p.updatedAt = Date.now(); persist(); render();
    toast(p.pinned ? '📌 Plan angepinnt' : 'Plan gelöst');
  },
  renamePlan() { const p = plan(view.planId); askText('Plan umbenennen', 'Name', p.name, n => { p.name = n || p.name; touch(p); }); },
  delPlan() { const p = plan(view.planId); if (confirm(`„${p.name}“ löschen?`)) { p.deleted = true; touch(p); view.planId = null; render(); } },
  addDish() { addDishPicker(); },
  pickTag(el) { pickF.tag = pickF.tag === el.dataset.t ? '' : el.dataset.t; addDishPicker.upd(); },
  pick(el) {
    const p = plan(view.planId), r = recipe(el.dataset.id);
    if (p.dishes.length >= MAX_DISHES) return toast(`Maximal ${MAX_DISHES} Gerichte`);
    p.dishes.push({ rid: r.id, portions: r.portions }); touch(p); closeDlg();
  },
  togDish(el, e) { e.stopPropagation(); const p = plan(view.planId), d = p.dishes[+el.dataset.i]; d.done = !d.done; touch(p); },
  rmDish(el, e) { e.stopPropagation(); const p = plan(view.planId); p.dishes.splice(+el.dataset.i, 1); touch(p); },
  showDish(el) { showDish(+el.dataset.i); },
  port(el) {
    const p = plan(view.planId), d = p.dishes[+el.dataset.i]; d.portions = Math.max(1, d.portions + +el.dataset.d);
    touch(p); showDish(+el.dataset.i);
  },
  check(el) {
    const p = plan(view.planId); p.checked = p.checked || {};
    if (el.checked) p.checked[el.dataset.k] = true; else delete p.checked[el.dataset.k];
    touch(p); if (dlg.open && showDish.i !== undefined && dlg.querySelector('.stepper')) showDish(showDish.i);
  },
  addExtra() {
    const inp = $('#xIn'), v = inp.value.trim(); if (!v) return;
    const p = plan(view.planId), x = parseIngredient(v); if (!x.name) return;
    (p.extras = p.extras || []).push({ id: uid(), ...x }); touch(p); $('#xIn').focus();
  },
  delExtra(el) { const p = plan(view.planId); p.extras = p.extras.filter(x => x.id !== el.dataset.id); touch(p); },
  async shareList() {
    const p = plan(view.planId);
    const open = shopping(p).filter(i => !p.checked?.[i.key]);
    const blocks = CATS.map(c => [c, open.filter(i => i.cat === c.id)]).filter(([, l]) => l.length)
      .map(([c, l]) => `${c.icon} ${c.name}\n` + l.map(i => '☐ ' + [fmtAmount(i.amount), i.unit, i.name].filter(Boolean).join(' ')).join('\n'));
    const text = `🛒 Einkaufsliste – ${p.name}\n\n${blocks.join('\n\n')}`;
    if (navigator.share) { try { await navigator.share({ title: 'Einkaufsliste', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); toast('Liste kopiert ✓'); } catch { openDlg('Einkaufsliste', `<textarea readonly style="min-height:260px">${esc(text)}</textarea>`); }
  },
  clearChecks() { const p = plan(view.planId); p.checked = {}; touch(p); },
  sort(el) { view.sort = el.dataset.s; render(); },
  rate(el) {
    const r = recipe(el.dataset.id), v = +el.dataset.v;
    r.rating = (r.rating === v) ? 0 : v; r.updatedAt = Date.now(); persist(); showRecipe(r.id); render();
  },
  tag(el) { view.tag = view.tag === el.dataset.t ? '' : el.dataset.t; render(); },
  showRecipe(el) { showRecipe(el.dataset.id); },
  editRecipe(el) { editRecipe(el?.dataset?.id); },
  saveRecipe(el) {
    const title = $('#eT').value.trim(); if (!title) return toast('Bitte einen Titel angeben');
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
    persist(); closeDlg(); render();
  },
  delRecipe(el) {
    const r = recipe(el.dataset.id); if (!confirm(`„${r.title}“ löschen?`)) return;
    r.deleted = true; r.updatedAt = Date.now();
    livePlans().forEach(p => { const n = p.dishes.length; p.dishes = p.dishes.filter(d => d.rid !== r.id); if (n !== p.dishes.length) p.updatedAt = Date.now(); });
    persist(); closeDlg(); render();
  },
  askOk() { const v = $('#askIn').value.trim(); closeDlg(); askText.cb(v); },
  saveClient() { cfg.clientId = $('#clientId').value.trim(); saveCfg(); if (cfg.clientId) sync(true); else toast('Client-ID gespeichert'); },
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
    toast(list.length + ' Rezept' + (list.length === 1 ? '' : 'e') + ' exportiert ✓');
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
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'xIn') actions.addExtra(); });
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
  } if (e.target.dataset?.a === 'check') actions.check(e.target); });
document.addEventListener('input', e => {
  if (e.target.id === 'pq') { view.pq = e.target.value; const pos = e.target.selectionStart; render(); const q = $('#pq'); q.focus(); q.setSelectionRange(pos, pos); }
  if (e.target.id === 'q') { view.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); }
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
  if (!cfg.clientId) { if (interactive) { view.tab = 'settings'; render(); toast('Bitte zuerst die Client-ID eintragen'); } return; }
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
    if (interactive) toast('Mit Google Drive synchronisiert ✓');
    if (view.planId && !plan(view.planId)) view.planId = null;
    if (!dlg.open) render();
  } catch (err) {
    toast('Sync fehlgeschlagen: ' + err.message);
  } finally { syncing = false; setBusy(false); }
}
function setBusy(b) { $('#syncBtn').classList.toggle('busy', b); $('#syncLabel').textContent = b ? 'Sync …' : 'Sync'; }
function scheduleSync() {
  clearTimeout(timer);
  if (cfg.clientId && token && Date.now() < tokenExp - 60000) timer = setTimeout(() => sync(false), 3000);
}

/* ---------- Start ---------- */
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
