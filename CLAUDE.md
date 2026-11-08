# Diarium – project brief for Claude Code

Read this before changing anything. It covers what the app is, how it is built, decisions already made (and why), the source documents it is based on, and the backlog.

---

## 1. What Diarium is

A personal planning app for a **Swiss Army officer cadet / future platoon leader (Zugführer)**. It is the digital version of the official paper agenda that subaltern officers carry (see §8 Sources). It runs as an **offline PWA on the owner's iPad**, installed from Safari to the home screen.

- **Live:** https://oliver-ammann.github.io/diarium/ (GitHub Pages, branch `main`, root)
- **Repo:** https://github.com/oliver-ammann/diarium (public – code only, never data)
- **Version:** 1.0.0 (`APP_VERSION` in `app.js`, `VERSION` in `sw.js`)
- **Owner works in:** German (Swiss). The UI is German with Swiss spelling (**ss, never ß**) and Swiss Army terms/abbreviations. The owner chats in English.

### Core idea
The company timetable (Kp-Programm) is entered as blocks. The owner marks per **category** whether he must be present (**Präsenz**) or not (**frei**). The app computes the **free windows** in which he can plan his own blocks, and flags his own blocks that collide with required ones.

---

## 2. Hard rules

1. **No personal data in the repo, ever.** No names, unit/class identifiers, timetables or screenshots with real data. The repo is public.
2. **No network calls.** No analytics, no CDNs, no fonts from the web, no external APIs. CSP in `index.html` is `default-src 'self'` – keep it that way. System fonts only.
3. **Never break existing data.** User data lives encrypted in IndexedDB on the iPad. Every state change must be backward compatible: add defaults in `freshState()` and merge in `migrate()`. Never rename the IndexedDB name (`diarium`) or the store (`kv`).
4. **Bump `VERSION` in `sw.js` on every release** (e.g. `diarium-1.0.1`) and keep `APP_VERSION` in sync. Otherwise installed apps never get the update. Add any new asset file to the `ASSETS` list in `sw.js`.
5. **Präsenz is never guessed.** New program blocks are `unklar` and do **not** count as free time until the owner classifies them.
6. **No build step.** Plain HTML/CSS/vanilla JS so the owner can upload files directly. No frameworks, no bundler, no npm runtime dependencies.
7. UI copy: German (Swiss), short, plain. iPad-first: touch targets ≥ 40px, input font-size 16px (prevents iOS zoom), must work in portrait (820px), landscape (1180px) and phone width (~390px), light and dark mode.

---

## 3. Files

| File | Purpose |
|---|---|
| `index.html` | Shell, meta tags for iOS standalone, CSP, loads `styles.css` + `app.js` |
| `app.js` | Entire app (~1100 lines, one IIFE, sections marked `/* ===== … ===== */`) |
| `styles.css` | Design tokens (light/dark), all component styles |
| `sw.js` | Service worker: cache-first app shell, update via `skipWaiting` message |
| `manifest.webmanifest` | PWA manifest (name/short_name "Diarium", relative `start_url`/`scope` for the Pages subpath) |
| `icons/` | 180 (apple-touch), 192, 512, maskable 512 – generic calendar glyph, no army/Swiss symbols |
| `ANLEITUNG.md` | German install guide for the owner (GitHub Pages + iPad install + backup) |
| `CLAUDE.md` | This file |

All paths are relative (`./`) because the app lives under `/diarium/` on GitHub Pages.

---

## 4. Architecture (app.js)

### Sections in order
helpers → constants (DAYS, T0/T1, COLORS, AGA `GROUPS`) → crypto → IndexedDB → `Vault` → state (`freshState`, `migrate`, `prune`, `S`) → status/toast/modal → render + header/banners → lock & setup → week computations → views (Woche, block editor, template, text import, sample, Rapporte, Ausbildung, Kader, Truppe, Pendenzen, Einstellungen) → backup/restore → ICS export → event delegation (click/submit/change/input/keydown) → auto-lock → service worker registration → boot.

### Rendering pattern
- Global UI state object `S`; persistent data in `S.state`.
- `render()` rebuilds `#root` via template strings. Always escape user text with `esc()`.
- All interaction goes through **event delegation** on `document` using `data-act="…"` attributes (plus `data-*` fields for inputs). Add new actions in the big click handler.
- Text inputs mutate state on `input` and call `commit()` **without** re-rendering (keeps focus/cursor). Structural actions call `commit(); render();`.
- Modals: `openModal(html, wide, focus)` into `#modalRoot`; `closeModal()`. Never use `alert/confirm/prompt`. Destructive actions use `arm(el, key, text)` (tap twice within 4s).
- `render()` preserves calendar scroll (`S.calTop`) and matrix horizontal scroll (`S.mxLeft`).

### Persistence & security (`Vault`)
- Whole `S.state` is JSON → **AES-256-GCM**, key derived from the user's PIN/passphrase via **PBKDF2-SHA256, 600 000 iterations**, random 16-byte salt.
- IndexedDB `diarium`, store `kv`, keys: `vault` (current), `vault_prev` (previous write, fallback on corruption), `cfg` (`{codeType: 'pin'|'pass'}`, not secret).
- `commit(dirty=true)` → debounced save (400 ms); `dirty` also sets `meta.dirtySinceBackup`. `Vault.flush()` on `visibilitychange`/`pagehide`.
- Setup: PIN ≥ 6 digits or passphrase ≥ 8 chars. No reset – only restore from backup. 5 wrong tries → growing wait.
- Auto-lock when the app was hidden ≥ `settings.autoLockMin` (default 5; 0 = immediately). Manual lock button.
- `navigator.storage.persist()` requested once after first unlock.

### Service worker / updates
Cache-first for same-origin GETs; navigation falls back to cached `index.html`. A new SW waits; the app shows a banner "Neue Version verfügbar" → posts `skipWaiting` → `controllerchange` → reload → user unlocks again.

---

## 5. Data model (`S.state`, v1)

```js
{
  v: 1,
  settings: { grad, name, einteilung, dayStart: 360, dayEnd: 1320,   // minutes; planning window for free-time calc
              autoLockMin: 5, backupDays: 3,
              ics: { r: 'w'|'4'|'all', kp, kader, ich, p, alarm } },
  cats:     [{ id, name, color, pr: 'p'|'f'|'?' }],                 // block categories with Präsenz default
  template: [{ id, t, s, e, k, kat }],                               // Tagesvorlage (daily recurring blocks)
  weeks:    { 'YYYY-Www': { label, blocks: [Block] } },              // ISO week key
  raps:     { 'YYYY-MM-DD': { eh: {p, a}, au: {p, a} } },            // Einheitsrapport / Ausbildungsrapport: punkte, aufträge
  ausb:     [{ id, wk: 'YYYY-MM-DD'(monday)|'', t, verantw, ziel, n, aga, st: 0|1|2 }],
  kader:    [{ id, grad, name, vorname, fn, obs: [{ id, d, typ: 's'|'w'|'b', t }] }],
  truppe:   { soldiers: [{ id, grad, name, vorname, gr, notes: [{id, d, t}] }],
              custom: [{ id, g, t }],                                // extra AGA topics per group
              marks: { [soldierId]: { [itemId]: 1|2 } } },           // 1 = instruiert, 2 = bestanden
  pend:     { items: [{ id, t, bis, done, doneAt, src }], notes },
  meta:     { created, lastBackup, dirtySinceBackup, backupKey: { salt, iter, raw } | null, persistAsked }
}

Block = { id, day: 0..6 (Mo..So), s, e,          // minutes from midnight, timeline 240 (0400) .. 1440 (2400)
          k: 'kp'|'kader'|'ich',                  // layer: Programm (Truppe) / Kader / Mein Plan
          kat: catId|null, t, ort, n,
          pr: null|'p'|'f',                        // per-block override of the category default
          rev,                                     // bumped on edit → ICS SEQUENCE
          ex?: true }                              // sample data ("Beispielwoche")
```

`prune()` drops empty weeks/rapport days before saving.

### Präsenz logic (central)
- `eff(b)`: `ich` blocks → `null`; else `b.pr` → category `pr` → `'?'`.
- `blocking(b)` = not `ich` and `eff !== 'f'` (so **`?` blocks block**).
- `freeBands(day)` = planning window minus blocking blocks.
- `conflicts()`: own (`ich`) block overlapping a `p` block → red (`conf`); overlapping only `?` → amber (`warn`).
- "Präsenz klären" panel groups `?` blocks by category or exact title; one tap sets the category (or creates it from the title and assigns all matching blocks in all weeks + template).
- `matchCat(title)` auto-assigns categories by exact (case-insensitive) name on save/import/template.

---

## 6. Features (v1.0.0)

**Woche** – week grid 0400–2400 (7 columns; phone: one day + day tabs), or **Tag** view with the paper agenda's three columns *Mein Zeitplan / Zeitplan Kader / Zeitplan Truppe*. Tap empty slot → quick entry (layer, category chips + create category inline, title, times, **multi-day toggles incl. Mo–Fr**, Präsenz override, Ort, Notiz). Edit mode: move day + copy to other days. Toolbar: Tagesvorlage anwenden, Vorwoche übernehmen (all / without own blocks), Text einfügen, Kalender-Export. Layer toggles, legend, sample week. Side panels: Präsenz klären, Mein Plan, Konflikte, Fällig (Pendenzen), Ausbildung this week. Per-day header: free time, conflicts, unclear count.

**Text import format** (optional shortcut):
```
Mo 0715-0730 AV | vor LG
Mo 0730-1145 INTRO | Halle P
Dienstag
0800-0930 Sport (d) | Gel
1215-1300 MiE (frei)
```
Day line applies to following lines; `| ` or `@ ` separates Ort; `(frei)` / `(Präsenz)` suffix sets override.

**Rapporte** – per day: Einheitsrapport + Ausbildungsrapport (Meine Punkte, Erhaltene Aufträge). "Aufträge → Pendenzen" converts each line (deduplicated, `src` = "ER 03.11."). Shows that day's and next day's program.

**Ausbildung** (Ausbildungsplanung) – 8 week panels (pageable by 4), "Später/ohne Termin", "Nicht durchgeführt" for past unfinished items; status chip cycles geplant → vorbereitet → durchgeführt; edit modal with week, Verantwortlich, AGA-Bezug, Ziel, Material.

**Kader** – people list; per person dated observations as Stärken / Schwächen / Beobachtungen.

**Truppe** – AGA training matrix per group (San D, ABC-Abwehr, Pers Waffe, FGA, VBA + custom topics), cell cycles empty → I → ✓, % bestanden per topic; bulk add soldiers ("Grad Name Vorname Gruppe" per line); per-soldier dated notes (Notizen Truppe).

**Pendenzen** – to-dos with due date, overdue/today/this-week chips, done list, free notes.

**Einstellungen** – profile, planning window, categories (color, name, Präsenz, delete), Tagesvorlage editor, backup, auto-lock, change code, storage status, help, wipe all.

**Backup** – separate **backup passphrase** (≥ 10 chars). Derived key is exported and stored inside the encrypted vault (`meta.backupKey`) so later backups need no typing. File: `diarium-backup-YYYY-MM-DD-HHMM.json` = `{ fmt: 'diarium-backup', v: 1, app, created, kdf: {alg, iter, salt}, iv, ct }`. Restore also accepts legacy `fmt: 'zf-agenda-backup'`. Delivered via Web Share (iPad: "In Dateien sichern" → iCloud Drive), fallback `<a download>`. Reminder banner if never backed up or older than `backupDays` with changes since.

**Calendar export (.ics)** – RFC 5545, CRLF, folded at 75 octets, VTIMEZONE Europe/Zurich, stable UIDs `b-<id>@diarium` / `p-<id>@diarium`, `SEQUENCE` = `rev`, optional VALARM. Only blocks (selected layers) and dated Pendenzen as all-day events. **Never** exports Kader/Truppe data or notes. Range: displayed week / 4 weeks / everything from today.

---

## 7. Decisions already made (don't reopen without the owner)

- **PWA, not native.** Native would need a Mac + Xcode; free signing expires after 7 days (app stops opening), paid account 99 USD/yr. PWA: no account, no expiry, works offline. Native/App Store only if it ever goes to other users.
- **Hosting:** GitHub Pages (public repo is fine: code only).
- **Backup = encrypted file to iCloud Drive/Files**, manual tap with reminder. No cloud sync for now. A synced backend (Supabase/Firebase) with client-side encryption is possible later; keep the data model sync-friendly (ids everywhere).
- **Calendar:** one .ics for both Apple and Google (owner may use Gemini with Google Calendar). Schedule items only, neutral content.
- **Company timetable PDFs are not parsed.** The real Arbeitsbefehl is a graphical grid; extraction was judged unreliable. Manual quick entry + template + copy week is the main route.
- **Präsenz cannot be derived from the timetable** – the owner decides per category; unclassified = unklar = not free.
- **Noteful** (owner's general notes app) is unrelated – no integration fields.
- **Apple Pencil:** handwriting into text fields works via iPadOS Scribble. Dedicated sketch areas were deferred (undecided).
- **Name:** "Diarium" (Latin, daily record). Earlier working titles: Zugführer-Agenda / ZF-Agenda.

---

## 8. Sources

The app is modelled on these documents. **They are not in the repo and must not be committed** (official/internal documents; the timetable contains unit and personal details). If the owner provides them locally, keep them in an untracked folder (e.g. add `/quellen/` to `.gitignore`).

### 8.1 Arbeitshilfe 06.031.02 dfi – «Agenda für Subalternoffiziere und höhere Unteroffiziere»
Swiss Armed Forces, trilingual (d/f/i), Stand 01.09.2026, ~234 pages of blank forms. Structure and how Diarium maps it:

| Paper tab | Content | Diarium |
|---|---|---|
| 1 Aktuelle Woche, 2 Nächste Woche, 3 Übernächste Woche, 4 Weitere Wochen | Weekly Arbeitsplan (Form 06.017) + one page per day with three columns: Mein Zeitplan / Zeitplan Kader / Zeitplan Truppe, timeline 0400–2400 | Woche (week grid) + Tag view (three columns); unlimited week navigation |
| per weekday | Vorbereitung Einheitsrapport / Ausbildungsrapport | Rapporte |
| 5 Ausbildungsplanung | longer-term training plan | Ausbildung |
| 6 Notizen Kader | per cadre/Anwärter: dated observations, Stärken / Schwächen | Kader |
| 7 Notizen Truppe | notes per soldier | per-soldier notes in Truppe |
| 8 Kontrolle | AGA matrix per soldier | Truppe matrix |
| 9 Pendenzen / Termine | to-dos with deadline and tick box | Pendenzen |
| 10 Notizen | free notes | Notizen in Pendenzen |

AGA checklist items taken from tab 8 (implemented in `GROUPS`):
- **San D:** Rettungsablauf, Herz/Atmung, Tourniquet, Druckverband, Seitenlagerung, Schocklagerung, Wirbelsäule, Thorax/Bauch, Verbände, Transportarten, CPR theoretisch, CPR praktisch
- **ABC-Abwehr:** ICS 90 anpassen, Dichtigkeitsprüfung IPA, ABC BG 0, C-Waffe, ABC BG 1+2, ABC BG 3+4, Dichtigkeitsprüfung CS, C-Alarm, Ausziehen vergifteter ICS, A-Waffe, A-Überraschung, B-Waffe
- **Pers Waffe:** Waffenkenntnis, Sicherheitsregeln, Manipulationen, PSK, Störungen (einf Verf), Wartung, Stellungen, Schiesssequenz, Doublette/Misserfolg, Notfalldrill/Deckung, Drehung, Bewegung
- **FGA, VBA:** columns exist in the paper form without fixed items → user adds own topics.

### 8.2 Example company timetable (Arbeitsbefehl, officer school class, one week)
Used only to understand real input. Characteristics:
- Graphical grid, one column per day (plus Rap/Div columns with rapport markers S, F, Kp, D, TR), time axis ~0500–2300.
- Colour-coded blocks by subject type (e.g. INTRO, KFK/Leadership, Sport, VMSV, KNIGGE), often with room and responsible person (e.g. "Halle P, Kl L", "OK 0015").
- Daily recurring items: MoE / MiE / NaE (meals, "Vpf Zen"), AV / HV (Verlesen), PD/ID, ABV. → basis for the default Tagesvorlage (MoE 0630–0700, AV 0700–0715, MiE 1215–1300, NaE 1815–1900, ABV 2200–2215 – placeholders, owner adjusts).
- "Besonderes" column with numbered notes referenced in the grid, containing real tasks with deadlines (→ idea: turn into Pendenzen).
- Only the signature is a form field; content is drawn text → no reliable extraction.

---

## 9. Backlog / ideas (not built yet)

Ask the owner before starting any of these; he decides priority.
- **Small fix:** settings placeholder `z.B. Pz/Art OS 22, Kl 2` in `viewSettings()` is too specific for a public repo → make generic (e.g. `z.B. Kp, Zug`).
- **Rückwärtsplanung** (backward planning): enter deadline (Befehlsausgabe / Abmarsch) + step durations → start times, drop into free windows. Owner liked this.
- **Befehlsausgabe-Helfer:** possible future tool, ideally reusing Diarium's code/data model.
- Pencil **sketch areas** (per rapport, per day, "Skizzen" tab) – undecided.
- Besonderes notes → Pendenzen with deadline.
- Qualifikations-Zusammenfassung per cadre (one page, sorted observations).
- Sonntags-Check (weekly review: next 3 weeks planned? overdue? open training topics?).
- Rotlicht-Modus (dark red display for night/field use).
- Optional encrypted sync across devices (see §7).

---

## 10. Testing

No test framework in the repo. Serve locally and test in a browser:

```bash
python3 -m http.server 8765        # then open http://localhost:8765/  (secure context → WebCrypto works)
```

Manual/Playwright checklist after changes:
1. Fresh setup with PIN → week view loads, no console errors.
2. Tap slot → create program block for Mo–Fr → 5 blocks; "Präsenz klären" shows it; classify → category created, panel clears.
3. Tagesvorlage anwenden; own block overlapping a Präsenz block → red outline + listed in Konflikte.
4. Lock → wrong code rejected → correct code unlocks; reload → data persists.
5. Offline reload (service worker) → lock screen appears.
6. Backup: set passphrase → file downloads; file contains no plaintext names. Wipe → restore with wrong passphrase rejected → correct passphrase → set new code → data back.
7. ICS: CRLF only, lines ≤ 75 octets, BEGIN/END balanced, unique UIDs, no Kader/Truppe names.
8. Layout at 1180×820, 820×1180, 390×844; light and dark.

Then bump `VERSION` in `sw.js` (+ `APP_VERSION`), commit, push. GitHub Pages redeploys in 1–2 minutes; the iPad shows the update banner.

---

## 11. Open points with the owner

- He should check with his commander / company office whether keeping digital notes on soldiers and storing an encrypted backup in iCloud is allowed. App copy reminds users to note only service-relevant facts (nothing medical or private).
