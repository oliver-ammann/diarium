# Diarium – Installation auf dem iPad

Die App besteht aus diesem Ordner. Sie muss einmal auf eine Webadresse (https), danach installierst du sie in Safari auf dem Home-Bildschirm. Ab dann läuft sie ohne Internet.

**Deine Daten kommen nie auf den Server.** Online liegt nur der Programmcode. Alles, was du erfasst, bleibt verschlüsselt auf dem iPad.

---

## 1. Online stellen mit GitHub Pages (gratis, ca. 15 Minuten)

1. Auf **github.com** ein kostenloses Konto erstellen.
2. Oben rechts **+ → New repository**.
   - Name: z.B. `diarium`
   - **Public** wählen (bei Gratis-Konten nötig für GitHub Pages; öffentlich ist nur der Code, keine Daten)
   - **Create repository**
3. Auf der neuen Seite: **uploading an existing file** anklicken.
4. **Den Inhalt** des Ordners `diarium` hineinziehen, also `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest` und den Ordner `icons`. Nicht den Ordner selbst. → **Commit changes**
5. **Settings → Pages**: bei *Branch* `main` und `/ (root)` wählen → **Save**.
6. Nach 1–2 Minuten erscheint oben die Adresse, z.B. `https://deinname.github.io/diarium/`

> Tipp: Das Hochladen geht am einfachsten am Computer. Auf dem iPad funktioniert es in Safari auch, ist aber umständlicher.

## 2. Auf dem iPad installieren

1. Die Adresse in **Safari** öffnen.
2. **Teilen-Taste** (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → **Hinzufügen**.
3. Die App über das neue Icon **«Diarium»** öffnen, nicht über Safari.
4. PIN oder Passphrase festlegen. **Es gibt keinen Code-Reset.** Ohne Code helfen nur ein Backup und die Backup-Passphrase.

> Wichtig: Daten, die du im normalen Safari-Tab erfasst, sind **nicht** in der installierten App. Also zuerst installieren, dann erfassen.

## 3. Erste Schritte

1. **Einstellungen (Zahnrad):** Grad, Name, Einteilung; Tagesvorlage an deine Zeiten anpassen.
2. **Woche:** In den Kalender tippen → Block erfassen, gleich für mehrere Tage («Mo–Fr»).
3. **Präsenz klären:** Neue Programm-Blöcke sind «unklar» und zählen nicht als freie Zeit. Im Feld «Präsenz klären» unter dem Kalender pro Kategorie einmal **Präsenz** oder **frei** wählen. Das gilt dann für alle Wochen.
4. **Backup einrichten:** Banner «Backup erstellen» → Backup-Passphrase festlegen (lang, z.B. vier Wörter, **aufschreiben**) → «Sichern» → **In Dateien sichern** → iCloud Drive.

## 4. Backup und neues Gerät

- **Backup:** Einstellungen → Backup erstellen → In Dateien sichern. Die App erinnert dich nach der eingestellten Anzahl Tage.
- **Wiederherstellen:** App auf dem neuen iPad installieren → beim Einrichten **«Backup wiederherstellen»** → Datei wählen → Backup-Passphrase → neuen Code festlegen.
- Die Backup-Datei ist verschlüsselt. Ohne Backup-Passphrase kann niemand sie öffnen, auch du nicht.

## 5. Kalender-Export (Apple / Google)

Woche → **Kalender-Export** → Zeitraum und Inhalt wählen → **Exportieren**.

- Auf dem iPad «Kalender» wählen oder die Datei in Dateien sichern und antippen. Beim Import wählst du den Zielkalender. Ist dein Google-Konto auf dem iPad eingerichtet (Einstellungen → Kalender → Accounts), kannst du direkt einen Google-Kalender wählen.
- Am Computer: Google Kalender → Einstellungen → **Importieren**.
- Exportiert werden nur Termine und Pendenzen mit Termin, **keine Kader- oder Truppendaten und keine Notizen**.
- Jeder Termin hat eine feste ID, damit ein erneuter Import ihn aktualisieren kann statt ihn doppelt anzulegen. Prüfe das beim ersten Mal. Gelöschte Blöcke musst du im Kalender selbst löschen.

## 6. Updates

Wenn du neue Dateien hochlädst, erhöhe in `sw.js` die Zeile `const VERSION = 'diarium-1.0.0';` (z.B. auf `diarium-1.0.1`). Die App zeigt dann oben «Neue Version verfügbar». Deine Daten bleiben erhalten.

## 7. Sicherheit – kurz

- Daten: AES-256-GCM verschlüsselt, Schlüssel aus deinem Code (PBKDF2, 600 000 Runden). Die App baut keine Verbindung zu fremden Servern auf.
- Automatische Sperre nach einstellbarer Zeit (Standard 5 Minuten im Hintergrund).
- Eine 6-stellige PIN ist bequem. Wer das iPad entsperrt in die Hände bekommt, könnte eine kurze PIN aber mit viel Aufwand erraten. Eine Passphrase ist sicherer.
- Kläre mit deinem Kdt bzw. dem Kp Büro, ob persönliche Notizen über AdA digital und ein Backup in iCloud zulässig sind. Notiere nur Dienstliches, nichts Medizinisches oder Privates.
