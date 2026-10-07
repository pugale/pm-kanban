# PM-Kanban

App desktop per gestire le attività di progetto con cinque viste sugli stessi dati:
**Kanban**, **Gantt** (con linea "Oggi" e dipendenze), **Calendario** (mese/settimana/giorno, festivi in rosso chiaro), **Agenda** e **Dashboard**.

I dati sono file JSON in una cartella SharePoint sincronizzata con OneDrive. Le notifiche Teams/email le invia Power Automate.
Non servono database, registrazione dell'app o licenze aggiuntive.

---

## 1. Requisiti (una sola volta)

- **Node.js LTS** (versione 22.12 o successiva) – https://nodejs.org → installa la versione "LTS".
  Verifica dal terminale: `node -v`
- **Visual Studio Code**.

## 2. Apertura in Visual Studio Code

1. Estrai lo zip, per esempio in `C:\Sviluppo\pm-kanban`.
2. In VS Code: **File → Apri cartella…** e scegli la cartella `pm-kanban`.
3. Apri il terminale: **Terminale → Nuovo terminale**.
4. Installa le dipendenze (solo la prima volta, qualche minuto):
   ```
   npm install
   ```
5. Avvia l'app in modalità sviluppo:
   ```
   npm run dev
   ```
   Compare la schermata di avvio e poi la finestra di PM-Kanban. Ogni modifica all'interfaccia (cartella `src/renderer`) si vede subito.
   Se modifichi file in `src/main`, chiudi la finestra e rilancia `npm run dev`.

Altri comandi:

| Comando | A cosa serve |
|---|---|
| `npm start` | Compila tutto e avvia l'app come in produzione |
| `npm run typecheck` | Controlla gli errori di TypeScript senza avviare |
| `npm run dist` | Crea l'eseguibile portatile Windows `PM-Kanban` (con icona) nella cartella `release` |

Debug: in VS Code premi **F5** ("Avvia PM-Kanban") per mettere punti di interruzione nel processo principale.

## 3. Primo avvio

1. **SharePoint**: nella raccolta *Documenti* del sito del team crea la cartella `PM-Kanban`, poi premi
   **Sincronizza** (oppure *Aggiungi collegamento a OneDrive*): la cartella compare in Esplora file.
2. Nell'app si apre **Impostazioni** (⚙️):
   - inserisci la tua email aziendale e salva;
   - **Scegli cartella** e seleziona la cartella sincronizzata.
3. **+ Progetto** → nome, cliente e prefisso dei codici (es. `SARA` → `SARA-001`).
4. **+ Nuova attività** (oppure Ctrl+N).
5. Per le notifiche crea il flusso descritto in [`docs/flusso-notifiche.md`](docs/flusso-notifiche.md).

## 4. Come si usa

Barra in alto: **Progetto:** [scelta] · + Progetto · viste · ricerca · **+ Nuova attività** · ⚙️ Impostazioni

| Vista | Cosa puoi fare |
|---|---|
| **Kanban** | Trascina le card tra le colonne per cambiare stato · 🔔/🔕 attiva o disattiva le notifiche · card rossa lampeggiante = in ritardo |
| **Gantt** | Trascina la barra per spostare l'attività · trascina i bordi per cambiare inizio/fine · 📍 **Oggi** centra la linea rossa · zoom Giorno → Anno · 🔗 **Collega attività** per le dipendenze (clic sulla freccia per eliminarla) |
| **Calendario** | Mese, settimana o giorno · sabati, domeniche e festività nazionali con sfondo rosso chiaro e nome della festa · di base mostra le attività **da iniziare** · clic su un giorno = nuova attività |
| **Agenda** | In ritardo, Oggi, Domani e giorni successivi · filtri: tutto, da iniziare, in corso, mie attività |
| **Dashboard** | Indicatori (aperte, in ritardo, in scadenza oggi/settimana, avanzamento medio) e grafici |

La **ricerca** in alto filtra tutte le viste (codice, titolo, descrizione, responsabile, tag, email).

### Campi dell'attività

| Campo | Obbligatorio | Note |
|---|---|---|
| ID | **Sì** | Numero sequenziale progressivo, parte da `1` |
| Codice | No | Se vuoto viene generato (es. `SARA-014`); univoco nel progetto |
| Titolo | **Sì** | |
| Responsabile (email) | **Sì** | Proposto con la tua email; riceve sempre le notifiche |
| Data e ora inizio / fine | **Sì** | La fine non può precedere l'inizio |
| Partecipanti | No | Se presenti ricevono anche loro le notifiche |
| Avanzamento | No | Percentuale da `0` a `100`, visualizzata anche nel Gantt e in Kanban |
| Notifica | — | Predefinito **🔔 Notifiche attive**: chiede **data e ora di invio** (proposta: 15 minuti prima dell'inizio, o il primo orario utile se è già passato) e il canale (Teams, email o entrambi) |

### Festività nel calendario

Sono calcolate in automatico per ogni anno: Capodanno, Epifania, Pasqua e Lunedì dell'Angelo, 25 aprile, 1° maggio, 2 giugno,
Ferragosto, **4 ottobre (San Francesco, festa nazionale dal 2026)**, Ognissanti, Immacolata, Natale e Santo Stefano.
Per aggiungere il santo patrono del tuo comune modifica `FESTE_LOCALI` in `src/renderer/utils/date.ts`
(es. `[8, 7, "San Donato"]` per Arezzo).

## 5. Struttura del progetto

```text
pm-kanban/
├── .vscode/                    Avvio e debug con F5
├── docs/                       Flusso Power Automate, schemi JSON e file di esempio
├── resources/                  Icona (icon.ico, icon.png) e schermata di avvio (splash.html)
├── index.html                  Pagina dell'interfaccia
├── package.json                Dipendenze e comandi npm
├── tsconfig.json               TypeScript per l'interfaccia
├── tsconfig.main.json          TypeScript per il processo principale
├── vite.config.mts             Compilazione dell'interfaccia
└── src/
    ├── shared/                 Tipi, contratto dell'API e verifica della struttura dei file
    ├── main/                   Processo principale Electron (Node.js)
    │   ├── main.ts             Schermata di avvio, finestra principale, icona
    │   ├── ipc.ts              Canali verso l'interfaccia
    │   └── storage/            Lettura/scrittura file, regole, notifiche, osservatore cartella
    ├── preload/preload.ts      Ponte sicuro: espone window.pm all'interfaccia
    └── renderer/               Interfaccia React
        ├── App.tsx             Barra in alto, scelta progetto, viste
        ├── views/              Kanban, Gantt, Calendario, Agenda, Dashboard, Impostazioni
        ├── components/         Finestre di modifica attività e progetto
        └── utils/              Date, festività, colori ed etichette
```

Cartella dei dati:
```text
PM-Kanban (SharePoint sincronizzata)
├── SARA-Bologna.json           ← scritto solo dall'app
├── _notifiche-inviate.json     ← scritto solo da Power Automate
└── allegati/<idProgetto>/<idAttività>/...
```

### Struttura del file di progetto

Descritta in [`docs/progetto.schema.json`](docs/progetto.schema.json) (JSON Schema) con un esempio in
[`docs/esempio-progetto.json`](docs/esempio-progetto.json). In sintesi:

```json
{
  "schemaVersion": 1,
  "progetto": { "id": "<uuid>", "nome": "...", "cliente": "...", "prefissoCodice": "SARA", "proprietario": "email@azienda.it", "tag": ["..."] },
  "attivita": [
    {
      "id": 1,
      "codice": "SARA-001",
      "titolo": "...",
      "descrizione": "...",
      "stato": "IN_PREPARAZIONE",
      "priorita": "MEDIA",
      "dataOraInizio": "2026-10-12T07:00:00.000Z",
      "dataOraFine": "2026-10-12T08:00:00.000Z",
      "percentualeCompletamento": 25,
      "responsabile": "email@azienda.it",
      "tag": ["..."],
      "partecipanti": [{ "email": "altra@azienda.it", "nome": "Nome Cognome" }],
      "invia_notifica": "Si",
      "dataOraNotifica": "2026-10-12T06:45:00.000Z",
      "canaleNotifica": "TEAMS",
      "collegamenti": [{ "tipo": "SHAREPOINT", "titolo": "...", "url": "https://..." }],
      "allegati": [{ "id": "<uuid>", "nome": "file.pdf", "percorsoRelativo": "allegati/<idProgetto>/1/file.pdf", "aggiuntoIl": "2026-10-12T07:00:00.000Z" }],
      "versione": 1,
      "creataIl": "2026-10-12T07:00:00.000Z",
      "aggiornataIl": "2026-10-12T07:00:00.000Z",
      "aggiornataDa": "email@azienda.it"
    }
  ],
  "dipendenze": [{ "id": "<uuid>", "origineId": 1, "destinazioneId": 2, "tipo": "FS" }],
  "revisione": 1,
  "aggiornatoIl": "2026-10-12T07:00:00.000Z",
  "aggiornatoDa": "email@azienda.it"
}
```

- Date sempre in UTC nel formato `2026-10-12T07:00:00.000Z`; email in minuscolo.
- `?` = facoltativo. `dataOraNotifica` è obbligatoria quando `invia_notifica` è `Si` o `Notifica_inviata`.
- Non sono ammessi campi non previsti: un errore di battitura in un file modificato a mano viene segnalato.
- Controlli in più rispetto allo schema: `id` e codici univoci, fine dopo inizio, attività completata al 100%,
  dipendenze verso attività esistenti, allegati dentro `allegati/<idProgetto>/<idAttività>/`.

## 6. Regole di funzionamento

| Regola | Come è garantita |
|---|---|
| Un solo autore per progetto | Campo `proprietario`: gli altri aprono in sola lettura |
| Nessuna modifica persa | Ogni operazione rilegge il file dal disco prima di salvare |
| Modifiche nel frattempo | `versione` per attività: se è cambiata, avviso e ricarica |
| File mai a metà | Scrittura su file temporaneo + rinomina, con nuovi tentativi se OneDrive lo blocca |
| Copie in conflitto OneDrive | Segnalate in alto nella finestra |
| Date | Salvate in UTC, mostrate nell'ora del PC |
| Dipendenze | Niente auto-collegamenti, doppioni o cicli |
| Notifiche | Campo `invia_notifica`: `Si` (predefinito) / `No` / `Notifica_inviata` (solo automatico), con `dataOraNotifica` e `canaleNotifica` |
| Spostamenti | Cambiando l'inizio (modulo o Gantt) la data di invio si sposta insieme, con lo stesso anticipo |
| Struttura dei file | Verificata a ogni lettura e **prima di ogni salvataggio**: un file non valido viene segnalato in alto e non aperto |
| Copia di sicurezza | Cronologia versioni di SharePoint |

## 7. Problemi comuni

- **`npm install` si blocca o dà errori di rete**: la rete aziendale potrebbe filtrare i download (Electron scarica circa 100 MB).
  Prova da un'altra rete o chiedi all'IT di consentire `registry.npmjs.org` e `github.com`.
- **"La cartella non è raggiungibile"**: OneDrive non è avviato o la cartella non è più sincronizzata.
- **Progetto in sola lettura**: l'email in Impostazioni non coincide con il proprietario del progetto.
- **`npm run dist` bloccato dall'antivirus**: l'eseguibile non è firmato; usa `npm start` oppure chiedi all'IT.
- **"Struttura non valida" su un progetto**: il file è stato modificato a mano o è danneggiato. Il messaggio indica il campo; puoi recuperare una versione precedente dalla cronologia versioni di SharePoint.
- **In sviluppo la barra di Windows mostra l'icona di Electron**: è normale con `npm run dev`; l'eseguibile creato con `npm run dist` usa l'icona di PM-Kanban.
