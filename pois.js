// Ritrovi e mete classiche dei motociclisti (Veneto + confine trentino).
// Coordinate approssimate: il calcolo del percorso le aggancia alla strada più vicina.
// tipo: passo | ritrovo | panorama | strada
const POIS = [
  // PADOVA – Colli Euganei
  { n: "Monte Venda (Colli Euganei)", lat: 45.3156, lon: 11.6890, p: "PD", t: "panorama", note: "Salita tra i tornanti dei Colli" },
  { n: "Passo Fiorine – Castelnuovo", lat: 45.3335, lon: 11.6905, p: "PD", t: "strada", note: "Strada panoramica dei Colli" },
  { n: "Teolo", lat: 45.3480, lon: 11.6720, p: "PD", t: "ritrovo", note: "Bar e piazza, classico giro dei Colli" },
  { n: "Arquà Petrarca", lat: 45.2700, lon: 11.7170, p: "PD", t: "ritrovo", note: "Borgo medievale" },
  { n: "Rocca Pendice – Torreglia", lat: 45.3290, lon: 11.7000, p: "PD", t: "strada", note: "Curve tra i boschi" },

  // VICENZA
  { n: "Bassano – Ponte degli Alpini", lat: 45.7660, lon: 11.7340, p: "VI", t: "ritrovo", note: "Sosta classica prima del Grappa" },
  { n: "Marostica", lat: 45.7460, lon: 11.6560, p: "VI", t: "ritrovo", note: "Piazza degli Scacchi" },
  { n: "Asiago", lat: 45.8750, lon: 11.5100, p: "VI", t: "ritrovo", note: "Altopiano dei Sette Comuni" },
  { n: "Strada del Costo (Treschè Conca)", lat: 45.8575, lon: 11.4880, p: "VI", t: "strada", note: "Tornanti verso l'Altopiano" },
  { n: "Passo Xomo", lat: 45.7870, lon: 11.2360, p: "VI", t: "passo", note: "Tra Posina e Schio" },
  { n: "Pian delle Fugazze", lat: 45.7613, lon: 11.1750, p: "VI", t: "passo", note: "Passo storico del Pasubio" },
  { n: "Campogrosso", lat: 45.7228, lon: 11.1717, p: "VI", t: "passo", note: "Piccole Dolomiti" },
  { n: "Colli Berici – Lago di Fimon", lat: 45.4836, lon: 11.5450, p: "VI", t: "strada", note: "Giro corto e curvoso" },
  { n: "Tonezza del Cimone", lat: 45.8600, lon: 11.3450, p: "VI", t: "panorama", note: "Salita da Arsiero" },

  // TREVISO
  { n: "Cima Grappa", lat: 45.8706, lon: 11.8045, p: "TV", t: "passo", note: "Il ritrovo per eccellenza, strada Cadorna" },
  { n: "Asolo", lat: 45.8000, lon: 11.9130, p: "TV", t: "ritrovo", note: "Borgo sui colli" },
  { n: "Montello – Sacrario di Nervesa", lat: 45.8250, lon: 12.2050, p: "TV", t: "strada", note: "Le prese del Montello" },
  { n: "Strada del Prosecco – Valdobbiadene", lat: 45.9000, lon: 11.9960, p: "TV", t: "strada", note: "Colline UNESCO" },
  { n: "Combai", lat: 45.9390, lon: 12.0700, p: "TV", t: "ritrovo", note: "Colline del Prosecco" },
  { n: "Passo San Boldo", lat: 46.0193, lon: 12.1640, p: "TV", t: "passo", note: "Tornanti in galleria, famosissimo" },
  { n: "Pian del Cansiglio", lat: 46.0610, lon: 12.4050, p: "BL", t: "ritrovo", note: "Foresta e rifugi" },

  // BELLUNO – Dolomiti
  { n: "Lago di Santa Croce", lat: 46.1000, lon: 12.3300, p: "BL", t: "panorama", note: "Sosta lungo l'Alemagna" },
  { n: "Passo Croce d'Aune", lat: 46.0480, lon: 11.8320, p: "BL", t: "passo", note: "Sopra Feltre" },
  { n: "Passo Duran", lat: 46.3310, lon: 12.1280, p: "BL", t: "passo", note: "Stretto e selvaggio" },
  { n: "Passo Staulanza", lat: 46.4150, lon: 12.0900, p: "BL", t: "passo", note: "Val di Zoldo – Pelmo" },
  { n: "Passo Giau", lat: 46.4830, lon: 12.0540, p: "BL", t: "passo", note: "Uno dei più belli delle Dolomiti" },
  { n: "Passo Falzarego", lat: 46.5190, lon: 12.0090, p: "BL", t: "passo", note: "Ritrovo motociclisti affollato" },
  { n: "Passo Valparola", lat: 46.5340, lon: 11.9890, p: "BL", t: "passo", note: "Dopo il Falzarego" },
  { n: "Passo Fedaia", lat: 46.4600, lon: 11.8700, p: "BL", t: "passo", note: "Lago sotto la Marmolada" },
  { n: "Passo Tre Croci", lat: 46.5560, lon: 12.2050, p: "BL", t: "passo", note: "Cortina – Misurina" },
  { n: "Lago di Misurina", lat: 46.5820, lon: 12.2540, p: "BL", t: "panorama", note: "Tre Cime sullo sfondo" },
  { n: "Passo Cibiana", lat: 46.3920, lon: 12.2680, p: "BL", t: "passo", note: "Paese dei murales" },
  { n: "Passo Cereda", lat: 46.1930, lon: 11.9050, p: "BL", t: "passo", note: "Tra Agordino e Primiero" },
  { n: "Passo Valles", lat: 46.3380, lon: 11.8000, p: "BL", t: "passo", note: "Tranquillo e panoramico" },
  { n: "Passo San Pellegrino", lat: 46.3800, lon: 11.7860, p: "BL", t: "passo", note: "Confine Veneto–Trentino" },
  { n: "Nevegal", lat: 46.0950, lon: 12.2200, p: "BL", t: "panorama", note: "Sopra Belluno" },

  // VERONA
  { n: "Monte Baldo – Ferrara di M. Baldo", lat: 45.6750, lon: 10.8600, p: "VR", t: "strada", note: "Vista sul Garda" },
  { n: "Prada – San Zeno di Montagna", lat: 45.6550, lon: 10.7480, p: "VR", t: "panorama", note: "Strada panoramica del Baldo" },
  { n: "Malcesine (Gardesana)", lat: 45.7630, lon: 10.8090, p: "VR", t: "ritrovo", note: "Lungolago del Garda" },
  { n: "Bosco Chiesanuova (Lessinia)", lat: 45.6200, lon: 11.0310, p: "VR", t: "ritrovo", note: "Altopiano della Lessinia" },
  { n: "Bolca", lat: 45.5980, lon: 11.2070, p: "VR", t: "strada", note: "Strade curvose della Lessinia est" },

  // VENEZIA
  { n: "Riviera del Brenta – Villa Pisani", lat: 45.4110, lon: 12.0110, p: "VE", t: "ritrovo", note: "Giro corto delle ville" },
  { n: "Chioggia", lat: 45.2190, lon: 12.2790, p: "VE", t: "ritrovo", note: "Lungo la Romea" },
  { n: "Jesolo", lat: 45.5000, lon: 12.6400, p: "VE", t: "ritrovo", note: "Litorale" },
  { n: "Caorle", lat: 45.6000, lon: 12.8870, p: "VE", t: "ritrovo", note: "Borgo sul mare" },

  // ROVIGO
  { n: "Rosolina Mare", lat: 45.1400, lon: 12.3200, p: "RO", t: "ritrovo", note: "Litorale del Delta" },
  { n: "Delta del Po – Porto Tolle", lat: 44.9500, lon: 12.3260, p: "RO", t: "strada", note: "Strade sugli argini" },
  { n: "Delta del Po – Pila", lat: 44.9700, lon: 12.4800, p: "RO", t: "panorama", note: "Fino al faro" },

  // TRENTINO (vicino al Veneto)
  { n: "Passo Vezzena", lat: 45.9550, lon: 11.3420, p: "TN", t: "passo", note: "Dall'Altopiano di Asiago" },
  { n: "Passo Rolle", lat: 46.2970, lon: 11.7870, p: "TN", t: "passo", note: "Pale di San Martino" },
  { n: "Passo Pordoi", lat: 46.4870, lon: 11.8120, p: "TN", t: "passo", note: "Sella Ronda" },
  { n: "Passo Manghen", lat: 46.1750, lon: 11.4400, p: "TN", t: "passo", note: "Stretto e lungo" },
];

const ZONE = {
  CASA: { n: "Vicino a casa (qualsiasi direzione)" },
  VENETO: { n: "Tutto il Veneto" },
  PD: { n: "Padova", c: [45.35, 11.80] },
  VI: { n: "Vicenza", c: [45.75, 11.45] },
  TV: { n: "Treviso", c: [45.85, 12.15] },
  BL: { n: "Belluno – Dolomiti", c: [46.30, 12.10] },
  VR: { n: "Verona", c: [45.60, 10.95] },
  VE: { n: "Venezia", c: [45.45, 12.45] },
  RO: { n: "Rovigo – Delta del Po", c: [45.05, 12.10] },
  TN: { n: "Trentino (vicino al Veneto)", c: [46.20, 11.60] },
};
