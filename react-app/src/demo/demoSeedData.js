// Fictional catalogue and customers used to seed the demo. Every name, code and amount is
// invented: tax identifiers use the recognisable `CF-DEMO-*` / `PI-DEMO-*` placeholders.

// [subcategory, base unit price, active]
export const SERVICE_CATALOGUE = {
  PAGHE: [
    ['Elaborazione F24', 15], ['Comunicazioni UniLav', 20], ['Gestione TFR', 25],
    ['Certificazione Unica', 18], ['Modello 770', 120], ['Autoliquidazione INAIL', 60],
    ['Prospetto costo del personale', 40, false],
    ['Cedolini Ordinari', 14], ['Cedolini Apprendisti', 16], ['Cedolini Collaboratori', 12],
    ['Cedolini Colf e badanti', 18]
  ],
  CONTABILITA: [
    ['Contabilità ordinaria', 180], ['Contabilità semplificata', 90], ['Liquidazione IVA', 35],
    ['Registrazione corrispettivi', 25], ['Comunicazione LIPE', 40], ["Bilancio d'esercizio", 650],
    ['Dichiarazione IVA annuale', 150], ['Esterometro', 30, false]
  ],
  REDDITI: [
    ['Modello 730', 70], ['Redditi Persone Fisiche', 180], ['Redditi Società di Persone', 380],
    ['Redditi Società di Capitali', 650], ['Dichiarazione IRAP', 150], ['Calcolo IMU', 35], ['ISEE', 30]
  ],
  VARIE: [
    ['Visura camerale', 15], ['Diritto annuale CCIAA', 30], ['Pratica SUAP', 150],
    ['Registrazione contratto di locazione', 90], ['Rinnovo firma digitale', 60],
    ['Consulenza straordinaria', 120], ['Pratica di successione', 450], ['Invio telematico', 20]
  ]
};

const customer = (name, kind, options = {}) => ({ name, kind, ...options });

// kind: srl (società di capitali), snc/sas (società di persone), ditta (ditta individuale),
// associazione, privato. staff: [ordinari, apprendisti, collaboratori, colf/badanti].
// pay: [method (ELETTRONICO | CONTANTI | MISTO), cadence in months, share of the due amount paid].
// since/until: year offset from the current year when the relationship starts/ends.
export const DEMO_CUSTOMERS = [
  customer('Azienda Dimostrativa S.r.l.', 'srl', { group: 'GRUPPO-DEMO', staff: [8, 1, 0, 0], pay: ['ELETTRONICO', 1, 1] }),
  customer('Dimostrativa Servizi S.r.l.', 'srl', { group: 'GRUPPO-DEMO', staff: [4, 0, 1, 0], pay: ['ELETTRONICO', 1, 0.97] }),
  customer('Dimostrativa Immobiliare S.r.l.', 'srl', { group: 'GRUPPO-DEMO', imu: true, pay: ['ELETTRONICO', 3, 1] }),
  customer('Rossi Mario', 'privato', { group: 'GRUPPO-ROSSI', imu: true, pay: ['CONTANTI', 1, 1] }),
  customer('Rossi Costruzioni S.n.c.', 'snc', { group: 'GRUPPO-ROSSI', staff: [6, 1, 0, 0], pay: ['ELETTRONICO', 3, 0.9] }),
  customer('Bar Centrale di Rossi Anna', 'ditta', { group: 'GRUPPO-ROSSI', retail: true, staff: [2, 0, 0, 0], pay: ['CONTANTI', 1, 1] }),
  customer('Alfa Logistica S.r.l.', 'srl', { group: 'GRUPPO-ALFA', staff: [12, 2, 1, 0], pay: ['ELETTRONICO', 1, 1] }),
  customer('Alfa Trasporti S.r.l.', 'srl', { group: 'GRUPPO-ALFA', staff: [7, 0, 0, 0], pay: ['ELETTRONICO', 1, 0.95] }),
  customer('Bianchi Laura', 'privato', { isee: true, pay: ['ELETTRONICO', 1, 1] }),
  customer('Verdi Giuseppe Impianti', 'ditta', { pay: ['MISTO', 3, 0.95] }),
  customer('Russo Elena', 'privato', { staff: [0, 0, 0, 1], imu: true, pay: ['CONTANTI', 1, 1] }),
  customer('Colombo Arredamenti S.a.s.', 'sas', { staff: [3, 0, 0, 0], pay: ['ELETTRONICO', 1, 1] }),
  customer('Ferrari Paolo Consulenze', 'ditta', { pay: ['ELETTRONICO', 3, 1] }),
  customer('Trattoria Esempio S.r.l.', 'srl', { retail: true, staff: [9, 2, 0, 0], pay: ['MISTO', 1, 0.92] }),
  customer('Ricci Studio Tecnico', 'ditta', { staff: [0, 0, 1, 0], pay: ['ELETTRONICO', 3, 1] }),
  customer('Marino Giulia', 'privato', { imu: true, pay: ['ELETTRONICO', 1, 1] }),
  customer('Ottica Greco S.n.c.', 'snc', { retail: true, staff: [2, 0, 0, 0], pay: ['ELETTRONICO', 1, 1] }),
  customer('Bruno Francesca', 'privato', { staff: [0, 0, 0, 1], isee: true, pay: ['CONTANTI', 1, 1] }),
  customer('Gallo Elettronica S.r.l.', 'srl', { staff: [5, 1, 0, 0], pay: ['ELETTRONICO', 1, 1] }),
  customer('Conti Andrea Serramenti', 'ditta', { staff: [0, 1, 0, 0], pay: ['MISTO', 3, 0.9] }),
  customer('Panificio De Luca S.n.c.', 'snc', { retail: true, staff: [4, 0, 0, 0], pay: ['CONTANTI', 1, 1] }),
  customer('Mancini Consulting S.r.l.', 'srl', { staff: [0, 0, 2, 0], pay: ['ELETTRONICO', 3, 1] }),
  customer('Costa Marta', 'privato', { pay: ['ELETTRONICO', 1, 1] }),
  customer('Giordano Giardini S.a.s.', 'sas', { staff: [3, 0, 0, 0], pay: ['ELETTRONICO', 3, 0.85] }),
  customer('Farmacia Lombardi S.n.c.', 'snc', { regime: 'ordinaria', retail: true, staff: [4, 0, 0, 0], pay: ['ELETTRONICO', 1, 1] }),
  customer('Moretti Luca', 'privato', { isee: true, imu: true, pay: ['CONTANTI', 1, 1] }),
  customer('Autofficina Barbieri', 'ditta', { staff: [2, 0, 0, 0], pay: ['MISTO', 1, 0.97] }),
  customer('Associazione Sportiva Esempio', 'associazione', { staff: [0, 0, 3, 0], pay: ['ELETTRONICO', 3, 1] }),
  customer('Fontana Beatrice', 'privato', { pay: ['ELETTRONICO', 1, 1] }),
  customer('Santoro Edilizia S.r.l.', 'srl', { staff: [10, 1, 0, 0], pay: ['ELETTRONICO', 3, 0.6] }),
  customer('Caruso Valentina', 'privato', { staff: [0, 0, 0, 1], imu: true, pay: ['ELETTRONICO', 1, 1] }),
  customer('Bottega Neri Carlo', 'ditta', { retail: true, until: -1, pay: ['CONTANTI', 1, 0.8] }),
  customer('Galli Startup S.r.l.', 'srl', { since: -1, staff: [1, 0, 1, 0], pay: ['ELETTRONICO', 1, 1] }),
  customer('Nuova Impresa Demo S.r.l.s.', 'srl', { since: 0, staff: [2, 0, 0, 0], pay: ['ELETTRONICO', 1, 1] })
];

export const MONTH_NAMES = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'
];

export const CASH_EXPENSES = [
  ['Valori bollati', 16, 64], ['Spese postali e raccomandate', 8, 45], ['Cancelleria e toner', 25, 120],
  ['Diritti di segreteria', 10, 50], ['Acqua e caffè ufficio', 15, 40], ['Piccola manutenzione ufficio', 30, 150]
];
