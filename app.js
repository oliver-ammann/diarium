/* Diarium – offline PWA
   Daten liegen verschlüsselt (AES-GCM, Schlüssel aus PIN via PBKDF2) in IndexedDB auf dem Gerät.
   Keine Verbindung zu irgendeinem Server. */
'use strict';
(() => {
const APP_VERSION = '1.0.0';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nid = () => [...crypto.getRandomValues(new Uint8Array(8))].map(x => x.toString(16).padStart(2, '0')).join('');
const pad = n => String(n).padStart(2, '0');
const hhmm = m => pad(Math.floor(m / 60)) + pad(m % 60);
const toTI = m => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
const fromTI = (v, isEnd) => { if (!v) return null; const [h, mi] = v.split(':').map(Number); if (isNaN(h)) return null; let m = h * 60 + (mi || 0); if (isEnd && m === 0) m = 1440; return m; };
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtD = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.';
const dur = m => { const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h${pad(r)}` : `${h}h`) : `${r}′`; };
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const isoWeek = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = t.getUTCFullYear(); return { y, w: Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7) }; };
const weekKey = mon => { const { y, w } = isoWeek(mon); return `${y}-W${pad(w)}`; };
const mondayFromKey = k => { const [y, w] = k.split('-W').map(Number); return addDays(mondayOf(new Date(y, 0, 4)), (w - 1) * 7); };
const todayStr = () => ymd(new Date());
const todayIdx = () => (new Date().getDay() + 6) % 7;
const clone = o => JSON.parse(JSON.stringify(o));
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAYSL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const T0 = 240, T1 = 1440, PXH = 44, PXM = PXH / 60;
const COLORS = ['#2e7d32', '#c2185b', '#0288d1', '#455a64', '#d32f2f', '#ef6c00', '#b59a00', '#6a4bc4', '#00897b', '#795548'];
const PR_LABEL = { p: 'Präsenz', f: 'frei', '?': 'unklar' };
const LAYERS = [['kp', 'Programm'], ['kader', 'Kader'], ['ich', 'Ich']];
const LAYER_LONG = { kp: 'Programm (Truppe)', kader: 'Kader', ich: 'Mein Plan' };
const ST_LABEL = ['geplant', 'vorbereitet', 'durchgeführt'];
const ICON = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
};

/* AGA-Kontrollpunkte gemäss Arbeitshilfe 06.031.02 */
const GROUPS = [
  { id: 'san', t: 'San D', items: ['Rettungsablauf', 'Herz, Atmung', 'Tourniquet', 'Druckverband', 'Seitenlagerung', 'Schocklagerung', 'Wirbelsäule', 'Thorax / Bauch', 'Verbände', 'Transportarten', 'CPR theoretisch', 'CPR praktisch'] },
  { id: 'abc', t: 'ABC-Abwehr', items: ['ICS 90 anpassen', 'Dichtigkeitsprüfung IPA', 'ABC BG 0', 'C-Waffe', 'ABC BG 1+2', 'ABC BG 3+4', 'Dichtigkeitsprüfung CS', 'C-Alarm', 'Ausziehen vergifteter ICS', 'A-Waffe', 'A-Überraschung', 'B-Waffe'] },
  { id: 'waf', t: 'Pers Waffe', items: ['Waffenkenntnis', 'Sicherheitsregeln', 'Manipulationen', 'PSK', 'Störungen (einf Verf)', 'Wartung', 'Stellungen', 'Schiesssequenz', 'Doublette / Misserfolg', 'Notfalldrill / Deckung', 'Drehung', 'Bewegung'] },
  { id: 'fga', t: 'FGA', items: [] },
  { id: 'vba', t: 'VBA', items: [] },
];
GROUPS.forEach(g => g.items = g.items.map((t, i) => ({ id: `${g.id}${i + 1}`, t })));

/* ================= crypto ================= */
const enc = new TextEncoder(), dec = new TextDecoder();
const ITER = 600000;
function b64(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(str) { const s = atob(str); const o = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o; }
async function deriveKey(pass, salt, iter, extractable = false) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);
}
async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
async function decryptJSON(key, rec) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.iv) }, key, unb64(rec.ct));
  return JSON.parse(dec.decode(pt));
}

/* ================= IndexedDB ================= */
let DB = null;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('diarium', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function kvGet(k) {
  return new Promise((res, rej) => { const q = DB.transaction('kv', 'readonly').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
function kvPut(entries) {
  return new Promise((res, rej) => {
    const tx = DB.transaction('kv', 'readwrite'), st = tx.objectStore('kv');
    for (const [k, v] of entries) v === undefined ? st.delete(k) : st.put(v, k);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  });
}
function kvClear() {
  return new Promise((res, rej) => { const tx = DB.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

/* ================= vault ================= */
const Vault = {
  key: null, salt: null, timer: null, saving: null, again: false, dirty: false, err: false,
  async exists() { return !!(await kvGet('vault')); },
  async create(code, codeType, state) {
    this.salt = crypto.getRandomValues(new Uint8Array(16));
    this.key = await deriveKey(code, this.salt, ITER);
    await kvPut([['cfg', { codeType }], ['vault_prev', undefined]]);
    await this.write(state, false);
  },
  async unlock(code) {
    for (const name of ['vault', 'vault_prev']) {
      const rec = await kvGet(name);
      if (!rec) continue;
      try {
        const salt = unb64(rec.salt);
        const key = await deriveKey(code, salt, rec.iter);
        const st = await decryptJSON(key, rec);
        this.key = key; this.salt = salt;
        if (name === 'vault_prev') await this.write(st, false);
        return st;
      } catch (e) { /* falscher Code oder beschädigt – nächsten Eintrag versuchen */ }
    }
    throw new Error('wrong');
  },
  async write(state, keepPrev = true) {
    prune(state);
    const { iv, ct } = await encryptJSON(this.key, state);
    const rec = { v: 1, salt: b64(this.salt), iter: ITER, iv, ct, ts: Date.now() };
    const prev = keepPrev ? await kvGet('vault') : undefined;
    await kvPut(prev ? [['vault_prev', prev], ['vault', rec]] : [['vault', rec]]);
  },
  schedule() { this.dirty = true; clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 400); paintStatus(); },
  async flush() {
    clearTimeout(this.timer);
    if (!this.key || !S.state) return;
    if (this.saving) { this.again = true; return this.saving; }
    if (!this.dirty) return;
    this.dirty = false;
    this.saving = (async () => {
      try { await this.write(S.state); this.err = false; }
      catch (e) { console.error(e); this.err = true; this.dirty = true; toast('Speichern fehlgeschlagen. Ist der Gerätespeicher voll?'); }
      this.saving = null;
      if (this.again) { this.again = false; await this.flush(); }
      paintStatus();
    })();
    return this.saving;
  },
  async changeCode(code, codeType) {
    this.salt = crypto.getRandomValues(new Uint8Array(16));
    this.key = await deriveKey(code, this.salt, ITER);
    await kvPut([['cfg', { codeType }], ['vault_prev', undefined]]);
    await this.write(S.state, false);
  },
  lock() { this.key = null; this.salt = null; this.dirty = false; clearTimeout(this.timer); },
};

/* ================= state ================= */
function defaultTemplate() {
  return [
    { id: nid(), t: 'MoE', s: 390, e: 420, k: 'kp', kat: null },
    { id: nid(), t: 'AV', s: 420, e: 435, k: 'kp', kat: null },
    { id: nid(), t: 'MiE', s: 735, e: 780, k: 'kp', kat: null },
    { id: nid(), t: 'NaE', s: 1095, e: 1140, k: 'kp', kat: null },
    { id: nid(), t: 'ABV', s: 1320, e: 1335, k: 'kp', kat: null },
  ];
}
function freshState() {
  return {
    v: 1,
    settings: { grad: '', name: '', einteilung: '', dayStart: 360, dayEnd: 1320, autoLockMin: 5, backupDays: 3, ics: { r: '4', kp: true, kader: true, ich: true, p: true, alarm: 0 } },
    cats: [], template: defaultTemplate(), weeks: {}, raps: {}, ausb: [], kader: [],
    truppe: { soldiers: [], custom: [], marks: {} },
    pend: { items: [], notes: '' },
    meta: { created: Date.now(), lastBackup: null, dirtySinceBackup: false, backupKey: null, persistAsked: false },
  };
}
function migrate(st) {
  const d = freshState();
  const o = Object.assign({}, d, st);
  o.settings = Object.assign({}, d.settings, st.settings || {});
  o.settings.ics = Object.assign({}, d.settings.ics, (st.settings || {}).ics || {});
  o.meta = Object.assign({}, d.meta, st.meta || {});
  o.truppe = Object.assign({}, d.truppe, st.truppe || {});
  o.pend = Object.assign({}, d.pend, st.pend || {});
  o.truppe.soldiers.forEach(s => s.notes = s.notes || []);
  o.kader.forEach(p => p.obs = p.obs || []);
  return o;
}
function prune(st) {
  for (const [k, w] of Object.entries(st.weeks)) if (!w.blocks.length && !w.label) delete st.weeks[k];
  for (const [k, r] of Object.entries(st.raps)) if (!r.eh.p && !r.eh.a && !r.au.p && !r.au.a) delete st.raps[k];
}

const S = {
  mode: 'loading', state: null, codeType: 'pin',
  view: 'woche', mon: mondayOf(new Date()), mDay: todayIdx(), wkMode: 'woche',
  layers: { kp: true, kader: true, ich: true }, selPerson: null, grp: 'san', grFilter: '', rapDay: todayIdx(),
  ausbStart: mondayOf(new Date()), setup: { restored: null, codeType: 'pin' }, forgot: false,
  lockMsg: '', fails: 0, waitUntil: 0, updateReady: false, reg: null, hiddenAt: 0,
  file: null, restoreData: null, scrolled: false, calTop: null, mxLeft: 0, catMap: new Map(), conf: new Map(), draft: null,
};
const commit = (dirty = true) => { if (dirty) S.state.meta.dirtySinceBackup = true; Vault.schedule(); };
const W = () => { const k = weekKey(S.mon); return S.state.weeks[k] || (S.state.weeks[k] = { label: '', blocks: [] }); };
const catOf = b => b && b.kat ? S.catMap.get(b.kat) : null;
const catName = b => { const c = catOf(b); return c ? c.name : ''; };
const blkLabel = b => b.t || catName(b) || '(ohne Titel)';
const blkColor = b => { const c = catOf(b); return c ? c.color : b.k === 'kader' ? 'var(--kader)' : b.k === 'ich' ? 'var(--ich)' : 'var(--kp)'; };
const eff = b => { if (b.k === 'ich') return null; if (b.pr) return b.pr; const c = catOf(b); return (c && c.pr) || '?'; };
const blocking = b => b.k !== 'ich' && eff(b) !== 'f';
const matchCat = t => { const n = (t || '').trim().toLowerCase(); if (!n) return null; const c = S.state.cats.find(c => c.name.trim().toLowerCase() === n); return c ? c.id : null; };
const nextColor = () => { const used = new Set(S.state.cats.map(c => c.color)); return COLORS.find(c => !used.has(c)) || COLORS[S.state.cats.length % COLORS.length]; };
const hasData = () => { const s = S.state; return Object.values(s.weeks).some(w => w.blocks.some(b => !b.ex)) || s.kader.length || s.truppe.soldiers.length || s.pend.items.length || s.ausb.length; };

/* ================= status, toast, modal ================= */
function paintStatus() {
  const el = $('#status'); if (!el) return;
  let s = 'ok', t = 'Gesichert';
  if (Vault.dirty || Vault.saving) { s = 'dirty'; t = 'Speichert …'; }
  if (Vault.err) { s = 'err'; t = 'Nicht gespeichert'; }
  el.dataset.s = s; el.lastElementChild.textContent = t;
  el.title = 'Verschlüsselt auf diesem Gerät gespeichert';
}
let toastT;
function toast(msg) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3000);
}
function openModal(html, wide, focus = true) {
  $('#modalRoot').innerHTML = `<div class="ov" data-act="ovclose"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  if (focus) { const f = $('#modalRoot input[type=text], #modalRoot input[type=password], #modalRoot input:not([type]), #modalRoot textarea'); if (f) f.focus(); }
}
const closeModal = () => { $('#modalRoot').innerHTML = ''; S.draft = null; };
const modalOpen = () => !!$('#modalRoot').innerHTML;
function arm(el, key, armedText) {
  if (S.confirm === key) return true;
  S.confirm = key; const orig = el.textContent; el.textContent = armedText; el.classList.add('armed');
  setTimeout(() => { if (S.confirm === key) { S.confirm = null; if (el.isConnected) { el.textContent = orig; el.classList.remove('armed'); } } }, 4000);
  return false;
}

/* ================= render ================= */
const TABS = [['woche', 'Woche'], ['rapporte', 'Rapporte'], ['ausbildung', 'Ausbildung'], ['kader', 'Kader'], ['truppe', 'Truppe'], ['pendenzen', 'Pendenzen']];
function render() {
  const root = $('#root');
  if (S.mode === 'setup') { root.innerHTML = viewSetup(); return; }
  if (S.mode !== 'open') { root.innerHTML = viewLock(); const c = $('#code'); if (c && !S.forgot) setTimeout(() => c.focus(), 50); return; }
  const sc = $('#calScroll'); if (sc) S.calTop = sc.scrollTop;
  const mx = $('.mx-scroll'); if (mx) S.mxLeft = mx.scrollLeft;
  S.catMap = new Map(S.state.cats.map(c => [c.id, c]));
  root.innerHTML = header() + `<div id="banners">${bannersHtml()}</div><main class="wrap main" id="main">${viewHtml()}</main>`;
  paintStatus();
  afterRender();
}
function header() {
  const st = S.state.settings, who = [st.grad, st.name].filter(Boolean).join(' ');
  const sub = [who, st.einteilung].filter(Boolean).join(' · ') || 'Agenda Subalternoffiziere';
  const open = S.state.pend.items.filter(i => !i.done), over = open.filter(i => i.bis && i.bis < todayStr()).length;
  return `<header class="top"><div class="wrap top-in">
    <div class="brand"><b>Diarium</b><small>${esc(sub)}</small></div>
    <nav class="tabs" aria-label="Bereiche">${TABS.map(([id, t]) => `<button class="tab" data-act="go" data-id="${id}" ${S.view === id ? 'aria-current="page"' : ''}>${t}${id === 'pendenzen' && open.length ? ` <span class="chip ${over ? 'red' : ''}">${open.length}</span>` : ''}</button>`).join('')}</nav>
    <div class="top-act"><span class="status" id="status" data-s="ok"><i></i><span>Gesichert</span></span>
      <button class="ibtn" data-act="go" data-id="einstellungen" aria-label="Einstellungen" ${S.view === 'einstellungen' ? 'aria-current="page"' : ''}>${ICON.gear}</button>
      <button class="ibtn" data-act="lock" aria-label="Sperren">${ICON.lock}</button></div>
  </div></header>`;
}
function needsBackup() {
  const m = S.state.meta;
  if (!hasData()) return false;
  if (!m.lastBackup) return true;
  return m.dirtySinceBackup && Date.now() - m.lastBackup > S.state.settings.backupDays * 864e5;
}
function bannersHtml() {
  if (S.updateReady) return `<div class="banners-wrap upd"><div class="wrap banner"><span><b>Neue Version verfügbar.</b> Nach dem Aktualisieren entsperrst du die App neu.</span><span class="spacer"></span><button class="btn sm pri" data-act="update">Jetzt aktualisieren</button></div></div>`;
  if (needsBackup()) {
    const m = S.state.meta, d = m.lastBackup ? Math.floor((Date.now() - m.lastBackup) / 864e5) : null;
    return `<div class="banners-wrap"><div class="wrap banner"><span>${d == null ? '<b>Noch kein Backup.</b> Geht dieses iPad verloren, sind die Daten weg.' : `<b>Letztes Backup vor ${d} Tag${d === 1 ? '' : 'en'}.</b> Seither hast du Änderungen gemacht.`}</span><span class="spacer"></span><button class="btn sm pri" data-act="backup">Backup erstellen</button></div></div>`;
  }
  return '';
}
const paintBanners = () => { const b = $('#banners'); if (b) b.innerHTML = bannersHtml(); };
function viewHtml() {
  switch (S.view) {
    case 'rapporte': return viewRap();
    case 'ausbildung': return viewAusb();
    case 'kader': return viewKader();
    case 'truppe': return viewTruppe();
    case 'pendenzen': return viewPend();
    case 'einstellungen': return viewSettings();
    default: return viewWeek();
  }
}
function afterRender() {
  const sc = $('#calScroll');
  if (sc) {
    if (!S.scrolled || S.calTop == null) { sc.scrollTop = Math.max(0, (S.state.settings.dayStart - T0 - 30) * PXM); S.scrolled = true; }
    else sc.scrollTop = S.calTop;
  }
  const mx = $('.mx-scroll'); if (mx) mx.scrollLeft = S.mxLeft;
  if (S.view === 'einstellungen') {
    const el = $('#persist');
    if (el && navigator.storage && navigator.storage.persisted) {
      Promise.all([navigator.storage.persisted(), navigator.storage.estimate ? navigator.storage.estimate() : null]).then(([p, est]) => {
        el.textContent = (p ? 'Dauerhaft – das System löscht die Daten nicht automatisch.' : 'Nicht als dauerhaft markiert. Als installierte App ist das Risiko gering; regelmässige Backups sind trotzdem wichtig.') + (est && est.usage ? ` Belegt: ${(est.usage / 1024).toFixed(0)} KB.` : '');
      });
    }
  }
}

/* ================= lock & setup ================= */
const MARK = '<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#263020"/><g fill="#e8ecdf" opacity=".9"><rect x="12" y="14" width="40" height="4" rx="1"/></g><g fill="#7f9a62"><rect x="12" y="22" width="11" height="12" rx="2"/><rect x="26.5" y="22" width="11" height="22" rx="2"/><rect x="41" y="30" width="11" height="10" rx="2"/></g><rect x="12" y="38" width="11" height="12" rx="2" fill="#f0a04b"/></svg>';
function viewLock() {
  const pin = S.codeType === 'pin';
  if (S.forgot) return `<div class="lock"><div class="lock-card">${MARK}<h1>Code vergessen</h1>
    <p class="help">Ohne Code lassen sich die Daten auf diesem Gerät nicht entschlüsseln – das ist der Sinn der Verschlüsselung. Du hast zwei Möglichkeiten:</p>
    <button class="btn big" data-act="restorepick">Backup wiederherstellen</button>
    <p class="help">Dafür brauchst du eine Backup-Datei und deine Backup-Passphrase. Danach legst du einen neuen Code fest.</p>
    <div class="divider"></div>
    <button class="btn warn" data-act="wipe">Alle Daten auf diesem Gerät löschen</button>
    <button class="linkbtn" data-act="forgotback">Zurück zum Entsperren</button></div></div>`;
  return `<div class="lock"><div class="lock-card">${MARK}<h1>Diarium</h1><p class="help">Agenda für Subalternoffiziere</p>
    <form id="unlockForm" class="col" autocomplete="off">
      <label class="lbl" for="code">${pin ? 'PIN' : 'Passphrase'}</label>
      <input class="inp code" id="code" type="password" ${pin ? 'inputmode="numeric" pattern="[0-9]*"' : ''} autocomplete="off" autocapitalize="off" spellcheck="false">
      <p class="err" id="lockErr">${esc(S.lockMsg)}</p>
      <button class="btn pri big" type="submit" id="unlockBtn">Entsperren</button>
      <button type="button" class="linkbtn" data-act="forgot">Code vergessen?</button>
    </form></div></div>`;
}
function viewSetup() {
  const r = S.setup.restored, pin = S.setup.codeType === 'pin';
  return `<div class="lock"><div class="lock-card wide">${MARK}
    <h1>${r ? 'Code für dieses Gerät' : 'Agenda einrichten'}</h1>
    <p class="help">${r ? 'Backup entschlüsselt. Lege jetzt den Code fest, mit dem du die App auf diesem Gerät entsperrst.' : 'Deine Daten bleiben auf diesem Gerät und werden mit deinem Code verschlüsselt. Ohne Code kann niemand sie lesen. Es gibt keinen Code-Reset – nur die Wiederherstellung aus einem Backup.'}</p>
    <div class="seg" role="radiogroup" aria-label="Art des Codes">
      <label><input type="radio" name="ctype" value="pin" ${pin ? 'checked' : ''}><span>PIN (Ziffern)</span></label>
      <label><input type="radio" name="ctype" value="pass" ${pin ? '' : 'checked'}><span>Passphrase</span></label>
    </div>
    <form id="setupForm" class="col" autocomplete="off">
      <label class="lbl" for="c1">${pin ? 'PIN – mindestens 6 Ziffern' : 'Passphrase – mindestens 8 Zeichen'}</label>
      <input class="inp code" id="c1" type="password" ${pin ? 'inputmode="numeric" pattern="[0-9]*"' : ''} autocomplete="new-password" autocapitalize="off" spellcheck="false">
      <label class="lbl" for="c2">Wiederholen</label>
      <input class="inp code" id="c2" type="password" ${pin ? 'inputmode="numeric" pattern="[0-9]*"' : ''} autocomplete="new-password" autocapitalize="off" spellcheck="false">
      <p class="err" id="setupErr"></p>
      <button class="btn pri big" type="submit" id="setupBtn">${r ? 'Code festlegen' : 'Einrichten'}</button>
    </form>
    ${r ? '' : `<div class="divider"></div><p class="help">Neues Gerät oder neu installiert? Hol deine Daten aus einer Backup-Datei zurück.</p><button class="btn" data-act="restorepick">Backup wiederherstellen</button>`}
  </div></div>`;
}
function validCode(code, type) { return type === 'pin' ? /^\d{6,}$/.test(code) : code.length >= 8; }
async function doSetup() {
  const type = S.setup.codeType, c1 = $('#c1').value, c2 = $('#c2').value, err = $('#setupErr');
  if (!validCode(c1, type)) { err.textContent = type === 'pin' ? 'Die PIN braucht mindestens 6 Ziffern.' : 'Die Passphrase braucht mindestens 8 Zeichen.'; return; }
  if (c1 !== c2) { err.textContent = 'Die beiden Eingaben stimmen nicht überein.'; return; }
  const btn = $('#setupBtn'); btn.disabled = true; btn.textContent = 'Verschlüssle …';
  const st = S.setup.restored ? migrate(S.setup.restored) : freshState();
  try {
    await Vault.create(c1, type, st);
    S.codeType = type; S.state = st; S.mode = 'open'; const wasRestore = !!S.setup.restored; S.setup = { restored: null, codeType: 'pin' };
    afterUnlock(); render(); toast(wasRestore ? 'Daten wiederhergestellt.' : 'Agenda eingerichtet. Deine Daten sind verschlüsselt.');
  } catch (e) { console.error(e); err.textContent = 'Einrichten fehlgeschlagen: ' + e.message; btn.disabled = false; btn.textContent = 'Einrichten'; }
}
async function doUnlock() {
  if (Date.now() < S.waitUntil) { $('#lockErr').textContent = `Zu viele Versuche. Warte noch ${Math.ceil((S.waitUntil - Date.now()) / 1000)} s.`; return; }
  const code = $('#code').value; if (!code) return;
  const btn = $('#unlockBtn'); btn.disabled = true; btn.textContent = 'Entsperre …';
  try {
    const st = await Vault.unlock(code);
    S.state = migrate(st); S.fails = 0; S.lockMsg = ''; S.mode = 'open'; S.scrolled = false;
    afterUnlock(); render();
  } catch (e) {
    S.fails++;
    S.lockMsg = 'Falscher Code.';
    if (S.fails >= 5) { const s = 30 * (S.fails - 4); S.waitUntil = Date.now() + s * 1000; S.lockMsg = `Falscher Code. Nächster Versuch in ${s} s.`; }
    render();
  }
}
function afterUnlock() {
  const h = location.hash.slice(1);
  if (TABS.some(t => t[0] === h) || h === 'einstellungen') S.view = h;
  const m = S.state.meta;
  if (!m.persistAsked && navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(() => {}); m.persistAsked = true; commit(false); }
}
async function lockNow() {
  await Vault.flush(); Vault.lock(); S.state = null; S.mode = 'locked'; S.forgot = false; closeModal(); render();
}

/* ================= week computations ================= */
function freeBands(day, blocks) {
  const ds = S.state.settings.dayStart, de = S.state.settings.dayEnd;
  const occ = blocks.filter(b => b.day === day && blocking(b)).map(b => [Math.max(b.s, ds), Math.min(b.e, de)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const out = []; let cur = ds;
  for (const [a, b] of occ) { if (a > cur) out.push([cur, a]); cur = Math.max(cur, b); }
  if (cur < de) out.push([cur, de]);
  return out;
}
function conflicts(blocks) {
  const m = new Map();
  for (const b of blocks) {
    if (b.k !== 'ich') continue;
    for (const o of blocks) {
      if (o === b || o.day !== b.day || !blocking(o) || !(o.s < b.e && b.s < o.e)) continue;
      if (eff(o) === 'p') { m.set(b.id, 'p'); break; }
      m.set(b.id, '?');
    }
  }
  return m;
}
function lanes(list) {
  const s = [...list].sort((a, b) => a.s - b.s || b.e - a.e), res = new Map();
  let cluster = [], end = -1, cols = [];
  const finish = () => cluster.forEach(b => res.get(b.id).n = cols.length);
  for (const b of s) {
    if (cluster.length && b.s >= end) { finish(); cluster = []; cols = []; end = -1; }
    let c = cols.findIndex(e => e <= b.s); if (c < 0) { c = cols.length; cols.push(b.e); } else cols[c] = b.e;
    res.set(b.id, { c, n: 1 }); cluster.push(b); end = Math.max(end, b.e);
  }
  if (cluster.length) finish();
  return res;
}
function unclearGroups(blocks) {
  const m = new Map();
  for (const b of blocks) {
    if (b.k === 'ich' || b.ex || eff(b) !== '?') continue;
    const t = (b.t || '').trim();
    if (!b.kat && !t) continue;
    const key = b.kat ? 'k:' + b.kat : 't:' + t.toLowerCase();
    if (!m.has(key)) m.set(key, { key, label: b.kat ? catName(b) : t, color: blkColor(b), n: 0 });
    m.get(key).n++;
  }
  return [...m.values()];
}
const narrow = matchMedia('(max-width: 700px)');
narrow.addEventListener('change', () => S.mode === 'open' && S.view === 'woche' && render());

/* ================= view: Woche ================= */
function weekNav(prefix = 'w') {
  const { w } = isoWeek(S.mon), end = addDays(S.mon, 6);
  return `<div class="weeknav"><button class="btn sm" data-act="${prefix}prev" aria-label="Vorherige Woche">‹</button><span class="kw">KW ${w}</span><button class="btn sm" data-act="${prefix}next" aria-label="Nächste Woche">›</button></div>
    <span class="weekrange mono">${fmtD(S.mon)}–${fmtD(end)}${end.getFullYear()}</span>
    ${mondayOf(new Date()).getTime() !== S.mon.getTime() ? `<button class="btn sm" data-act="${prefix}today">Heute</button>` : ''}`;
}
function blockHtml(b, l) {
  const e = eff(b), cf = S.conf.get(b.id), h = Math.max((b.e - b.s) * PXM, 16);
  const cls = ['blk', 'k-' + b.k, e === 'p' ? 'pr-p' : e === 'f' ? 'pr-f' : e === '?' ? 'pr-u' : '', cf === 'p' ? 'conf' : cf === '?' ? 'warn' : '', h < 36 ? 'short' : ''].join(' ');
  const tip = `${hhmm(b.s)}–${hhmm(b.e)} ${blkLabel(b)}${b.ort ? ' · ' + b.ort : ''}${e ? ' · ' + PR_LABEL[e] : ''}${cf === 'p' ? ' · KONFLIKT mit Präsenz-Block' : cf === '?' ? ' · überschneidet unklaren Block' : ''}`;
  return `<button class="${cls}" data-act="editblk" data-id="${b.id}" style="--c:${blkColor(b)};top:${(b.s - T0) * PXM}px;height:${h}px;left:calc(${l.c} / ${l.n} * 100% + 2px);width:calc(100% / ${l.n} - 4px)" title="${esc(tip)}">
    <span class="bt">${hhmm(b.s)}–${hhmm(b.e)}${b.ex ? ' <span class="ex">Beispiel</span>' : ''}</span><span class="bn">${esc(blkLabel(b))}${e === '?' ? '<i class="q" aria-label="Präsenz unklar">?</i>' : ''}</span>${b.ort ? `<span class="bo">${esc(b.ort)}</span>` : ''}</button>`;
}
function timeGrid(cols) {
  const H = (T1 - T0) / 60, tIdx = todayStr();
  const minW = cols.length > 3 && !narrow.matches ? 104 : 0;
  let html = `<div class="cal-h" style="grid-column:1"></div>`;
  cols.forEach((c, i) => { html += `<div class="cal-h ${c.today ? 'today' : ''}" style="grid-column:${i + 2}">${c.head}</div>`; });
  html += `<div class="gut" style="height:${H * PXH}px">` + Array.from({ length: H - 1 }, (_, i) => `<span style="top:${(i + 1) * PXH}px">${pad(T0 / 60 + i + 1)}00</span>`).join('') + `</div>`;
  cols.forEach((c, i) => {
    let inner = (c.free || []).map(([a, b]) => `<div class="free" style="top:${(a - T0) * PXM}px;height:${(b - a) * PXM}px">${b - a >= 45 ? `<span>frei ${dur(b - a)}</span>` : ''}</div>`).join('');
    const L = lanes(c.blocks);
    inner += c.blocks.map(b => blockHtml(b, L.get(b.id))).join('');
    if (c.dateStr === tIdx) { const n = new Date(), m = n.getHours() * 60 + n.getMinutes(); if (m >= T0) inner += `<div class="nowline" style="top:${(m - T0) * PXM}px"></div>`; }
    html += `<div class="day" data-act="newat" ${c.attrs} style="grid-column:${i + 2};height:${H * PXH}px">${inner}</div>`;
  });
  return `<div class="cal-scroll" id="calScroll"><div class="cal" style="grid-template-columns:52px repeat(${cols.length},minmax(${minW}px,1fr))">${html}</div></div>`;
}
function viewWeek() {
  const wd = W(), blocks = wd.blocks;
  S.conf = conflicts(blocks);
  const tag = S.wkMode === 'tag';
  let cols;
  if (tag) {
    const d = S.mDay, date = addDays(S.mon, d), ds = ymd(date);
    cols = [['ich', 'Mein Zeitplan'], ['kader', 'Zeitplan Kader'], ['kp', 'Zeitplan Truppe']].map(([k, t]) => ({
      head: `<b>${t}</b><div class="sum"><span>${DAYSL[d]} ${fmtD(date)}</span></div>`,
      blocks: blocks.filter(b => b.day === d && b.k === k), free: k === 'ich' ? freeBands(d, blocks) : null,
      attrs: `data-day="${d}" data-k="${k}"`, dateStr: ds, today: false,
    }));
  } else {
    const days = narrow.matches ? [S.mDay] : [0, 1, 2, 3, 4, 5, 6];
    cols = days.map(d => {
      const date = addDays(S.mon, d), ds = ymd(date), fb = freeBands(d, blocks), fsum = fb.reduce((a, [x, y]) => a + (y - x), 0);
      const dayB = blocks.filter(b => b.day === d);
      const nc = dayB.filter(b => S.conf.get(b.id) === 'p').length, nu = dayB.filter(b => eff(b) === '?').length;
      return {
        head: `<b>${DAYS[d]}</b> <span class="mono muted">${fmtD(date)}</span><div class="sum"><span>frei ${dur(fsum)}</span>${nc ? `<span class="c">${nc} Konflikt${nc > 1 ? 'e' : ''}</span>` : ''}${nu ? `<span class="u">${nu} unklar</span>` : ''}</div>`,
        blocks: dayB.filter(b => S.layers[b.k]), free: fb, attrs: `data-day="${d}"`, dateStr: ds, today: ds === todayStr(),
      };
    });
  }
  const empty = !blocks.length;
  const ug = unclearGroups(blocks);
  const wEnd = ymd(addDays(S.mon, 6));
  const due = S.state.pend.items.filter(p => !p.done && p.bis && p.bis <= wEnd).sort((a, b) => a.bis.localeCompare(b.bis));
  const confList = blocks.filter(b => S.conf.has(b.id)).sort((a, b) => a.day - b.day || a.s - b.s);
  const mine = blocks.filter(b => b.k === 'ich').sort((a, b) => a.day - b.day || a.s - b.s);
  const ausb = S.state.ausb.filter(i => i.wk === ymd(S.mon));
  const showDayTabs = tag || narrow.matches;
  return `
  <div class="bar">${weekNav()}
    <input class="inp" id="wlabel" placeholder="WK- / Schulwoche, z.B. OS Woche 9" value="${esc(wd.label)}" style="width:220px" aria-label="WK- oder Schulwoche">
    <span class="spacer"></span>
    <div class="seg sm" style="min-width:150px"><label><input type="radio" name="wkmode" value="woche" ${tag ? '' : 'checked'}><span>Woche</span></label><label><input type="radio" name="wkmode" value="tag" ${tag ? 'checked' : ''}><span>Tag</span></label></div>
  </div>
  <div class="bar">
    <button class="btn pri" data-act="newblk">+ Block</button>
    <button class="btn" data-act="tplopen">Tagesvorlage</button>
    <button class="btn" data-act="copyprev">Vorwoche übernehmen</button>
    <button class="btn" data-act="import">Text einfügen</button>
    <span class="spacer"></span>
    <button class="btn" data-act="icsopen">Kalender-Export</button>
  </div>
  ${empty ? `<div class="notice"><p><b>Noch kein Programm für KW ${isoWeek(S.mon).w}.</b> Tippe in den Kalender, um einen Block anzulegen – du kannst ihn gleich für mehrere Tage erstellen. Mit der <b>Tagesvorlage</b> setzt du Verpflegung, Verlesen usw. für die ganze Woche auf einmal. Lege für jede Kategorie fest, ob du präsent sein musst: Erst dann zeigt die Agenda deine freien Fenster.</p><button class="btn" data-act="sample">Beispielwoche ansehen</button></div>` : ''}
  ${tag ? '' : `<div class="bar">
    ${LAYERS.map(([k, t]) => `<label class="toggle"><input type="checkbox" data-act="layer" data-k="${k}" ${S.layers[k] ? 'checked' : ''}><span class="sw" style="background:var(--${k})"></span>${t}</label>`).join('')}
    <span class="legend"><span><span class="lg-p"></span>Präsenz</span><span><span class="lg-f"></span>frei</span><span><span class="lg-u"></span>unklar</span><span><span class="sw" style="background:var(--free);border:1px solid var(--line)"></span>freies Fenster ${hhmm(S.state.settings.dayStart)}–${hhmm(S.state.settings.dayEnd)}</span></span>
    ${blocks.some(b => b.ex) ? '<span class="spacer"></span><button class="btn sm warn" data-act="clearex">Beispiele entfernen</button>' : ''}
  </div>`}
  ${showDayTabs ? `<div class="daytabs">${DAYS.map((d, i) => `<button class="btn" data-act="mday" data-d="${i}" aria-pressed="${S.mDay === i}">${d} <span class="mono">${fmtD(addDays(S.mon, i))}</span></button>`).join('')}</div>` : ''}
  ${timeGrid(cols)}
  <div class="side">
    ${ug.length ? `<div class="panel klaeren"><h3>Präsenz klären</h3><p class="help" style="margin-top:4px">Diese Blöcke sind noch nicht eingeordnet und zählen nicht als freie Zeit. Einmal festlegen – gilt für alle Wochen.</p><ul>${ug.map(g => `<li><span class="nm"><span class="sw" style="background:${g.color}"></span><b>${esc(g.label)}</b><span class="muted">${g.n}×</span></span><button class="btn sm" data-act="classify" data-key="${esc(g.key)}" data-v="p">Präsenz</button><button class="btn sm" data-act="classify" data-key="${esc(g.key)}" data-v="f">frei</button></li>`).join('')}</ul></div>` : ''}
    <div class="panel"><h3>Mein Plan</h3>${mine.length ? `<ul>${mine.map(b => `<li><span class="mono muted">${DAYS[b.day]} ${hhmm(b.s)}</span><span>${esc(blkLabel(b))}${S.conf.get(b.id) === 'p' ? ' <span class="chip red">Konflikt</span>' : S.conf.get(b.id) === '?' ? ' <span class="chip amb">prüfen</span>' : ''}</span></li>`).join('')}</ul>` : '<p class="help" style="margin-top:6px">Noch keine eigenen Blöcke. Tippe in ein grünes Fenster.</p>'}</div>
    <div class="panel"><h3>Konflikte</h3>${confList.length ? `<ul>${confList.map(b => `<li><span class="mono muted">${DAYS[b.day]} ${hhmm(b.s)}</span><span>${esc(blkLabel(b))} ${S.conf.get(b.id) === 'p' ? 'überschneidet einen Präsenz-Block' : 'überschneidet einen unklaren Block'}</span></li>`).join('')}</ul>` : '<p class="help" style="margin-top:6px">Keine. Deine Blöcke liegen ausserhalb der Präsenzzeiten.</p>'}</div>
    <div class="panel"><h3>Fällig bis ${fmtD(addDays(S.mon, 6))}</h3>${due.length ? `<ul>${due.map(p => `<li><span class="mono" style="color:${p.bis < todayStr() ? 'var(--danger)' : 'var(--muted)'}">${fmtD(parseYmd(p.bis))}</span><span>${esc(p.t)}</span></li>`).join('')}</ul>` : '<p class="help" style="margin-top:6px">Keine Pendenzen mit Termin in dieser Woche.</p>'}</div>
    <div class="panel"><h3>Ausbildung KW ${isoWeek(S.mon).w}</h3>${ausb.length ? `<ul>${ausb.map(i => `<li><span class="chip ${i.st === 2 ? 'grn' : i.st === 1 ? 'amb' : ''}">${ST_LABEL[i.st || 0]}</span><span>${esc(i.t)}</span></li>`).join('')}</ul>` : '<p class="help" style="margin-top:6px">Nichts geplant. Siehe Bereich «Ausbildung».</p>'}</div>
  </div>`;
}

/* ---------- block editor (quick entry) ---------- */
function blockModal(b, isNew) {
  S.draft = { id: b.id || null, isNew, k: b.k, kat: b.kat || null, pr: b.pr || '', days: new Set([b.day]), day: b.day, newCat: false, ncColor: null };
  renderBlockModal(b);
}
function renderBlockModal(b) {
  const d = S.draft, kp = d.k !== 'ich';
  const cat = d.kat ? S.catMap.get(d.kat) : null;
  const defLabel = cat ? `Kategorie: ${PR_LABEL[cat.pr]}` : 'Standard: unklar';
  openModal(`
    <h3>${d.isNew ? 'Neuer Block' : 'Block bearbeiten'}</h3>
    <div class="fgrid">
      <div class="field full"><span class="lbl">Ebene</span><div class="seg">${LAYERS.map(([k, t]) => `<label><input type="radio" name="bk" value="${k}" ${d.k === k ? 'checked' : ''}><span>${LAYER_LONG[k]}</span></label>`).join('')}</div></div>
      ${kp ? `<div class="field full"><span class="lbl">Kategorie</span><div class="catchips">
        <button class="catchip" data-act="catchip" data-id="" aria-pressed="${!d.kat}">keine</button>
        ${S.state.cats.map(c => `<button class="catchip" data-act="catchip" data-id="${c.id}" aria-pressed="${d.kat === c.id}"><span class="sw" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('')}
        <button class="catchip" data-act="catnew">+ Neue Kategorie</button></div></div>
      ${d.newCat ? `<div class="subform full"><div class="row"><input class="inp" id="ncName" placeholder="Name, z.B. INTRO" style="flex:1" value="${esc($('#bt') ? $('#bt').value : b.t || '')}"></div>
        <div class="palette">${COLORS.map(c => `<button data-act="nccolor" data-c="${c}" style="background:${c}" aria-label="Farbe" aria-pressed="${(d.ncColor || nextColor()) === c}"></button>`).join('')}</div>
        <div class="row"><span class="lbl">Präsenz</span><div class="seg sm" style="flex:1"><label><input type="radio" name="ncpr" value="p"><span>Präsenz</span></label><label><input type="radio" name="ncpr" value="f"><span>frei</span></label><label><input type="radio" name="ncpr" value="?" checked><span>unklar</span></label></div><button class="btn sm pri" data-act="catcreate">Anlegen</button></div></div>` : ''}` : ''}
      <div class="field full"><label class="lbl" for="bt">Titel${kp ? ' <span class="muted" style="text-transform:none;letter-spacing:0">(leer = Name der Kategorie)</span>' : ''}</label><input class="inp" id="bt" type="text" value="${esc(b.t)}" placeholder="${kp ? 'z.B. Sport (d), Gefechtsausbildung' : 'z.B. Lektion vorbereiten, Kadergespräch'}"></div>
      <div class="field"><label class="lbl" for="bs">Von</label><input class="inp mono" type="time" id="bs" step="300" value="${toTI(b.s)}"></div>
      <div class="field"><label class="lbl" for="be">Bis</label><input class="inp mono" type="time" id="be" step="300" value="${toTI(b.e)}"></div>
      ${d.isNew ? `<div class="field full"><span class="lbl">Tage</span><div class="days">${DAYS.map((x, i) => `<button data-act="bday" data-d="${i}" aria-pressed="${d.days.has(i)}">${x}</button>`).join('')}<button class="btn sm" data-act="bdays" data-v="mofr">Mo–Fr</button></div></div>`
        : `<div class="field"><label class="lbl" for="bd">Tag</label><select class="inp" id="bd">${DAYSL.map((x, i) => `<option value="${i}" ${d.day === i ? 'selected' : ''}>${x} ${fmtD(addDays(S.mon, i))}</option>`).join('')}</select></div>
           <div class="field"><span class="lbl">Kopie an weiteren Tagen</span><div class="days">${DAYS.map((x, i) => i === d.day ? '' : `<button data-act="bday" data-d="${i}" aria-pressed="false">${x}</button>`).join('')}</div></div>`}
      ${kp ? `<div class="field full"><span class="lbl">Präsenz</span><div class="seg"><label><input type="radio" name="bpr" value="" ${!d.pr ? 'checked' : ''}><span>${esc(defLabel)}</span></label><label><input type="radio" name="bpr" value="p" ${d.pr === 'p' ? 'checked' : ''}><span>Präsenz</span></label><label><input type="radio" name="bpr" value="f" ${d.pr === 'f' ? 'checked' : ''}><span>frei</span></label></div></div>` : ''}
      <div class="field full"><label class="lbl" for="bo">Ort</label><input class="inp" id="bo" type="text" value="${esc(b.ort)}" placeholder="z.B. Halle P, OK 0015"></div>
      <div class="field full"><label class="lbl" for="bn">Notiz</label><textarea class="inp" id="bn" style="min-height:64px" placeholder="Material, Verantwortlich, Vorbereitung …">${esc(b.n)}</textarea></div>
    </div>
    <p class="err" id="berr"></p>
    <div class="row">${d.isNew ? '' : `<button class="btn warn" data-act="delblk" data-id="${d.id}">Löschen</button>`}<span class="spacer"></span><button class="btn" data-act="close">Abbrechen</button><button class="btn pri" data-act="saveblk">Speichern</button></div>`, false, d.isNew);
}
function readBlockForm() {
  return { t: $('#bt').value.trim(), s: fromTI($('#bs').value), e: fromTI($('#be').value, true), ort: $('#bo').value.trim(), n: $('#bn').value, day: $('#bd') ? +$('#bd').value : null, pr: ($('#modalRoot input[name=bpr]:checked') || {}).value || null };
}
function rerenderBlockModal() {
  const f = readBlockForm(), d = S.draft;
  d.pr = f.pr || '';
  if (f.day != null) d.day = f.day;
  renderBlockModal({ t: f.t, s: f.s ?? 420, e: f.e ?? 480, ort: f.ort, n: f.n });
}
function saveBlock() {
  const d = S.draft, f = readBlockForm(), err = $('#berr');
  if (f.s == null || f.e == null || f.e <= f.s) { err.textContent = '«Bis» muss nach «Von» liegen.'; return; }
  if (f.s < T0) { err.textContent = 'Die Agenda beginnt um 0400.'; return; }
  const kp = d.k !== 'ich';
  let kat = kp ? d.kat : null;
  if (kp && !kat) kat = matchCat(f.t);
  if (kat && S.catMap.get(kat) && f.t.toLowerCase() === S.catMap.get(kat).name.toLowerCase()) f.t = '';
  const base = { k: d.k, kat, t: f.t, s: f.s, e: f.e, ort: f.ort, n: f.n, pr: kp ? (f.pr || null) : null };
  const wd = W();
  if (!kp && !base.t) { err.textContent = 'Gib deinem Block einen Titel.'; return; }
  if (kp && !base.t && !kat) { err.textContent = 'Wähle eine Kategorie oder gib einen Titel ein.'; return; }
  let n = 0;
  if (d.isNew) {
    if (!d.days.size) { err.textContent = 'Wähle mindestens einen Tag.'; return; }
    for (const day of [...d.days].sort()) { wd.blocks.push({ id: nid(), day, rev: 0, ...base }); n++; }
  } else {
    const b = wd.blocks.find(x => x.id === d.id); if (!b) return closeModal();
    Object.assign(b, base, { day: f.day, rev: (b.rev || 0) + 1 }); delete b.ex; n = 1;
    for (const btn of $$('#modalRoot [data-act=bday][aria-pressed=true]')) { wd.blocks.push({ id: nid(), day: +btn.dataset.d, rev: 0, ...base }); n++; }
  }
  commit(); closeModal(); render();
  if (n > 1) toast(`${n} Blöcke angelegt.`);
}

/* ---------- day template ---------- */
function tplModal() {
  const tp = S.state.template;
  openModal(`<h3>Tagesvorlage anwenden · KW ${isoWeek(S.mon).w}</h3>
    ${tp.length ? `<ul class="plist2">${tp.map(r => `<li><span class="mono muted">${hhmm(r.s)}–${hhmm(r.e)}</span><div>${esc(r.t || (S.catMap.get(r.kat) || {}).name || '')} <span class="muted" style="font-size:13px">· ${LAYER_LONG[r.k]}</span></div></li>`).join('')}</ul>` : '<p class="help">Die Vorlage ist leer.</p>'}
    <div class="field"><span class="lbl">An diesen Tagen</span><div class="days" id="tpldays">${DAYS.map((x, i) => `<button data-act="tday" data-d="${i}" aria-pressed="${i < 5}">${x}</button>`).join('')}</div></div>
    <p class="help">Bereits vorhandene gleiche Blöcke werden übersprungen. Die Vorlage passt du unter Einstellungen an.</p>
    <div class="row"><button class="btn" data-act="go" data-id="einstellungen" data-close="1">Vorlage bearbeiten</button><span class="spacer"></span><button class="btn" data-act="close">Abbrechen</button><button class="btn pri" data-act="tplapply" ${tp.length ? '' : 'disabled'}>Anwenden</button></div>`, false, false);
}
function applyTemplate() {
  const days = $$('#tpldays [aria-pressed=true]').map(b => +b.dataset.d);
  const wd = W(); let n = 0;
  for (const day of days) for (const r of S.state.template) {
    const kat = r.kat || (r.k !== 'ich' ? matchCat(r.t) : null);
    if (wd.blocks.some(b => b.day === day && b.s === r.s && b.e === r.e && b.t === r.t && b.kat === kat)) continue;
    wd.blocks.push({ id: nid(), day, k: r.k, kat, t: r.t, s: r.s, e: r.e, ort: '', n: '', pr: null, rev: 0 }); n++;
  }
  commit(); closeModal(); render(); toast(n ? `${n} Blöcke aus der Vorlage angelegt.` : 'Alles schon vorhanden.');
}

/* ---------- text import ---------- */
const DAYRE = /^(mo|di|mi|do|fr|sa|so)[a-zäöü]*\.?,?\s*(.*)$/i;
const TIMERE = /^(\d{1,2})[:.h]?(\d{2})\s*[-–—]\s*(\d{1,2})[:.h]?(\d{2})\s+(.+)$/;
function parseProgram(txt) {
  const out = [], bad = []; let cur = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    let rest = line;
    const dm = line.match(DAYRE);
    if (dm && (dm[2] === '' || TIMERE.test(dm[2]))) { cur = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'].indexOf(dm[1].toLowerCase()); rest = dm[2]; if (!rest) continue; }
    const tm = rest.match(TIMERE);
    if (!tm || cur == null) { bad.push(line); continue; }
    let s = +tm[1] * 60 + +tm[2], e = +tm[3] * 60 + +tm[4]; if (e === 0) e = 1440;
    if (e <= s || s < T0 || e > T1) { bad.push(line); continue; }
    let title = tm[5], pr = null;
    const pm = title.match(/\((frei|präsenz|praesenz)\)\s*$/i);
    if (pm) { pr = pm[1].toLowerCase() === 'frei' ? 'f' : 'p'; title = title.slice(0, pm.index).trim(); }
    let ort = ''; const sp = title.split(/\s+[|@]\s+/); if (sp.length > 1) { ort = sp.slice(1).join(' · '); title = sp[0]; }
    out.push({ day: cur, s, e, t: title.trim(), ort, pr });
  }
  return { out, bad };
}
function importModal() {
  openModal(`<h3>Programm als Text einfügen · KW ${isoWeek(S.mon).w}</h3>
    <p class="help">Eine Zeile pro Block: Tag, Zeit, Titel. Ort optional nach « | ». Eine Zeile mit nur dem Tag gilt für alle folgenden Zeilen. Optional am Ende «(frei)» oder «(Präsenz)». Titel, die einer Kategorie entsprechen, werden automatisch zugeordnet.</p>
    <pre class="ex">Mo 0715-0730 AV | vor LG
Mo 0730-1145 INTRO | Halle P
Dienstag
0800-0930 Sport (d) | Gel
1215-1300 MiE (frei)</pre>
    <textarea class="inp mono" id="imp" style="min-height:180px" placeholder="Programm hier einfügen …"></textarea>
    <div class="row"><span class="lbl">Ebene</span><div class="seg" style="min-width:240px"><label><input type="radio" name="ik" value="kp" checked><span>Programm</span></label><label><input type="radio" name="ik" value="kader"><span>Kader</span></label></div></div>
    <p class="help mono" id="iprev">0 Blöcke erkannt</p>
    <div class="row"><span class="spacer"></span><button class="btn" data-act="close">Abbrechen</button><button class="btn pri" data-act="doimport">Übernehmen</button></div>`, true);
}

/* ---------- sample ---------- */
function sampleWeek() {
  const B = [], add = (day, s, e, t, k, pr, ort = '') => B.push({ id: nid(), day, s, e, t, k, kat: null, pr, ort, n: '', ex: true, rev: 0 });
  for (let d = 0; d < 5; d++) {
    add(d, 390, 420, 'MoE', 'kp', 'f');
    add(d, 420, 435, 'AV', 'kp', 'p', 'vor LG');
    add(d, 450, 705, d === 1 ? 'Schiessausbildung' : d === 3 ? 'AGA San D' : 'INTRO', 'kp', 'p', d === 1 ? 'Schiessplatz' : 'Halle P');
    add(d, 735, 780, 'MiE', 'kp', 'f');
    add(d, 780, 1020, d === 2 ? 'Sport' : 'Leadership', 'kp', d === 4 ? null : 'p', d === 2 ? 'Gel' : 'OK 0015');
    add(d, 1095, 1140, 'NaE', 'kp', 'f');
    add(d, 1170, 1230, 'Einheitsrapport', 'kader', 'p', 'Kp Büro');
    add(d, 1320, 1335, 'ABV', 'kp', 'p');
  }
  add(0, 1140, 1170, 'Ausbildungsrapport vorbereiten', 'ich', null);
  add(2, 1235, 1290, 'Kadernotizen nachführen', 'ich', null);
  add(3, 1140, 1180, 'Lektion vorbereiten', 'ich', null);
  W().blocks.push(...B); commit(false); render(); toast('Beispielwoche geladen. Mit «Beispiele entfernen» wieder löschen.');
}

/* ================= view: Rapporte ================= */
function rapDay(key) { return S.state.raps[key] || (S.state.raps[key] = { eh: { p: '', a: '' }, au: { p: '', a: '' } }); }
function viewRap() {
  const d = S.rapDay, date = addDays(S.mon, d), key = ymd(date);
  const day = S.state.raps[key] || { eh: { p: '', a: '' }, au: { p: '', a: '' } };
  const blocks = W().blocks;
  const prog = dd => blocks.filter(b => b.day === dd && b.k !== 'ich').sort((a, b) => a.s - b.s);
  const progList = dd => { const p = prog(dd); return p.length ? `<ul style="list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:4px">${p.map(b => `<li class="row" style="flex-wrap:nowrap;align-items:baseline"><span class="mono muted">${hhmm(b.s)}</span><span style="min-width:0;overflow-wrap:anywhere">${esc(blkLabel(b))}</span></li>`).join('')}</ul>` : '<p class="help">Kein Programm erfasst.</p>'; };
  const card = (k, t) => `<div class="panel"><h3>${t}</h3>
    <label class="lbl" for="${k}p">Meine Punkte</label><textarea class="inp" id="${k}p" data-rap="${k}.p" placeholder="Was ich einbringe: Stand Ausbildung, Probleme, Anträge …">${esc(day[k].p)}</textarea>
    <label class="lbl" for="${k}a">Erhaltene Aufträge</label><textarea class="inp" id="${k}a" data-rap="${k}.a" placeholder="Ein Auftrag pro Zeile">${esc(day[k].a)}</textarea>
    <div class="row"><button class="btn sm" data-act="topend" data-k="${k}">Aufträge → Pendenzen</button></div></div>`;
  return `<div class="bar">${weekNav()}</div>
  <div class="daytabs">${DAYS.map((x, i) => `<button class="btn" data-act="rday" data-d="${i}" aria-pressed="${d === i}">${x} <span class="mono">${fmtD(addDays(S.mon, i))}</span></button>`).join('')}</div>
  <div class="rap2">${card('eh', 'Einheitsrapport')}${card('au', 'Ausbildungsrapport')}
    <div class="panel ctx"><h3>Programm ${DAYS[d]}</h3>${progList(d)}${d < 6 ? `<h3 style="margin-top:12px">Folgetag ${DAYS[d + 1]}</h3>${progList(d + 1)}` : ''}</div></div>`;
}

/* ================= view: Ausbildungsplanung ================= */
function viewAusb() {
  const A = S.state.ausb, base = mondayOf(new Date()), baseStr = ymd(base);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(S.ausbStart, i * 7));
  const item = i => `<div class="ai"><button class="st" data-act="ausbst" data-id="${i.id}" data-v="${i.st || 0}">${ST_LABEL[i.st || 0]}</button><button class="t" data-act="ausbedit" data-id="${i.id}">${esc(i.t)}${i.verantw || i.aga ? `<small>${[i.verantw, i.aga ? (GROUPS.find(g => g.id === i.aga) || {}).t : ''].filter(Boolean).map(esc).join(' · ')}</small>` : ''}</button></div>`;
  const overdue = A.filter(i => i.wk && i.wk < baseStr && (i.st || 0) < 2).sort((a, b) => a.wk.localeCompare(b.wk));
  const later = A.filter(i => !i.wk);
  const weekPanel = mon => {
    const k = ymd(mon), items = A.filter(i => i.wk === k);
    const lbl = (S.state.weeks[weekKey(mon)] || {}).label;
    return `<div class="panel ${k === baseStr ? 'cur' : ''}"><div class="row"><h3>KW ${isoWeek(mon).w}</h3><span class="mono muted" style="font-size:13px">${fmtD(mon)}–${fmtD(addDays(mon, 6))}</span>${lbl ? `<span class="chip">${esc(lbl)}</span>` : ''}</div>
      ${items.map(item).join('')}
      <div class="row"><input class="inp" type="text" data-ausbnew="${k}" placeholder="Thema / Lektion" style="flex:1"><button class="btn sm" data-act="ausbadd" data-wk="${k}">+</button></div></div>`;
  };
  return `<div class="bar"><h2>Ausbildungsplanung</h2><span class="spacer"></span>
    <button class="btn sm" data-act="ausbprev" aria-label="Frühere Wochen">‹ 4 Wochen</button>
    ${ymd(S.ausbStart) !== baseStr ? '<button class="btn sm" data-act="ausbtoday">Ab heute</button>' : ''}
    <button class="btn sm" data-act="ausbnext" aria-label="Spätere Wochen">4 Wochen ›</button></div>
  <p class="help">Plane Themen und Lektionen über mehrere Wochen. Tippe auf den Status, um ihn weiterzuschalten: geplant → vorbereitet → durchgeführt.</p>
  ${overdue.length ? `<div class="panel klaeren"><h3>Nicht durchgeführt</h3>${overdue.map(i => item(i).replace('<div class="ai">', `<div class="ai"><span class="mono muted" style="font-size:12px">KW ${isoWeek(parseYmd(i.wk)).w}</span>`)).join('')}</div>` : ''}
  <div class="ausb">${weeks.map(weekPanel).join('')}
    <div class="panel"><h3>Später / ohne Termin</h3>${later.map(item).join('')}<div class="row"><input class="inp" type="text" data-ausbnew="" placeholder="Thema / Lektion" style="flex:1"><button class="btn sm" data-act="ausbadd" data-wk="">+</button></div></div>
  </div>`;
}
function ausbModal(i) {
  openModal(`<h3>Ausbildung</h3><div class="fgrid">
    <div class="field full"><label class="lbl" for="at">Thema / Lektion</label><input class="inp" id="at" type="text" value="${esc(i.t)}"></div>
    <div class="field"><label class="lbl" for="aw">Woche (beliebiger Tag)</label><input class="inp mono" id="aw" type="date" value="${esc(i.wk)}"></div>
    <div class="field"><label class="lbl" for="av">Verantwortlich</label><input class="inp" id="av" type="text" value="${esc(i.verantw)}" placeholder="z.B. Gfhr Gr 2"></div>
    <div class="field"><label class="lbl" for="ag">AGA-Bezug</label><select class="inp" id="ag"><option value="">–</option>${GROUPS.map(g => `<option value="${g.id}" ${i.aga === g.id ? 'selected' : ''}>${g.t}</option>`).join('')}</select></div>
    <div class="field"><span class="lbl">Status</span><div class="seg">${ST_LABEL.map((s, n) => `<label><input type="radio" name="ast" value="${n}" ${(i.st || 0) === n ? 'checked' : ''}><span>${s}</span></label>`).join('')}</div></div>
    <div class="field full"><label class="lbl" for="az">Ziel</label><textarea class="inp" id="az" style="min-height:60px" placeholder="Was die Truppe danach kann">${esc(i.ziel)}</textarea></div>
    <div class="field full"><label class="lbl" for="an">Material / Notiz</label><textarea class="inp" id="an" style="min-height:60px">${esc(i.n)}</textarea></div>
    </div><div class="row"><button class="btn warn" data-act="ausbdel" data-id="${i.id}">Löschen</button><span class="spacer"></span><button class="btn" data-act="close">Abbrechen</button><button class="btn pri" data-act="ausbsave" data-id="${i.id}">Speichern</button></div>`, false, false);
}

/* ================= view: Kader ================= */
function viewKader() {
  const ppl = S.state.kader, sel = ppl.find(p => p.id === S.selPerson) || ppl[0];
  const list = ppl.map(p => `<button data-act="selp" data-id="${p.id}" aria-current="${sel && sel.id === p.id}"><span>${esc(p.grad)} ${esc(p.name)} ${esc(p.vorname)}</span><span class="muted mono">${p.obs.length}</span></button>`).join('');
  let detail;
  if (!sel) detail = `<div class="notice"><p><b>Noch kein Kader erfasst.</b> Erfasse deine Gruppenführer und Anwärter. Notiere laufend datierte Beobachtungen – so schreibst du Qualifikationen und Feedbacks mit Fakten statt aus dem Gedächtnis.</p></div>`;
  else {
    const col = (typ, t) => { const o = sel.obs.filter(x => x.typ === typ).sort((a, b) => b.d.localeCompare(a.d)); return `<div><span class="lbl">${t} · ${o.length}</span><ul>${o.map(x => `<li><span class="mono muted">${fmtD(parseYmd(x.d))}</span><div>${esc(x.t)}</div><button class="x" data-act="delobs" data-id="${x.id}" aria-label="Eintrag löschen">×</button></li>`).join('') || '<li><div class="muted">–</div></li>'}</ul></div>`; };
    detail = `<div class="panel col" style="gap:12px">
      <div class="fgrid four">
        <div class="field"><label class="lbl" for="kg">Grad</label><input class="inp" id="kg" type="text" data-kp="grad" value="${esc(sel.grad)}"></div>
        <div class="field"><label class="lbl" for="kn">Name</label><input class="inp" id="kn" type="text" data-kp="name" value="${esc(sel.name)}"></div>
        <div class="field"><label class="lbl" for="kv">Vorname</label><input class="inp" id="kv" type="text" data-kp="vorname" value="${esc(sel.vorname)}"></div>
        <div class="field"><label class="lbl" for="kf">Funktion / Anw zu</label><input class="inp" id="kf" type="text" data-kp="fn" value="${esc(sel.fn)}" placeholder="z.B. Gfhr, Anw Wm"></div>
      </div>
      <div class="row" style="align-items:stretch">
        <input class="inp mono" type="date" id="od" value="${todayStr()}" aria-label="Datum">
        <select class="inp" id="ot" aria-label="Art"><option value="s">Stärke</option><option value="w">Schwäche</option><option value="b" selected>Beobachtung</option></select>
        <input class="inp" id="otx" type="text" style="flex:1;min-width:200px" placeholder="Konkret: Situation, Verhalten, Wirkung">
        <button class="btn pri" data-act="addobs">Erfassen</button>
      </div>
      <div class="obs3">${col('s', 'Stärken')}${col('w', 'Schwächen')}${col('b', 'Beobachtungen')}</div>
      <div class="row"><span class="spacer"></span><button class="btn sm warn" data-act="delp" data-id="${sel.id}">Person entfernen</button></div>
    </div>`;
  }
  return `<h2>Notizen Kader</h2><div class="split"><div class="panel"><div class="row"><input class="inp" id="npname" type="text" style="flex:1" placeholder="Grad Name Vorname" aria-label="Neue Person"><button class="btn" data-act="addp" aria-label="Person hinzufügen">+</button></div><div class="plist">${list}</div></div>${detail}</div>`;
}

/* ================= view: Truppe ================= */
const groupItems = gid => [...GROUPS.find(x => x.id === gid).items, ...S.state.truppe.custom.filter(c => c.g === gid)];
function viewTruppe() {
  const T = S.state.truppe, items = groupItems(S.grp), g = GROUPS.find(x => x.id === S.grp);
  const grs = [...new Set(T.soldiers.map(s => s.gr).filter(Boolean))].sort();
  const sol = T.soldiers.filter(s => !S.grFilter || s.gr === S.grFilter).sort((a, b) => (a.gr || '').localeCompare(b.gr || '') || a.name.localeCompare(b.name));
  const head = `<div class="bar"><h2>Truppe</h2><span class="spacer"></span>
    <select class="inp" data-act="grfilter" aria-label="Gruppe filtern"><option value="">Alle Gruppen</option>${grs.map(x => `<option ${S.grFilter === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
    <button class="btn" data-act="addsol">+ Angehörige erfassen</button></div>
    <div class="groups">${GROUPS.map(x => `<button class="btn sm" data-act="grp" data-id="${x.id}" aria-pressed="${S.grp === x.id}">${x.t}</button>`).join('')}</div>`;
  if (!T.soldiers.length) return head + `<div class="notice"><p><b>Noch keine Angehörigen erfasst.</b> Erfasse deinen Zug, auch mehrere auf einmal. Danach hakst du pro Person die AGA-Themen ab: ein Tipp für <b>I</b> (instruiert), zwei für <b>✓</b> (bestanden). Tippe auf einen Namen für Notizen zur Person.</p><button class="btn pri" data-act="addsol">+ Angehörige erfassen</button></div>`;
  const cell = (s, it) => { const v = (T.marks[s.id] || {})[it.id] || 0; return `<td class="c"><button class="cell" data-act="mark" data-s="${s.id}" data-i="${it.id}" data-v="${v}" aria-label="${esc(s.name + ' – ' + it.t)}">${v === 2 ? '✓' : v === 1 ? 'I' : ''}</button></td>`; };
  const pct = it => { const n = sol.length; if (!n) return '–'; const k = sol.filter(s => ((T.marks[s.id] || {})[it.id] || 0) === 2).length; return Math.round(k / n * 100) + '%'; };
  return head + (items.length ? `<div class="mx-scroll"><table class="mx"><thead><tr><th class="nm"><div class="lbl" style="padding:8px 10px">${g.t} · ${sol.length} AdA</div></th>${items.map(it => `<th class="vh"><div title="${esc(it.t)}">${esc(it.t)}${it.g ? ` <button class="x" data-act="delitem" data-id="${it.id}" aria-label="Thema löschen">×</button>` : ''}</div></th>`).join('')}<th class="vh"><div>Bestanden</div></th></tr></thead>
    <tbody>${sol.map(s => { const done = items.filter(it => ((T.marks[s.id] || {})[it.id] || 0) === 2).length; return `<tr><td class="nm"><button data-act="editsol" data-id="${s.id}">${esc(s.grad)} <b>${esc(s.name)}</b> ${esc(s.vorname)}${s.gr ? ` <small>· ${esc(s.gr)}</small>` : ''}${s.notes.length ? ` <span class="chip">${s.notes.length} Notiz${s.notes.length > 1 ? 'en' : ''}</span>` : ''}</button></td>${items.map(it => cell(s, it)).join('')}<td class="tot ${done === items.length ? '' : 'muted'}">${done}/${items.length}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td class="nm">Bestanden im Zug</td>${items.map(it => `<td>${pct(it)}</td>`).join('')}<td></td></tr></tfoot></table></div>` : `<div class="notice"><p>Für ${g.t} sind noch keine Themen erfasst. Füge die Themen deines Ausbildungsplans hinzu.</p></div>`) +
    `<div class="row"><input class="inp" id="newitem" type="text" placeholder="Eigenes Thema für ${g.t}" style="flex:1;min-width:200px;max-width:420px"><button class="btn" data-act="additem">+ Thema</button><span class="help">Tippen: leer → I instruiert → ✓ bestanden → leer.</span></div>`;
}
function solModal(s) {
  if (!s) {
    openModal(`<h3>Angehörige erfassen</h3>
      <p class="help">Eine Person pro Zeile: Grad Name Vorname Gruppe. Die Gruppe ist optional.</p>
      <pre class="ex">Sdt Muster Hans Gr 1
Gfr Beispiel Lea Gr 2</pre>
      <textarea class="inp" id="soltx" style="min-height:160px"></textarea>
      <div class="row"><span class="spacer"></span><button class="btn" data-act="close">Abbrechen</button><button class="btn pri" data-act="savesols">Erfassen</button></div>`);
    return;
  }
  const notes = [...s.notes].sort((a, b) => b.d.localeCompare(a.d));
  openModal(`<h3>${esc(s.grad)} ${esc(s.name)} ${esc(s.vorname)}</h3><div class="fgrid">
    <div class="field"><label class="lbl" for="sg">Grad</label><input class="inp" id="sg" type="text" value="${esc(s.grad)}"></div>
    <div class="field"><label class="lbl" for="sgr">Gruppe</label><input class="inp" id="sgr" type="text" value="${esc(s.gr)}"></div>
    <div class="field"><label class="lbl" for="sn">Name</label><input class="inp" id="sn" type="text" value="${esc(s.name)}"></div>
    <div class="field"><label class="lbl" for="sv">Vorname</label><input class="inp" id="sv" type="text" value="${esc(s.vorname)}"></div></div>
    <span class="lbl">Notizen Truppe</span>
    <div class="row"><input class="inp mono" type="date" id="snd" value="${todayStr()}" aria-label="Datum"><input class="inp" id="snt" type="text" style="flex:1;min-width:180px" placeholder="Dienstliche Beobachtung, Gespräch, Auftrag"><button class="btn" data-act="soladdnote" data-id="${s.id}">Erfassen</button></div>
    <ul class="notes">${notes.map(n => `<li><span class="mono muted">${fmtD(parseYmd(n.d))}</span><div>${esc(n.t)}</div><button class="x" data-act="soldelnote" data-s="${s.id}" data-id="${n.id}" aria-label="Notiz löschen">×</button></li>`).join('') || '<li><div class="muted">Noch keine Notizen.</div></li>'}</ul>
    <p class="help">Nur dienstlich Relevantes notieren – nichts Medizinisches oder Privates.</p>
    <div class="row"><button class="btn warn" data-act="delsol" data-id="${s.id}">Entfernen</button><span class="spacer"></span><button class="btn" data-act="close">Abbrechen</button><button class="btn pri" data-act="savesol" data-id="${s.id}">Speichern</button></div>`, false, false);
}
function applySolFields(s) { Object.assign(s, { grad: $('#sg').value.trim(), name: $('#sn').value.trim(), vorname: $('#sv').value.trim(), gr: $('#sgr').value.trim() }); }

/* ================= view: Pendenzen ================= */
function viewPend() {
  const P = S.state.pend, t = todayStr(), wEnd = ymd(addDays(mondayOf(new Date()), 6));
  const open = P.items.filter(i => !i.done).sort((a, b) => (a.bis || '9999').localeCompare(b.bis || '9999'));
  const done = P.items.filter(i => i.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const chip = i => !i.bis ? '' : i.bis < t ? '<span class="chip red">überfällig</span>' : i.bis === t ? '<span class="chip amb">heute</span>' : i.bis <= wEnd ? '<span class="chip amb">diese Woche</span>' : '';
  const li = i => `<li class="${i.done ? 'done' : ''}"><input type="checkbox" data-act="pdone" data-id="${i.id}" ${i.done ? 'checked' : ''} aria-label="Erledigt"><div>${esc(i.t)} ${i.done ? '' : chip(i)}${i.src ? ` <span class="muted" style="font-size:12px">· ${esc(i.src)}</span>` : ''}</div><span class="mono muted">${i.bis ? fmtD(parseYmd(i.bis)) : ''}</span><button class="x" data-act="pdel" data-id="${i.id}" aria-label="Löschen">×</button></li>`;
  return `<div class="p2"><div class="panel col" style="gap:10px"><h2>Pendenzen / Termine</h2>
    <div class="row"><input class="inp" id="ptx" type="text" style="flex:1;min-width:180px" placeholder="Was ist zu erledigen?"><input class="inp mono" type="date" id="pbis" aria-label="Bis"><button class="btn pri" data-act="padd">Erfassen</button></div>
    ${open.length ? `<ul class="plist2">${open.map(li).join('')}</ul>` : '<p class="help">Keine offenen Pendenzen. Aufträge aus den Rapporten übernimmst du dort mit einem Tipp.</p>'}
    ${done.length ? `<details><summary class="lbl" style="cursor:pointer">Erledigt · ${done.length}</summary><ul class="plist2">${done.map(li).join('')}</ul><button class="btn sm" data-act="pclear" style="margin-top:8px">Erledigte löschen</button></details>` : ''}
  </div><div class="panel col"><h2>Notizen</h2><textarea class="inp" id="pnotes" style="min-height:340px" placeholder="Freie Notizen …">${esc(P.notes)}</textarea></div></div>`;
}

/* ================= view: Einstellungen ================= */
function viewSettings() {
  const st = S.state.settings, m = S.state.meta, cats = S.state.cats;
  const allBlocks = Object.values(S.state.weeks).flatMap(w => w.blocks);
  const used = id => allBlocks.filter(b => b.kat === id).length;
  const lb = m.lastBackup ? new Date(m.lastBackup) : null;
  return `<h2>Einstellungen</h2>
  <div class="sgrid">
    <section class="panel col"><h3>Profil</h3>
      <div class="fgrid">
        <div class="field"><label class="lbl" for="st-grad">Grad</label><input class="inp" id="st-grad" type="text" data-set="grad" value="${esc(st.grad)}" placeholder="z.B. Asp, Lt"></div>
        <div class="field"><label class="lbl" for="st-name">Name</label><input class="inp" id="st-name" type="text" data-set="name" value="${esc(st.name)}"></div>
        <div class="field full"><label class="lbl" for="st-ein">Einteilung</label><input class="inp" id="st-ein" type="text" data-set="einteilung" value="${esc(st.einteilung)}" placeholder="z.B. Pz/Art OS 22, Kl 2"></div>
      </div></section>
    <section class="panel col"><h3>Planung</h3>
      <div class="fgrid">
        <div class="field"><label class="lbl" for="st-ds">Planungsfenster von</label><input class="inp mono" id="st-ds" type="time" data-settime="dayStart" value="${toTI(st.dayStart)}"></div>
        <div class="field"><label class="lbl" for="st-de">bis</label><input class="inp mono" id="st-de" type="time" data-settime="dayEnd" value="${toTI(st.dayEnd)}"></div>
      </div>
      <p class="help">Freie Fenster werden nur innerhalb dieses Zeitraums berechnet.</p></section>

    <section class="panel col span2"><h3>Kategorien</h3>
      <p class="help">Kategorien sind die Arten von Blöcken im Programm (z.B. INTRO, Sport, Leadership). Lege einmal fest, ob du dort präsent sein musst – das gilt dann für alle Wochen. Einzelne Blöcke kannst du im Block selbst abweichend markieren.</p>
      ${cats.map(c => `<div class="catrow"><button class="cdot" data-act="catcolor" data-id="${c.id}" style="background:${c.color}" aria-label="Farbe ändern"></button>
        <input class="inp" type="text" data-catname="${c.id}" value="${esc(c.name)}" aria-label="Name">
        <div class="seg sm">${['p', 'f', '?'].map(v => `<label><input type="radio" name="cpr-${c.id}" data-catpr="${c.id}" value="${v}" ${c.pr === v ? 'checked' : ''}><span>${PR_LABEL[v]}</span></label>`).join('')}</div>
        <span class="muted" style="font-size:13px">${used(c.id)} Blöcke</span>
        <button class="x" data-act="catdel" data-id="${c.id}" aria-label="Kategorie löschen">×</button></div>`).join('') || '<p class="help">Noch keine Kategorien.</p>'}
      <div class="row"><input class="inp" id="newcat" type="text" placeholder="Neue Kategorie, z.B. INTRO" style="flex:1;max-width:320px"><button class="btn" data-act="catadd">+ Kategorie</button></div></section>

    <section class="panel col span2"><h3>Tagesvorlage</h3>
      <p class="help">Blöcke, die jeden Tag gleich sind (Verpflegung, Verlesen …). In der Wochenansicht mit «Tagesvorlage» auf mehrere Tage anwenden.</p>
      ${S.state.template.map(r => `<div class="tplrow">
        <input class="inp t-name" type="text" data-tpl="${r.id}" data-f="t" value="${esc(r.t)}" placeholder="Titel" aria-label="Titel">
        <input class="inp mono" type="time" data-tpl="${r.id}" data-f="s" value="${toTI(r.s)}" aria-label="Von">
        <input class="inp mono" type="time" data-tpl="${r.id}" data-f="e" value="${toTI(r.e)}" aria-label="Bis">
        <select class="inp" data-tpl="${r.id}" data-f="kat" aria-label="Kategorie"><option value="">Kategorie: automatisch</option>${cats.map(c => `<option value="${c.id}" ${r.kat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <button class="x" data-act="tpldel" data-id="${r.id}" aria-label="Zeile löschen">×</button></div>`).join('')}
      <div class="row"><button class="btn" data-act="tpladd">+ Zeile</button></div></section>

    <section class="panel col"><h3>Backup</h3>
      <p class="help">Das Backup ist eine verschlüsselte Datei. Speichere sie in iCloud Drive oder an einem anderen sicheren Ort. Ohne Backup-Passphrase kann niemand sie öffnen – auch du nicht.</p>
      <p><b>Letztes Backup:</b> ${lb ? `${fmtD(lb)}${lb.getFullYear()} ${hhmm(lb.getHours() * 60 + lb.getMinutes())}` : 'noch keines'}<br><b>Backup-Passphrase:</b> ${m.backupKey ? 'festgelegt' : 'noch nicht festgelegt'}</p>
      <div class="row"><button class="btn pri" data-act="backup">Backup erstellen</button><button class="btn" data-act="restorepick">Wiederherstellen</button>${m.backupKey ? '<button class="btn" data-act="bkpass">Passphrase ändern</button>' : ''}</div>
      <div class="field"><label class="lbl" for="st-bd">Erinnern nach</label><select class="inp" id="st-bd" data-setnum="backupDays">${[1, 2, 3, 5, 7, 14].map(n => `<option value="${n}" ${st.backupDays === n ? 'selected' : ''}>${n} Tag${n > 1 ? 'en' : ''}</option>`).join('')}</select></div></section>

    <section class="panel col"><h3>Sicherheit</h3>
      <div class="field"><label class="lbl" for="st-al">Automatisch sperren</label><select class="inp" id="st-al" data-setnum="autoLockMin">${[[0, 'sofort beim Verlassen'], [1, 'nach 1 Minute'], [5, 'nach 5 Minuten'], [15, 'nach 15 Minuten'], [60, 'nach 1 Stunde']].map(([n, t]) => `<option value="${n}" ${st.autoLockMin === n ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="row"><button class="btn" data-act="codechange">Code ändern</button></div>
      <p class="help"><b>Speicher:</b> <span id="persist">wird geprüft …</span></p></section>

    <section class="panel col span2"><h3>So funktioniert’s</h3>
      <ul class="helplist">
        <li><b>Installation:</b> In Safari die Adresse öffnen → Teilen-Taste → «Zum Home-Bildschirm». Danach läuft die App ohne Internet. Daten aus dem Safari-Tab werden nicht in die installierte App übernommen – also erst installieren, dann erfassen.</li>
        <li><b>Präsenz:</b> Blöcke im Programm sind zuerst «unklar» und zählen nicht als frei. Lege pro Kategorie fest, ob du präsent sein musst. Erst dann zeigt die Woche deine freien Fenster.</li>
        <li><b>Handschrift:</b> Mit dem Apple Pencil kannst du in jedes Textfeld schreiben (Kritzeln/Scribble in den iPad-Einstellungen unter Apple Pencil).</li>
        <li><b>Kalender:</b> «Kalender-Export» in der Woche erstellt eine .ics-Datei für Apple oder Google Kalender. Exportiert werden nur Termine und Pendenzen – keine Kader- oder Truppendaten.</li>
        <li><b>Updates:</b> Liegt eine neue Version auf dem Server, erscheint oben ein Hinweis. Deine Daten bleiben dabei erhalten.</li>
      </ul>
      <p class="help">Version ${APP_VERSION} · Daten verschlüsselt auf diesem Gerät, keine Verbindung zu Servern.</p></section>

    <section class="panel col span2"><h3>Alle Daten löschen</h3>
      <p class="help">Löscht alle Daten auf diesem Gerät unwiderruflich. Backup-Dateien bleiben erhalten.</p>
      <div class="row"><button class="btn warn" data-act="wipe">Alle Daten löschen</button></div></section>
  </div>`;
}

/* ================= backup / restore ================= */
function passModal(change) {
  openModal(`<h3>${change ? 'Backup-Passphrase ändern' : 'Backup-Passphrase festlegen'}</h3>
    <p class="help">Mit dieser Passphrase werden deine Backup-Dateien verschlüsselt. Wähle sie lang (mindestens 10 Zeichen, z.B. vier zufällige Wörter) und notiere sie an einem sicheren Ort. <b>Geht sie verloren, kann niemand deine Backups öffnen.</b>${change ? ' Frühere Backups bleiben mit der alten Passphrase verschlüsselt.' : ''}</p>
    <form id="passForm" class="col" autocomplete="off">
      <label class="lbl" for="bp1">Backup-Passphrase</label><input class="inp" id="bp1" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false">
      <label class="lbl" for="bp2">Wiederholen</label><input class="inp" id="bp2" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false">
      <p class="err" id="bperr"></p>
      <div class="row"><span class="spacer"></span><button type="button" class="btn" data-act="close">Abbrechen</button><button class="btn pri" type="submit" id="bpbtn">Festlegen</button></div>
    </form>`);
}
async function setBackupPass() {
  const p1 = $('#bp1').value, p2 = $('#bp2').value, err = $('#bperr');
  if (p1.length < 10) { err.textContent = 'Mindestens 10 Zeichen.'; return; }
  if (p1 !== p2) { err.textContent = 'Die beiden Eingaben stimmen nicht überein.'; return; }
  const btn = $('#bpbtn'); btn.disabled = true; btn.textContent = 'Berechne …';
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(p1, salt, ITER, true);
  const raw = await crypto.subtle.exportKey('raw', key);
  S.state.meta.backupKey = { salt: b64(salt), iter: ITER, raw: b64(raw) };
  commit(false); await Vault.flush();
  await backupModal();
}
async function backupModal() {
  if (!S.state.meta.backupKey) return passModal(false);
  openModal(`<h3>Backup erstellen</h3><p class="help">Datei wird verschlüsselt …</p>`, false, false);
  try {
    const bk = S.state.meta.backupKey;
    const key = await crypto.subtle.importKey('raw', unb64(bk.raw), { name: 'AES-GCM' }, false, ['encrypt']);
    const { iv, ct } = await encryptJSON(key, S.state);
    const now = new Date();
    const payload = { fmt: 'diarium-backup', v: 1, app: APP_VERSION, created: now.toISOString(), kdf: { alg: 'PBKDF2-SHA256', iter: bk.iter, salt: bk.salt }, iv, ct };
    S.file = new File([JSON.stringify(payload)], `diarium-backup-${ymd(now)}-${hhmm(now.getHours() * 60 + now.getMinutes())}.json`, { type: 'application/json' });
    openModal(`<h3>Backup bereit</h3>
      <p><span class="mono">${esc(S.file.name)}</span> · ${(S.file.size / 1024).toFixed(0)} KB, verschlüsselt</p>
      <p class="help">Tippe auf «Sichern» und wähle <b>«In Dateien sichern»</b> → iCloud Drive (z.B. Ordner «Diarium»). Zum Wiederherstellen brauchst du diese Datei und deine Backup-Passphrase.</p>
      <div class="row"><span class="spacer"></span><button class="btn" data-act="close">Schliessen</button><button class="btn pri" data-act="bkshare">Sichern</button></div>`, false, false);
  } catch (e) { console.error(e); openModal(`<h3>Backup fehlgeschlagen</h3><p class="help">${esc(e.message)}</p><div class="row"><span class="spacer"></span><button class="btn" data-act="close">Schliessen</button></div>`, false, false); }
}
async function shareFile(file) {
  if (navigator.canShare && navigator.share) {
    let ok = false; try { ok = navigator.canShare({ files: [file] }); } catch (e) { ok = false; }
    if (ok) {
      try { await navigator.share({ files: [file] }); return true; }
      catch (e) { if (e.name === 'AbortError') return false; }
    }
  }
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
async function onRestoreFile(file) {
  let payload;
  try { payload = JSON.parse(await file.text()); } catch (e) { toast('Diese Datei ist kein Backup von Diarium.'); return; }
  if (!payload || !['diarium-backup', 'zf-agenda-backup'].includes(payload.fmt) || !payload.kdf) { toast('Diese Datei ist kein Backup von Diarium.'); return; }
  S.restoreData = payload;
  const created = payload.created ? new Date(payload.created) : null;
  openModal(`<h3>Backup wiederherstellen</h3>
    <p class="help">Backup vom <b>${created ? fmtD(created) + created.getFullYear() + ' ' + hhmm(created.getHours() * 60 + created.getMinutes()) : 'unbekannt'}</b>. Gib die Backup-Passphrase ein, mit der es erstellt wurde.</p>
    <form id="restoreForm" class="col" autocomplete="off">
      <label class="lbl" for="rp">Backup-Passphrase</label><input class="inp" id="rp" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">
      <p class="err" id="rperr"></p>
      <div class="row"><span class="spacer"></span><button type="button" class="btn" data-act="close">Abbrechen</button><button class="btn pri" type="submit" id="rpbtn">Entschlüsseln</button></div>
    </form>`);
}
async function doRestoreDecrypt() {
  const p = S.restoreData, btn = $('#rpbtn'), err = $('#rperr');
  btn.disabled = true; btn.textContent = 'Entschlüssle …';
  let st;
  try {
    const key = await deriveKey($('#rp').value, unb64(p.kdf.salt), p.kdf.iter);
    st = migrate(await decryptJSON(key, p));
  } catch (e) { err.textContent = 'Falsche Passphrase oder beschädigte Datei.'; btn.disabled = false; btn.textContent = 'Entschlüsseln'; return; }
  S.restoreData = null;
  if (S.mode === 'open') {
    S.pendingRestore = st;
    const n = Object.values(st.weeks).reduce((a, w) => a + w.blocks.length, 0);
    openModal(`<h3>Daten ersetzen?</h3><p>Das Backup enthält ${n} Blöcke, ${st.kader.length} Kader, ${st.truppe.soldiers.length} Angehörige und ${st.pend.items.length} Pendenzen.</p>
      <p class="help"><b>Alle aktuellen Daten auf diesem Gerät werden durch das Backup ersetzt.</b> Dein Code bleibt gleich.</p>
      <div class="row"><span class="spacer"></span><button class="btn" data-act="close">Abbrechen</button><button class="btn warn" data-act="restoreconfirm">Ersetzen</button></div>`, false, false);
  } else {
    S.setup = { restored: st, codeType: S.codeType || 'pin' }; S.mode = 'setup'; S.forgot = false; closeModal(); render();
  }
}

/* ================= calendar export (.ics) ================= */
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsFold(line) {
  if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '', curB = 0, lim = 75;
  for (const ch of line) { const b = enc.encode(ch).length; if (curB + b > lim) { out.push(cur); cur = ''; curB = 0; lim = 74; } cur += ch; curB += b; }
  out.push(cur); return out.join('\r\n ');
}
const icsLocal = (date, min) => { const d = addDays(date, Math.floor(min / 1440)); const m = min % 1440; return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`; };
const icsUTC = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const icsDate = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
function buildICS(o) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Diarium//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Diarium', 'X-WR-TIMEZONE:Europe/Zurich',
    'BEGIN:VTIMEZONE', 'TZID:Europe/Zurich',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE'];
  const stamp = icsUTC(new Date());
  let n = 0;
  for (const [key, w] of Object.entries(S.state.weeks)) {
    const mon = mondayFromKey(key);
    for (const b of w.blocks) {
      if (b.ex || !o.layers[b.k]) continue;
      const date = addDays(mon, b.day);
      if (date < o.from || date >= o.to) continue;
      const e = eff(b);
      L.push('BEGIN:VEVENT', `UID:b-${b.id}@diarium`, `DTSTAMP:${stamp}`, `SEQUENCE:${b.rev || 0}`,
        `DTSTART;TZID=Europe/Zurich:${icsLocal(date, b.s)}`, `DTEND;TZID=Europe/Zurich:${icsLocal(date, b.e)}`,
        `SUMMARY:${icsEsc(blkLabel(b))}`);
      if (b.ort) L.push(`LOCATION:${icsEsc(b.ort)}`);
      const c = catOf(b); if (c) L.push(`CATEGORIES:${icsEsc(c.name)}`);
      L.push(`DESCRIPTION:${icsEsc(LAYER_LONG[b.k] + (e ? ' · ' + PR_LABEL[e] : ''))}`);
      if (o.alarm > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(blkLabel(b))}`, `TRIGGER:-PT${o.alarm}M`, 'END:VALARM');
      L.push('END:VEVENT'); n++;
    }
  }
  if (o.pend) for (const p of S.state.pend.items) {
    if (p.done || !p.bis) continue;
    const d = parseYmd(p.bis); if (d < o.from || d >= o.to) continue;
    L.push('BEGIN:VEVENT', `UID:p-${p.id}@diarium`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(d)}`, `DTEND;VALUE=DATE:${icsDate(addDays(d, 1))}`, `SUMMARY:${icsEsc('Pendenz: ' + p.t)}`, 'TRANSP:TRANSPARENT');
    if (o.alarm > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc('Pendenz: ' + p.t)}`, 'TRIGGER:PT7H', 'END:VALARM');
    L.push('END:VEVENT'); n++;
  }
  L.push('END:VCALENDAR');
  return { text: L.map(icsFold).join('\r\n') + '\r\n', n };
}
function icsModal() {
  const o = S.state.settings.ics, kw = isoWeek(S.mon).w;
  openModal(`<h3>Kalender-Export</h3>
    <p class="help">Erstellt eine .ics-Datei für Apple Kalender oder Google Kalender. Exportiert werden nur Termine und Pendenzen mit Termin – keine Kader- oder Truppendaten, keine Notizen.</p>
    <div class="field"><span class="lbl">Zeitraum</span><div class="seg"><label><input type="radio" name="icsr" value="w" ${o.r === 'w' ? 'checked' : ''}><span>KW ${kw}</span></label><label><input type="radio" name="icsr" value="4" ${o.r === '4' ? 'checked' : ''}><span>4 Wochen ab KW ${kw}</span></label><label><input type="radio" name="icsr" value="all" ${o.r === 'all' ? 'checked' : ''}><span>Alles ab heute</span></label></div></div>
    <div class="field"><span class="lbl">Inhalt</span><div class="row">
      ${LAYERS.map(([k]) => `<label class="toggle"><input type="checkbox" id="ics-${k}" ${o[k] ? 'checked' : ''}>${LAYER_LONG[k]}</label>`).join('')}
      <label class="toggle"><input type="checkbox" id="ics-p" ${o.p ? 'checked' : ''}>Pendenzen</label></div></div>
    <div class="field" style="max-width:260px"><label class="lbl" for="ics-a">Erinnerung</label><select class="inp" id="ics-a">${[[0, 'keine'], [5, '5 Min. vorher'], [10, '10 Min. vorher'], [15, '15 Min. vorher'], [30, '30 Min. vorher'], [60, '1 Std. vorher']].map(([v, t]) => `<option value="${v}" ${o.alarm === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <p class="help">Auf dem iPad: «Exportieren» → «Kalender» oder «In Dateien sichern» und die Datei antippen. Beim Import wählst du den Zielkalender – auch einen Google-Kalender, wenn dein Google-Konto auf dem iPad eingerichtet ist. Jeder Termin hat eine feste ID, damit ein erneuter Import ihn aktualisieren statt verdoppeln kann – prüfe das beim ersten Mal in deinem Kalender. Gelöschte Blöcke entfernst du im Kalender selbst.</p>
    <div class="row"><span class="spacer"></span><button class="btn" data-act="close">Abbrechen</button><button class="btn pri" data-act="icsdo">Exportieren</button></div>`, false, false);
}
function doICS() {
  const o = S.state.settings.ics;
  o.r = ($('#modalRoot input[name=icsr]:checked') || {}).value || '4';
  LAYERS.forEach(([k]) => o[k] = $('#ics-' + k).checked);
  o.p = $('#ics-p').checked; o.alarm = +$('#ics-a').value;
  const from = o.r === 'all' ? mondayOf(new Date()) : S.mon;
  const to = o.r === 'w' ? addDays(S.mon, 7) : o.r === '4' ? addDays(S.mon, 28) : new Date(2100, 0, 1);
  const { text, n } = buildICS({ from: o.r === 'all' ? parseYmd(todayStr()) : from, to, layers: { kp: o.kp, kader: o.kader, ich: o.ich }, pend: o.p, alarm: o.alarm });
  commit(false);
  if (!n) { toast('Keine Termine im gewählten Zeitraum.'); return; }
  const file = new File([text], `diarium-KW${isoWeek(from).w}.ics`, { type: 'text/calendar' });
  shareFile(file).then(ok => { if (ok) { closeModal(); toast(`${n} Termine exportiert.`); } });
}

/* ================= events ================= */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (a === 'ovclose') { if (e.target === el) closeModal(); return; }
  if (a === 'close') return closeModal();
  /* lock / setup */
  if (a === 'forgot') { S.forgot = true; render(); return; }
  if (a === 'forgotback') { S.forgot = false; render(); return; }
  if (a === 'restorepick') { $('#fileIn').value = ''; $('#fileIn').click(); return; }
  if (a === 'wipe') {
    if (!arm(el, 'wipe', 'Wirklich alles löschen?')) return;
    S.confirm = null; await kvClear(); Vault.lock(); S.state = null; S.forgot = false; S.mode = 'setup'; S.setup = { restored: null, codeType: 'pin' }; closeModal(); render(); toast('Alle Daten gelöscht.'); return;
  }
  if (S.mode !== 'open') return;
  if (a === 'go') { if (el.dataset.close) closeModal(); S.view = id; S.confirm = null; try { history.replaceState(null, '', '#' + id); } catch (_) { } render(); window.scrollTo(0, 0); return; }
  if (a === 'lock') return lockNow();
  if (a === 'update') { await Vault.flush(); if (S.reg && S.reg.waiting) S.reg.waiting.postMessage('skipWaiting'); else location.reload(); return; }
  /* week */
  if (a === 'wprev' || a === 'wnext' || a === 'wtoday') { S.mon = a === 'wtoday' ? mondayOf(new Date()) : addDays(S.mon, a === 'wprev' ? -7 : 7); S.scrolled = S.view === 'woche'; render(); return; }
  if (a === 'mday') { S.mDay = +el.dataset.d; render(); return; }
  if (a === 'newblk') { const d = narrow.matches || S.wkMode === 'tag' ? S.mDay : (mondayOf(new Date()).getTime() === S.mon.getTime() ? todayIdx() : 0); return blockModal({ k: 'ich', t: '', day: d, s: 1140, e: 1200, ort: '', n: '' }, true); }
  if (a === 'newat') {
    if (e.target !== el && !e.target.classList.contains('free')) return;
    const r = el.getBoundingClientRect(), m = T0 + Math.floor(((e.clientY - r.top) / PXH * 60) / 15) * 15;
    return blockModal({ k: el.dataset.k || 'ich', t: '', day: +el.dataset.day, s: m, e: Math.min(m + 60, T1), ort: '', n: '' }, true);
  }
  if (a === 'editblk') { const b = W().blocks.find(x => x.id === id); if (b) blockModal(b, false); return; }
  if (a === 'bday') { el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); if (S.draft && S.draft.isNew) { const d = +el.dataset.d; S.draft.days.has(d) ? S.draft.days.delete(d) : S.draft.days.add(d); } return; }
  if (a === 'bdays') { S.draft.days = new Set([0, 1, 2, 3, 4]); $$('#modalRoot [data-act=bday]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.d < 5 ? 'true' : 'false')); return; }
  if (a === 'catchip') { S.draft.kat = id || null; S.draft.newCat = false; rerenderBlockModal(); return; }
  if (a === 'catnew') { S.draft.newCat = !S.draft.newCat; rerenderBlockModal(); return; }
  if (a === 'nccolor') { S.draft.ncColor = el.dataset.c; $$('#modalRoot [data-act=nccolor]').forEach(b => b.setAttribute('aria-pressed', b === el ? 'true' : 'false')); return; }
  if (a === 'catcreate') {
    const name = $('#ncName').value.trim(); if (!name) { $('#ncName').focus(); return; }
    let c = S.state.cats.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!c) { c = { id: nid(), name, color: S.draft.ncColor || nextColor(), pr: ($('#modalRoot input[name=ncpr]:checked') || {}).value || '?' }; S.state.cats.push(c); S.catMap.set(c.id, c); commit(); }
    S.draft.kat = c.id; S.draft.newCat = false;
    const t = $('#bt'); if (t && t.value.trim().toLowerCase() === name.toLowerCase()) t.value = '';
    rerenderBlockModal(); return;
  }
  if (a === 'saveblk') return saveBlock();
  if (a === 'delblk') { const wd = W(); wd.blocks = wd.blocks.filter(b => b.id !== id); commit(); closeModal(); render(); return; }
  if (a === 'classify') {
    const key = el.dataset.key, v = el.dataset.v;
    let name;
    if (key.startsWith('k:')) { const c = S.catMap.get(key.slice(2)); if (!c) return; c.pr = v; name = c.name; }
    else {
      const t = key.slice(2);
      let c = S.state.cats.find(x => x.name.trim().toLowerCase() === t);
      const sample = Object.values(S.state.weeks).flatMap(w => w.blocks).find(b => (b.t || '').trim().toLowerCase() === t);
      if (!c) { c = { id: nid(), name: sample ? sample.t.trim() : t, color: nextColor(), pr: v }; S.state.cats.push(c); } else c.pr = v;
      for (const w of Object.values(S.state.weeks)) for (const b of w.blocks) if (b.k !== 'ich' && !b.kat && (b.t || '').trim().toLowerCase() === t) { b.kat = c.id; b.t = ''; }
      for (const r of S.state.template) if (!r.kat && (r.t || '').trim().toLowerCase() === t) r.kat = c.id;
      name = c.name;
    }
    commit(); render(); toast(`«${name}» gilt jetzt als ${PR_LABEL[v]} – auch in künftigen Wochen.`); return;
  }
  if (a === 'tplopen') return tplModal();
  if (a === 'tday') { el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); return; }
  if (a === 'tplapply') return applyTemplate();
  if (a === 'import') return importModal();
  if (a === 'doimport') {
    const { out } = parseProgram($('#imp').value); if (!out.length) { toast('Keine Zeile erkannt. Format: «Mo 0730-1145 Titel».'); return; }
    const k = $('#modalRoot input[name=ik]:checked').value;
    W().blocks.push(...out.map(b => { const kat = matchCat(b.t); return { id: nid(), k, n: '', rev: 0, ...b, kat, t: kat ? '' : b.t }; }));
    commit(); closeModal(); render(); toast(`${out.length} Blöcke übernommen.`); return;
  }
  if (a === 'copyprev') {
    openModal(`<h3>Vorwoche übernehmen</h3><p class="help">Kopiert die Blöcke aus KW ${isoWeek(addDays(S.mon, -7)).w} in diese Woche. Bestehende Blöcke bleiben.</p>
      <div class="row"><span class="spacer"></span><button class="btn" data-act="close">Abbrechen</button><button class="btn" data-act="docopy" data-id="kp">Ohne meine Blöcke</button><button class="btn pri" data-act="docopy" data-id="all">Alle Blöcke</button></div>`, false, false); return;
  }
  if (a === 'docopy') {
    const prev = S.state.weeks[weekKey(addDays(S.mon, -7))];
    const src = prev ? prev.blocks.filter(b => !b.ex && (id === 'all' || b.k !== 'ich')) : [];
    if (!src.length) { closeModal(); toast('Die Vorwoche enthält keine passenden Blöcke.'); return; }
    W().blocks.push(...src.map(b => ({ ...clone(b), id: nid(), rev: 0 }))); commit(); closeModal(); render(); toast(`${src.length} Blöcke übernommen.`); return;
  }
  if (a === 'sample') return sampleWeek();
  if (a === 'clearex') { const wd = W(); wd.blocks = wd.blocks.filter(b => !b.ex); commit(false); render(); return; }
  if (a === 'icsopen') return icsModal();
  if (a === 'icsdo') return doICS();
  /* rapporte */
  if (a === 'rday') { S.rapDay = +el.dataset.d; render(); return; }
  if (a === 'topend') {
    const k = el.dataset.k, key = ymd(addDays(S.mon, S.rapDay)), day = S.state.raps[key];
    const lines = (day && day[k].a || '').split(/\n/).map(x => x.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
    if (!lines.length) { toast('Keine Aufträge eingetragen.'); return; }
    const src = (k === 'eh' ? 'ER ' : 'AR ') + fmtD(addDays(S.mon, S.rapDay));
    const have = new Set(S.state.pend.items.map(i => i.src + '|' + i.t));
    const add = lines.filter(t => !have.has(src + '|' + t)).map(t => ({ id: nid(), t, bis: '', done: false, src }));
    S.state.pend.items.push(...add); commit(); render(); toast(add.length ? `${add.length} Pendenz(en) erfasst.` : 'Bereits übernommen.'); return;
  }
  /* ausbildung */
  if (a === 'ausbprev' || a === 'ausbnext' || a === 'ausbtoday') { S.ausbStart = a === 'ausbtoday' ? mondayOf(new Date()) : addDays(S.ausbStart, a === 'ausbprev' ? -28 : 28); render(); return; }
  if (a === 'ausbadd') {
    const inp = $(`[data-ausbnew="${el.dataset.wk}"]`), t = inp ? inp.value.trim() : ''; if (!t) { inp && inp.focus(); return; }
    S.state.ausb.push({ id: nid(), wk: el.dataset.wk, t, verantw: '', ziel: '', n: '', aga: '', st: 0 }); commit(); render();
    const again = $(`[data-ausbnew="${el.dataset.wk}"]`); if (again) again.focus(); return;
  }
  if (a === 'ausbst') { const i = S.state.ausb.find(x => x.id === id); i.st = ((i.st || 0) + 1) % 3; commit(); render(); return; }
  if (a === 'ausbedit') { const i = S.state.ausb.find(x => x.id === id); if (i) ausbModal(i); return; }
  if (a === 'ausbsave') {
    const i = S.state.ausb.find(x => x.id === id); const t = $('#at').value.trim(); if (!t) { $('#at').focus(); return; }
    const w = $('#aw').value;
    Object.assign(i, { t, wk: w ? ymd(mondayOf(parseYmd(w))) : '', verantw: $('#av').value.trim(), aga: $('#ag').value, st: +(($('#modalRoot input[name=ast]:checked') || {}).value || 0), ziel: $('#az').value, n: $('#an').value });
    commit(); closeModal(); render(); return;
  }
  if (a === 'ausbdel') { if (!arm(el, 'ausbdel' + id, 'Wirklich löschen?')) return; S.state.ausb = S.state.ausb.filter(x => x.id !== id); commit(); closeModal(); render(); return; }
  /* kader */
  if (a === 'addp') {
    const v = $('#npname').value.trim(); if (!v) return; const p = v.split(/\s+/);
    const person = { id: nid(), grad: p.length > 2 ? p[0] : '', name: p.length > 2 ? p[1] : p[0], vorname: p.length > 2 ? p.slice(2).join(' ') : (p[1] || ''), fn: '', obs: [] };
    S.state.kader.push(person); S.selPerson = person.id; commit(); render(); return;
  }
  if (a === 'selp') { S.selPerson = id; render(); return; }
  if (a === 'addobs') {
    const p = S.state.kader.find(x => x.id === (S.selPerson || (S.state.kader[0] || {}).id)); const t = $('#otx').value.trim(); if (!p || !t) return;
    p.obs.push({ id: nid(), d: $('#od').value || todayStr(), typ: $('#ot').value, t }); commit(); render(); const o = $('#otx'); if (o) o.focus(); return;
  }
  if (a === 'delobs') { S.state.kader.forEach(p => p.obs = p.obs.filter(o => o.id !== id)); commit(); render(); return; }
  if (a === 'delp') { if (!arm(el, 'delp' + id, 'Wirklich entfernen?')) return; S.state.kader = S.state.kader.filter(p => p.id !== id); S.selPerson = null; commit(); render(); return; }
  /* truppe */
  if (a === 'grp') { S.grp = id; S.mxLeft = 0; render(); return; }
  if (a === 'addsol') return solModal(null);
  if (a === 'editsol') return solModal(S.state.truppe.soldiers.find(s => s.id === id));
  if (a === 'savesols') {
    const rows = $('#soltx').value.split(/\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const p = l.split(/\s+/); let gr = '';
      const gi = p.findIndex((x, i) => i >= 3 && /^(gr|grp|gruppe)$/i.test(x));
      if (gi > 0) { gr = p.slice(gi).join(' '); p.length = gi; } else if (p.length > 3) { gr = p.slice(3).join(' '); p.length = 3; }
      return { id: nid(), grad: p[0] || '', name: p[1] || '', vorname: p[2] || '', gr, notes: [] };
    });
    if (!rows.length) return; S.state.truppe.soldiers.push(...rows); commit(); closeModal(); render(); toast(`${rows.length} AdA erfasst.`); return;
  }
  if (a === 'savesol') { const s = S.state.truppe.soldiers.find(x => x.id === id); applySolFields(s); commit(); closeModal(); render(); return; }
  if (a === 'soladdnote') {
    const s = S.state.truppe.soldiers.find(x => x.id === id); const t = $('#snt').value.trim(); if (!t) { $('#snt').focus(); return; }
    applySolFields(s); s.notes.push({ id: nid(), d: $('#snd').value || todayStr(), t }); commit(); solModal(s); render(); return;
  }
  if (a === 'soldelnote') { const s = S.state.truppe.soldiers.find(x => x.id === el.dataset.s); applySolFields(s); s.notes = s.notes.filter(n => n.id !== id); commit(); solModal(s); render(); return; }
  if (a === 'delsol') { if (!arm(el, 'delsol' + id, 'Wirklich entfernen?')) return; const T = S.state.truppe; T.soldiers = T.soldiers.filter(s => s.id !== id); delete T.marks[id]; commit(); closeModal(); render(); return; }
  if (a === 'mark') { const s = el.dataset.s, i = el.dataset.i, M = S.state.truppe.marks; M[s] = M[s] || {}; const v = ((M[s][i] || 0) + 1) % 3; if (v) M[s][i] = v; else delete M[s][i]; commit(); render(); return; }
  if (a === 'additem') { const t = $('#newitem').value.trim(); if (!t) return; S.state.truppe.custom.push({ id: 'c' + nid(), g: S.grp, t }); commit(); render(); return; }
  if (a === 'delitem') { e.stopPropagation(); if (!arm(el, 'delitem' + id, '?')) return; S.state.truppe.custom = S.state.truppe.custom.filter(c => c.id !== id); commit(); render(); return; }
  /* pendenzen */
  if (a === 'padd') { const t = $('#ptx').value.trim(); if (!t) return; S.state.pend.items.push({ id: nid(), t, bis: $('#pbis').value, done: false, src: '' }); commit(); render(); const p = $('#ptx'); if (p) p.focus(); return; }
  if (a === 'pdone') { const i = S.state.pend.items.find(x => x.id === id); i.done = el.checked; i.doneAt = el.checked ? todayStr() : ''; commit(); render(); return; }
  if (a === 'pdel') { S.state.pend.items = S.state.pend.items.filter(x => x.id !== id); commit(); render(); return; }
  if (a === 'pclear') { S.state.pend.items = S.state.pend.items.filter(x => !x.done); commit(); render(); return; }
  /* settings */
  if (a === 'catadd') { const n = $('#newcat').value.trim(); if (!n) return; if (S.state.cats.some(c => c.name.toLowerCase() === n.toLowerCase())) { toast('Diese Kategorie gibt es schon.'); return; } S.state.cats.push({ id: nid(), name: n, color: nextColor(), pr: '?' }); commit(); render(); return; }
  if (a === 'catcolor') { const c = S.state.cats.find(x => x.id === id); c.color = COLORS[(COLORS.indexOf(c.color) + 1) % COLORS.length]; commit(); render(); return; }
  if (a === 'catdel') {
    if (!arm(el, 'catdel' + id, '?')) return;
    const c = S.state.cats.find(x => x.id === id);
    for (const w of Object.values(S.state.weeks)) for (const b of w.blocks) if (b.kat === id) { b.kat = null; b.t = b.t || c.name; }
    for (const r of S.state.template) if (r.kat === id) { r.kat = null; r.t = r.t || c.name; }
    S.state.cats = S.state.cats.filter(x => x.id !== id); commit(); render(); return;
  }
  if (a === 'tpladd') { S.state.template.push({ id: nid(), t: '', s: 720, e: 780, k: 'kp', kat: null }); commit(); render(); return; }
  if (a === 'tpldel') { S.state.template = S.state.template.filter(r => r.id !== id); commit(); render(); return; }
  if (a === 'backup') return backupModal();
  if (a === 'bkshare') {
    if (!S.file) return;
    const ok = await shareFile(S.file);
    if (ok) { S.state.meta.lastBackup = Date.now(); S.state.meta.dirtySinceBackup = false; commit(false); S.file = null; closeModal(); render(); toast('Backup gesichert.'); }
    return;
  }
  if (a === 'bkpass') return passModal(true);
  if (a === 'restoreconfirm') {
    if (!S.pendingRestore) return closeModal();
    S.state = S.pendingRestore; S.pendingRestore = null; S.scrolled = false; commit(false); await Vault.flush(); closeModal(); render(); toast('Backup wiederhergestellt.'); return;
  }
  if (a === 'codechange') {
    openModal(`<h3>Code ändern</h3><div class="seg"><label><input type="radio" name="nctype" value="pin" ${S.codeType === 'pin' ? 'checked' : ''}><span>PIN (Ziffern)</span></label><label><input type="radio" name="nctype" value="pass" ${S.codeType === 'pass' ? 'checked' : ''}><span>Passphrase</span></label></div>
      <form id="codeForm" class="col" autocomplete="off">
        <label class="lbl" for="nc1">Neuer Code</label><input class="inp" id="nc1" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false">
        <label class="lbl" for="nc2">Wiederholen</label><input class="inp" id="nc2" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false">
        <p class="help">PIN: mindestens 6 Ziffern. Passphrase: mindestens 8 Zeichen.</p><p class="err" id="ncerr"></p>
        <div class="row"><span class="spacer"></span><button type="button" class="btn" data-act="close">Abbrechen</button><button class="btn pri" type="submit" id="ncbtn">Ändern</button></div>
      </form>`); return;
  }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.id;
  if (f === 'unlockForm') return doUnlock();
  if (f === 'setupForm') return doSetup();
  if (f === 'passForm') return setBackupPass();
  if (f === 'restoreForm') return doRestoreDecrypt();
  if (f === 'codeForm') {
    const type = ($('#modalRoot input[name=nctype]:checked') || {}).value || 'pin', c1 = $('#nc1').value, c2 = $('#nc2').value, err = $('#ncerr');
    if (!validCode(c1, type)) { err.textContent = type === 'pin' ? 'Die PIN braucht mindestens 6 Ziffern.' : 'Die Passphrase braucht mindestens 8 Zeichen.'; return; }
    if (c1 !== c2) { err.textContent = 'Die beiden Eingaben stimmen nicht überein.'; return; }
    const btn = $('#ncbtn'); btn.disabled = true; btn.textContent = 'Verschlüssle neu …';
    await Vault.flush(); await Vault.changeCode(c1, type); S.codeType = type; closeModal(); toast('Code geändert.');
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.name === 'ctype') { S.setup.codeType = el.value; render(); return; }
  if (el.id === 'fileIn') { const f = el.files && el.files[0]; if (f) onRestoreFile(f); return; }
  if (S.mode !== 'open') return;
  if (el.dataset.act === 'layer') { S.layers[el.dataset.k] = el.checked; render(); return; }
  if (el.dataset.act === 'grfilter') { S.grFilter = el.value; render(); return; }
  if (el.name === 'wkmode') { S.wkMode = el.value; S.scrolled = true; render(); return; }
  if (el.name === 'bk' && S.draft) { S.draft.k = el.value; rerenderBlockModal(); return; }
  if (el.dataset.settime) {
    const k = el.dataset.settime, v = fromTI(el.value, k === 'dayEnd'), st = S.state.settings;
    const ds = k === 'dayStart' ? v : st.dayStart, de = k === 'dayEnd' ? v : st.dayEnd;
    if (v == null || de <= ds || ds < T0) { toast('Ungültiges Planungsfenster.'); el.value = toTI(st[k]); return; }
    st[k] = v; commit(false); return;
  }
  if (el.dataset.setnum) { S.state.settings[el.dataset.setnum] = +el.value; commit(false); paintBanners(); return; }
  if (el.dataset.catpr) { const c = S.state.cats.find(x => x.id === el.dataset.catpr); c.pr = el.value; commit(); return; }
  if (el.dataset.tpl) {
    const r = S.state.template.find(x => x.id === el.dataset.tpl), f = el.dataset.f;
    if (f === 's' || f === 'e') { const v = fromTI(el.value, f === 'e'); if (v == null) return; r[f] = v; if (r.e <= r.s) { toast('«Bis» muss nach «Von» liegen.'); } }
    else if (f === 'kat') r.kat = el.value || null;
    commit(false); return;
  }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'imp') {
    const { out, bad } = parseProgram(el.value);
    $('#iprev').innerHTML = `${out.length} Blöcke erkannt` + (bad.length ? ` · <span style="color:var(--danger)">${bad.length} Zeile(n) nicht erkannt: ${esc(bad.slice(0, 2).join(' / '))}${bad.length > 2 ? ' …' : ''}</span>` : '');
    return;
  }
  if (S.mode !== 'open' || !S.state) return;
  if (el.id === 'wlabel') { W().label = el.value; commit(); return; }
  if (el.dataset.rap) { const [k, f] = el.dataset.rap.split('.'); rapDay(ymd(addDays(S.mon, S.rapDay)))[k][f] = el.value; commit(); return; }
  if (el.dataset.kp) {
    const p = S.state.kader.find(x => x.id === (S.selPerson || (S.state.kader[0] || {}).id)); if (!p) return;
    p[el.dataset.kp] = el.value; commit();
    const b = $(`.plist [data-id="${p.id}"] span`); if (b) b.textContent = `${p.grad} ${p.name} ${p.vorname}`; return;
  }
  if (el.id === 'pnotes') { S.state.pend.notes = el.value; commit(); return; }
  if (el.dataset.set) { S.state.settings[el.dataset.set] = el.value; commit(false); return; }
  if (el.dataset.catname) { const c = S.state.cats.find(x => x.id === el.dataset.catname); if (el.value.trim()) { c.name = el.value.trim(); commit(); } return; }
  if (el.dataset.tpl && el.dataset.f === 't') { S.state.template.find(x => x.id === el.dataset.tpl).t = el.value; commit(false); return; }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalOpen()) { closeModal(); return; }
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  const t = e.target;
  const map = { npname: 'addp', otx: 'addobs', newitem: 'additem', ptx: 'padd', newcat: 'catadd', snt: 'soladdnote', ncName: 'catcreate' };
  let act = map[t.id];
  if (t.dataset && t.dataset.ausbnew !== undefined) { e.preventDefault(); const b = $(`[data-act="ausbadd"][data-wk="${t.dataset.ausbnew}"]`); if (b) b.click(); return; }
  if (act) { e.preventDefault(); const b = document.querySelector(`#modalRoot [data-act="${act}"]`) || document.querySelector(`[data-act="${act}"]`); if (b) b.click(); }
});

window.addEventListener('hashchange', () => {
  if (S.mode !== 'open') return;
  const h = location.hash.slice(1);
  if ((TABS.some(t => t[0] === h) || h === 'einstellungen') && h !== S.view) { S.view = h; render(); }
});

/* auto-lock & save on leave */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { S.hiddenAt = Date.now(); Vault.flush(); }
  else if (S.mode === 'open' && S.state) {
    const lim = S.state.settings.autoLockMin * 60000;
    if (S.hiddenAt && Date.now() - S.hiddenAt >= lim) lockNow();
    else if (S.view === 'woche' && !modalOpen()) render();
    if (S.reg) S.reg.update().catch(() => { });
  }
});
window.addEventListener('pagehide', () => { Vault.flush(); });
setInterval(() => { if (S.mode === 'open' && S.view === 'woche' && !modalOpen() && document.activeElement && document.activeElement.id !== 'wlabel') render(); }, 5 * 60000);

/* ================= service worker ================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      S.reg = reg;
      const check = () => { if (reg.waiting && navigator.serviceWorker.controller) { S.updateReady = true; if (S.mode === 'open') paintBanners(); } };
      check();
      reg.addEventListener('updatefound', () => { const nw = reg.installing; if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed') check(); }); });
    } catch (e) { console.warn('Service Worker nicht verfügbar', e); }
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
}

/* ================= boot ================= */
(async () => {
  if (!window.crypto || !crypto.subtle || !window.indexedDB) {
    $('#root').innerHTML = '<div class="boot">Dieser Browser unterstützt die nötige Verschlüsselung nicht. Öffne die App über https in Safari.</div>';
    return;
  }
  try {
    DB = await openDB();
    const cfg = (await kvGet('cfg')) || {};
    S.codeType = cfg.codeType || 'pin';
    S.mode = (await Vault.exists()) ? 'locked' : 'setup';
  } catch (e) {
    console.error(e);
    $('#root').innerHTML = '<div class="boot">Der Gerätespeicher ist nicht verfügbar. Ist ein privates Fenster geöffnet?</div>';
    return;
  }
  render();
})();
})();
