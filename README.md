# Gestionale Studio · Demo

**Gestionale per studi di consulenza contabile e del lavoro: competenze di Paghe, Contabilità, Redditi e Varie, pagamenti, cassa, elaborazioni annuali e report dei saldi clienti.**

Versione web dimostrativa di un'applicazione desktop (Electron + Express + SQLite + React). Pagine, griglie, finestre ed export Excel sono quelli del gestionale originale. Al posto del server e del database, le richieste vengono eseguite **interamente nel browser** da un backend simulato che riproduce le regole delle API originali.

> **Nota:** per questa demo sia i dati sia alcune strutture dati sono stati alterati rispetto al progetto originario.

- Nessun server, nessun database, nessun dato inviato in rete.
- Tutti i dati sono **inventati**: 34 clienti fittizi (società, ditte individuali, persone fisiche, un'associazione) riuniti in alcuni gruppi, con codici fiscali e partite IVA segnaposto (`CF-DEMO-001`, `PI-DEMO-002`…).
- Lo storico copre **i due anni precedenti e l'anno in corso** fino al mese corrente, che resta in bozza; i mesi precedenti sono convalidati. Le date si adattano automaticamente al giorno di apertura e nessun movimento è successivo alla data odierna.

## Cosa si può simulare

Tutte le funzioni del gestionale sono operative, con le stesse validazioni e gli stessi messaggi d'errore:

- **Anagrafiche**: creazione, modifica ed eliminazione dei clienti, gruppi e ricerca. Il codice cliente duplicato o i campi obbligatori mancanti vengono rifiutati come nell'originale.
- **Paghe, Contabilità, Redditi, Varie**: creazione, duplicazione, convalida ed eliminazione dei periodi mensili; modifica delle righe in griglia con salvataggio unico e atomico; gestione dei servizi (anche nuovi servizi Varie creati nello stesso salvataggio).
- **Pagamenti**: incassi elettronici, in contanti e sconti, con filtri per anno, cliente, gruppo e ricerca.
- **Cassa**: entrate, uscite, versamenti in banca, pagamenti in contanti e chiusura d'anno con riporto del saldo iniziale.
- **Elaborazioni**: prospetto annuale per cliente, gruppo o generale, con saldo dell'anno precedente ed export Excel.
- **Report**: dovuto, incassato, sconti e saldi per cliente, con sincronizzazione dei saldi annuali.
- **Backup e ripristino** dalla Dashboard, in formato JSON.

Le eliminazioni seguono i vincoli del database originale: eliminare un periodo rimuove le sue righe, eliminare un cliente rimuove competenze, pagamenti e saldi collegati. Le operazioni non valide non lasciano modifiche parziali.

## Salvataggio, ripristino e reset

L'archivio viene salvato nel `localStorage` del browser e sopravvive al ricaricamento della pagina. Più schede della stessa demo condividono l'archivio.

- **Ripristina demo** (barra di navigazione): dopo conferma rigenera l'archivio dimostrativo iniziale e ricarica la pagina.
- **Backup**: scarica un file `backup_demo_AAAA-MM-GG_….json` con l'intero archivio.
- **Ripristino**: carica un backup JSON della demo. Il file viene verificato con gli stessi vincoli del database (codici univoci, riferimenti tra tabelle, valori ammessi); se non è valido l'archivio resta invariato.

Se il browser impedisce il salvataggio locale (modalità privata restrittiva, spazio esaurito), un avviso informa l'utente: la demo resta utilizzabile in memoria, ma le modifiche non sono garantite al ricaricamento.

### Differenze rispetto all'applicazione desktop

- I backup sono file JSON della demo, non copie del database SQLite, e non sono intercambiabili con quelli del gestionale.
- Le risposte hanno una breve latenza simulata per rendere visibili gli stati di caricamento.
- Non ci sono funzioni specifiche del desktop (finestra Electron, aggiornamenti, file su disco).

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:5175
npm test         # test di interfaccia e del backend simulato (node --test)
npm run build    # build statica in dist/
npm run preview  # anteprima della build su http://localhost:5175
```

I test del backend simulato riprendono quelli del server originale (saldi storici, date dei pagamenti, griglia ed export Excel delle elaborazioni) e verificano inoltre dati dimostrativi, persistenza, atomicità, backup e reset.

## Deploy

La build è statica e usa percorsi relativi (`base: './'`) con navigazione basata su hash (`#/clienti`, `#/elaborazioni`…): può essere pubblicata su qualsiasi hosting statico, anche in sottocartella, senza riscritture delle rotte né variabili d'ambiente. Su Vercel: comando `npm run build`, directory di output `dist`.

## Struttura

- `react-app/src/demo/demoBackend.js`: sostituto di `fetch` per le API, salvataggio nel browser, reset e avvisi
- `react-app/src/demo/demoServer.js`: instradamento delle richieste come nel server Express
- `react-app/src/demo/demoDatabase.js`: tabelle in memoria con i vincoli dello schema SQLite (chiavi, univocità, controlli, cascate, transazioni)
- `react-app/src/demo/demoRoutes*.js`, `demoElaborazioni.js`, `demoQueries.js`: logica delle API originali
- `react-app/src/demo/demoSeed.js`, `demoSeedData.js`: generazione deterministica dei dati fittizi
- `react-app/src/components/DemoControls.jsx`: reset e avviso di salvataggio
- `react-app/src/`: interfaccia del gestionale (pagine, griglie, hook)
- `react-app/tests/`: test (`node --test`)
