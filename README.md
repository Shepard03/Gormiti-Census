# Gormiti Census

App desktop (Windows/macOS) per catalogare la propria collezione di Gormiti:
personaggi, carte, accessori e obiettivi/selezioni personalizzate.

Costruita con Python (pandas) + [pywebview](https://pywebview.flowrl.com/)
per l'interfaccia grafica in HTML/CSS/JS.

> **Disclaimer**: questo è un progetto amatoriale creato da un fan, non
> affiliato né sponsorizzato da Giochi Preziosi. "Gormiti" e tutti i
> personaggi correlati sono marchi/proprietà dei rispettivi titolari.

---

## 🎥 Tutorial

[![Guarda il Tutorial](https://img.youtube.com/vi/Tbz-KJ3lfyg/maxresdefault.jpg)](https://youtu.be/Tbz-KJ3lfyg)
*(clicca sull'immagine per guardare il video su YouTube)*

---

## 📥 Download

Vai alla sezione [Releases](../../releases) di questo repository e scarica:

- **Windows**: `GormitiCensus_Setup.exe` — eseguilo, la procedura guidata
  chiede dove installare e se vuoi il collegamento sul Desktop.
- **macOS**: `GormitiCensus.dmg` — aprilo e trascina l'app nella cartella
  Applicazioni.

### 🖼️ Media (video dei personaggi)

Per motivi di spazio, l'installer/DMG non include foto e video reali ma
solo dei placeholder, per mantenere la struttura delle cartelle.
Per avere i contenuti completi:

1. Dalla stessa pagina delle [Releases](../../releases), scarica gli zip dei
   media che ti interessano (es. `carte.zip`, `personaggi.zip`,
   `video_rotation.zip`, ecc. — puoi prendere solo quelli che vuoi)
2. Estrai ogni zip
3. Copia il contenuto dentro `systemfile/ui/media/<nome cartella>/`, accanto
   a dove hai installato l'app, sovrascrivendo i placeholder

---

## ✨ Funzionalità

- Catalogazione di personaggi e carte, con conteggio posseduti/doppioni
- Filtri per provenienza, mancanti, extra
- Selezioni personalizzate (sottoinsiemi di collezione da tracciare a parte)
- Navigazione tra le "evoluzioni" di uno stesso personaggio tra serie diverse
- Salvataggi multipli, import/export

---

## 📁 Struttura del progetto

```
app.py               # Backend Python (logica, lettura/scrittura CSV)
app.js                # Frontend: logica dell'interfaccia
style.css             # Frontend: stile
index.html             # Frontend: struttura della pagina
systemfile/
  gormiti_census.csv   # Database dei personaggi/carte
  evoluzioni.csv        # Catene di "evoluzione" tra personaggi/serie
  ui/                   # File statici serviti dall'interfaccia
    media/               # Placeholder nel repo — i file reali si scaricano
                           # dalle Releases, vedi sezione Download sopra
```

---

## ⚖️ Licenza

Il codice è distribuito con licenza MIT (vedi [LICENSE](./LICENSE)).
La licenza copre solo il codice, non copre in alcun modo il marchio
"Gormiti" o materiali di terzi.

"Gormiti" e i nomi dei personaggi correlati sono marchi di proprietà di
Giochi Preziosi S.p.A. Questo progetto non è ufficiale, non è affiliato
né sponsorizzato da Giochi Preziosi. Tutti i diritti sui personaggi,
i nomi e i materiali originali restano dei rispettivi titolari.

## 🤝 Contribuire

Segnalazioni di bug e proposte di miglioramento sono benvenute tramite
Issue o Pull Request.
