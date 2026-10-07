# Flusso Power Automate "PM-Kanban – Notifiche attività"

Usa solo connettori **standard** (SharePoint, Teams, Office 365 Outlook): basta la licenza Microsoft 365.

## Come funziona

- Ogni 5 minuti legge tutti i file `.json` dei progetti nella cartella.
- Considera solo le attività con **`invia_notifica` = `Si`** (valore predefinito delle nuove attività), non completate né annullate.
- Ogni attività ha **una** notifica, con la **data e ora di invio** (`dataOraNotifica`) e il **canale** (`canaleNotifica`: `TEAMS`, `EMAIL` o `ENTRAMBI`) scelti nell'app.
- **Destinatari:** il **responsabile** (sempre) più gli eventuali **partecipanti** (facoltativi), senza doppioni.
- La notifica parte quando:
  - **data e ora di invio ≤ adesso** (è arrivato il momento);
  - **data e ora di invio ≥ adesso − 1 giorno** (non si inviano notifiche vecchie, per esempio se il flusso è rimasto spento);
  - non è già nel registro `_notifiche-inviate.json`.
- Invia su Teams, via email o su entrambi e scrive la notifica nel registro.

### Il campo `invia_notifica`

| Valore | Chi lo imposta | Effetto sul flusso |
|---|---|---|
| `Si` (predefinito) | Utente | Le notifiche vengono inviate |
| `No` | Utente | Attività ignorata |
| `Notifica_inviata` | **App**, automaticamente | Attività ignorata: la notifica è partita |

Ciclo di vita:
1. Il flusso invia i preavvisi e li scrive nel **registro**: non tocca mai i file dei progetti.
2. L'app vede il registro aggiornato e imposta `Notifica_inviata`.
   - L'app lo fa all'avvio, quando il registro cambia e comunque ogni 5 minuti.
3. Se cambi data e ora di invio o canale, l'app riporta il campo a `Si` e la notifica riparte.
   Spostando l'attività nel Gantt, la data di invio si sposta insieme all'inizio (stesso anticipo).

> Anche con l'app chiusa non arrivano doppioni: finché il campo resta `Si`, è il registro a bloccare i reinvii.

La **chiave** di ogni notifica contiene data di invio e canale:
`idProgetto|idAttività|dataOraNotifica|canale`.

> **Regola d'oro:** i file dei progetti li scrive solo l'app, il registro lo scrive solo il flusso.

## Prima di iniziare

- Cartella SharePoint, ad esempio: sito del team → *Documenti* → `PM-Kanban`.
- Nell'app, *Impostazioni → Scegli cartella* crea il file `_notifiche-inviate.json` vuoto.

## Nota sulle condizioni

Per funzionare anche nel designer nuovo senza "modalità avanzata", ogni condizione è **una sola riga**:

| Valore a sinistra | Operatore | Valore a destra |
|---|---|---|
| *espressione indicata* | è uguale a | espressione `true` |

Rinomina le azioni esattamente come indicato: le espressioni usano quei nomi (gli spazi diventano `_`).

---

## Passi

### 1. Trigger – **Ricorrenza**
- Intervallo `5`, Frequenza `Minuto`.
- *Impostazioni* del trigger → **Controllo concorrenza: Attivato, limite 1**: due esecuzioni non si sovrappongono.

### 2. **Inizializza variabile** – `adesso`
- Tipo: Stringa – Valore: `utcNow()`

### 3. SharePoint – **Ottieni contenuto file usando il percorso** → rinomina `Leggi registro`
- Indirizzo sito: il tuo sito – Percorso file: `/Documenti condivisi/PM-Kanban/_notifiche-inviate.json`

### 4. **Componi** → `Registro`
```
json(string(body('Leggi_registro')))
```
> Alla prima esecuzione apri la cronologia: se l'output di *Leggi registro* contiene `$content`, usa invece
> `json(base64ToString(body('Leggi_registro')?['$content']))`. Stessa regola per il passo 9b.

### 5. **Filtra matrice** → `Registro recente` (elimina le voci con più di 7 giorni)
- Da: `outputs('Registro')?['inviate']`
- Riga: `ticks(item()?['inviataIl'])` – **è maggiore di** – `ticks(addDays(variables('adesso'), -7))`

### 6. **Inizializza variabile** – `registro`
- Tipo: Matrice – Valore: `body('Registro_recente')`

### 7. **Inizializza variabile** – `nuoviInvii`
- Tipo: Intero – Valore: `0`

### 8. SharePoint – **Elenca cartella** → `Elenca file`
- Identificatore file: `/Documenti condivisi/PM-Kanban`

**Filtra matrice** → `File progetto`
- Da: `body('Elenca_file')`
- Riga: `and(equals(item()?['IsFolder'], false), endsWith(toLower(item()?['Name']), '.json'), not(startsWith(item()?['Name'], '_')), not(startsWith(item()?['Name'], '~')))` – è uguale a – `true`

### 9. **Applica a ciascuno** → `Per ogni file` su `body('File_progetto')`

**9a.** SharePoint – **Ottieni contenuto file** → `Leggi progetto`
- Identificatore file: `items('Per_ogni_file')?['Id']`

**9b.** **Componi** → `Progetto`
```
json(string(body('Leggi_progetto')))
```

**9c.** **Filtra matrice** → `Attivita da notificare`
- Da: `outputs('Progetto')?['attivita']`
- Riga (è uguale a `true`):
```
and(
  equals(item()?['invia_notifica'], 'Si'),
  not(contains(createArray('COMPLETATA','ANNULLATA'), item()?['stato'])),
  not(empty(coalesce(item()?['dataOraNotifica'], ''))),
  lessOrEquals(ticks(coalesce(item()?['dataOraNotifica'], variables('adesso'))), ticks(variables('adesso'))),
  greaterOrEquals(ticks(coalesce(item()?['dataOraNotifica'], variables('adesso'))), ticks(addDays(variables('adesso'), -1)))
)
```
> `dataOraNotifica` è facoltativa nelle attività con `invia_notifica` = `No`: `coalesce` evita errori su quelle righe,
> perché in Power Automate `and()` valuta sempre tutte le condizioni.

**9d.** **Applica a ciascuno** → `Per ogni attivita` su `body('Attivita_da_notificare')`

- **Componi** → `Chiave`
  ```
  concat(outputs('Progetto')?['progetto']?['id'], '|', items('Per_ogni_attivita')?['id'], '|',
         items('Per_ogni_attivita')?['dataOraNotifica'], '|', items('Per_ogni_attivita')?['canaleNotifica'])
  ```
- **Condizione** → `Da inviare`: `contains(string(variables('registro')), outputs('Chiave'))` – è uguale a – `false`

  Ramo **Vero**:

  1. **Seleziona** → `Email partecipanti`
     - Da: `items('Per_ogni_attivita')?['partecipanti']`
     - Mappa (modalità testo): `item()?['email']`
  2. **Filtra matrice** → `Destinatari` (responsabile + partecipanti, senza doppioni né valori vuoti)
     - Da: `union(createArray(items('Per_ogni_attivita')?['responsabile']), body('Email_partecipanti'))`
     - Riga: `not(empty(item()))` – è uguale a – `true`
  3. **Componi** → `Ora inizio`
     ```
     convertTimeZone(items('Per_ogni_attivita')?['dataOraInizio'], 'UTC', 'W. Europe Standard Time', 'dd/MM/yyyy HH:mm')
     ```
  4. **Componi** → `Canale`: `items('Per_ogni_attivita')?['canaleNotifica']`
  5. **Condizione** → `Invia su Teams`: `contains(createArray('TEAMS','ENTRAMBI'), outputs('Canale'))` – è uguale a – `true`
     - **Vero** → **Applica a ciascuno** `Per ogni destinatario` su `body('Destinatari')`
       → Teams – **Pubblica scheda in una chat o in un canale** (*Post card in a chat or channel*)
       - Pubblica come: `Flow bot` – Pubblica in: `Chat con Flow bot`
       - Destinatario: `items('Per_ogni_destinatario')`
       - Scheda adattiva: vedi sotto
  6. **Condizione** → `Invia per email`: `contains(createArray('EMAIL','ENTRAMBI'), outputs('Canale'))` – è uguale a – `true`
     - **Vero** → Outlook – **Invia un messaggio di posta elettronica (V2)**
       - A: `join(body('Destinatari'), ';')`
       - Oggetto: `🔔 @{items('Per_ogni_attivita')?['codice']} – inizio @{outputs('Ora_inizio')}`
       - Corpo: progetto, titolo, descrizione, responsabile, ora di inizio
  7. **Aggiungi a variabile di matrice** – `registro`:
     ```json
     { "chiave": "@{outputs('Chiave')}", "inviataIl": "@{utcNow()}" }
     ```
  8. **Incrementa variabile** – `nuoviInvii` di `1`

### 10. **Condizione** → `Registro da salvare`: `variables('nuoviInvii')` – è maggiore di – `0`
Ramo **Vero**:
- **Componi** → `Nuovo registro`: `setProperty(json('{}'), 'inviate', variables('registro'))`
- SharePoint – **Aggiorna file**
  - Identificatore file: seleziona `_notifiche-inviate.json` – Contenuto file: `string(outputs('Nuovo_registro'))`

> Lascia **disattivata** la concorrenza su tutti gli "Applica a ciascuno": usano variabili condivise.

---

## Scheda adattiva Teams

```json
{
  "type": "AdaptiveCard",
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "version": "1.4",
  "body": [
    { "type": "TextBlock", "text": "🔔 Attività in avvio", "weight": "Bolder", "size": "Medium" },
    { "type": "TextBlock", "text": "@{items('Per_ogni_attivita')?['codice']} – @{items('Per_ogni_attivita')?['titolo']}", "wrap": true },
    {
      "type": "FactSet",
      "facts": [
        { "title": "Progetto", "value": "@{outputs('Progetto')?['progetto']?['nome']}" },
        { "title": "Responsabile", "value": "@{items('Per_ogni_attivita')?['responsabile']}" },
        { "title": "Inizio", "value": "@{outputs('Ora_inizio')}" }
      ]
    }
  ]
}
```
L'app non accetta virgolette doppie nel titolo, perché romperebbero la scheda.

---

## Prova

1. Crea un'attività con te stesso come responsabile e **nessun partecipante**. Lascia **🔔 Notifiche attive**, imposta la data e ora di invio tra 10 minuti e canale **Teams**.
2. Entro 5 minuti dall'orario scelto arriva la scheda dal Flow bot.
3. Nel registro compare la chiave e, con l'app aperta, l'attività passa a **Notifica_inviata**.
4. Cambia la data e ora di invio: il campo torna a **Si** e la notifica arriverà di nuovo, all'orario nuovo.
5. Imposta **No** su un'altra attività: non riceverai nulla.

## Da sapere

- **Precisione**: la notifica arriva con un ritardo massimo pari all'intervallo del flusso (5 minuti).
- **Flusso fermo**: se il flusso resta spento per più di un giorno, le notifiche scadute nel frattempo non vengono inviate.
- **Limiti giornalieri**: la licenza Microsoft 365 ha un tetto di azioni al giorno. Con molti progetti porta la ricorrenza a 10–15 minuti.
- **Struttura dei file**: vedi `docs/progetto.schema.json` e `docs/registro-notifiche.schema.json`. Email di responsabile e partecipanti sono già salvate in minuscolo.
- **Copie in conflitto di OneDrive** (es. `SARA-NOMEPC.json`): non creano doppioni, perché hanno le stesse chiavi. L'app comunque le segnala.
- **Fusi orari**: confronti sempre in UTC; l'ora italiana si calcola solo nel messaggio (gestisce anche l'ora legale).
