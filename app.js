/* Giri in Moto – v2 */
const $ = (s) => document.querySelector(s);
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const ic = (n, cls = "ic") => `<svg class="${cls}"><use href="#i-${n}"/></svg>`;

// ---------- Stato ----------
let cfg = LS.get("gm_cfg", { casa: { lat: 45.4064, lon: 11.8768, n: "Casa (da impostare)" }, vel: 50, casaOk: false });
if (!cfg.mappa) cfg.mappa = "dark";
let mieiRitrovi = LS.get("gm_poi", []);
let salvati = LS.get("gm_giri", []);
let proposte = [];
let selIdx = -1;
let corrente = null;      // giro in modifica: {nome, tappe:[{n,lat,lon}], geo, km, min, avviso}
let modoTap = null;       // null | 'casa' | 'ritrovo'
const FATT_STRADA = 1.3;  // km su strada ≈ km in linea d'aria × 1.3

const tuttiPoi = () => POIS.concat(mieiRitrovi.map((p) => ({ ...p, mio: true })));
const ZONA_BREVE = { CASA: "Vicino a casa", VENETO: "Tutto il Veneto", PD: "Padova", VI: "Vicenza", TV: "Treviso", BL: "Dolomiti",
  VR: "Verona", VE: "Venezia", RO: "Delta del Po", TN: "Trentino" };
const TIPO = { passo: ["mountain-snow", "Passo"], ritrovo: ["coffee", "Ritrovo"], panorama: ["eye", "Panorama"], strada: ["route", "Strada"] };

// ---------- Utilità ----------
function toast(t, ms = 3000) { const e = $("#toast"); e.textContent = t; e.classList.add("on"); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove("on"), ms); }
const rad = (d) => (d * Math.PI) / 180;
function dist(a, b) { // km
  const R = 6371, dLa = rad(b.lat - a.lat), dLo = rad(b.lon - a.lon);
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function rotta(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (Math.atan2(y, x) * 180) / Math.PI;
}
function puntoA(da, gradi, km) {
  const R = 6371, d = km / R, br = rad(gradi), la1 = rad(da.lat), lo1 = rad(da.lon);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: (la2 * 180) / Math.PI, lon: (lo2 * 180) / Math.PI };
}
function stima(tappe) {
  const seq = [cfg.casa, ...tappe, cfg.casa];
  let s = 0; for (let i = 1; i < seq.length; i++) s += dist(seq[i - 1], seq[i]);
  return s * FATT_STRADA;
}
function permuta(a) {
  if (a.length <= 1) return [a];
  const out = [];
  a.forEach((x, i) => permuta(a.slice(0, i).concat(a.slice(i + 1))).forEach((p) => out.push([x, ...p])));
  return out;
}
function ordineMigliore(tappe) {
  if (tappe.length <= 5) {
    let best = null, bs = Infinity;
    for (const p of permuta(tappe)) { const s = stima(p); if (s < bs) { bs = s; best = p; } }
    return best;
  }
  return tappe; // tante tappe: lascio l'ordine dato
}
const durata = (min) => { const t = Math.round(min), h = Math.floor(t / 60), m = t % 60; return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
const direzione = (g) => ["nord", "nord-est", "est", "sud-est", "sud", "sud-ovest", "ovest", "nord-ovest"][Math.round(((g % 360) + 360) % 360 / 45) % 8];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

// ---------- Finestre (al posto di prompt/confirm) ----------
function chiedi({ titolo, testo = "", valore = "", segnaposto = "", secondo = null, ok = "OK", soloConferma = false }) {
  return new Promise((res) => {
    $("#dlgTitolo").textContent = titolo; $("#dlgTesto").textContent = testo;
    const i1 = $("#dlgInput"), i2 = $("#dlgInput2");
    i1.classList.toggle("hidden", soloConferma); i1.value = valore; i1.placeholder = segnaposto;
    i2.classList.toggle("hidden", !secondo); i2.value = ""; i2.placeholder = secondo || "";
    $("#dlgOk").querySelector("span").textContent = ok;
    $("#dialog").classList.remove("hidden");
    if (!soloConferma) setTimeout(() => i1.focus(), 60);
    const chiudi = (v) => { $("#dialog").classList.add("hidden"); $("#dlgOk").onclick = $("#dlgNo").onclick = null; res(v); };
    $("#dlgOk").onclick = () => chiudi(soloConferma ? true : { a: i1.value.trim(), b: i2.value.trim() });
    $("#dlgNo").onclick = () => chiudi(soloConferma ? false : null);
    i1.onkeydown = (e) => { if (e.key === "Enter" && !secondo) $("#dlgOk").click(); };
  });
}
const conferma = (titolo, testo, ok = "Elimina") => chiedi({ titolo, testo, ok, soloConferma: true });

// ---------- Pannello scorrevole ----------
const sheet = $("#sheet");
function altezze() {
  const vh = window.innerHeight, tab = 64 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-b")) || 0);
  const libero = vh - tab;
  return { low: Math.max(150, libero * 0.24), mid: libero * 0.56, high: libero - 72 };
}
let sheetPos = "mid";
function setSheet(pos) {
  sheetPos = pos;
  const h = altezze()[pos];
  document.documentElement.style.setProperty("--sheet-h", h + "px");
  sheet.dataset.pos = pos;
}
(function dragSheet() {
  const g = $("#grab"); let y0 = 0, h0 = 0, att = false;
  g.addEventListener("pointerdown", (e) => { att = true; y0 = e.clientY; h0 = sheet.getBoundingClientRect().height; sheet.classList.add("dragging"); g.setPointerCapture(e.pointerId); });
  g.addEventListener("pointermove", (e) => {
    if (!att) return; const a = altezze();
    const h = Math.min(a.high, Math.max(a.low * 0.7, h0 - (e.clientY - y0)));
    document.documentElement.style.setProperty("--sheet-h", h + "px");
  });
  const fine = (e) => {
    if (!att) return; att = false; sheet.classList.remove("dragging");
    const h = sheet.getBoundingClientRect().height, a = altezze(), mosso = Math.abs(e.clientY - y0) > 6;
    if (!mosso) { setSheet(sheetPos === "low" ? "mid" : sheetPos === "mid" ? "high" : "low"); return; }
    const vicino = Object.entries(a).sort((p, q) => Math.abs(p[1] - h) - Math.abs(q[1] - h))[0][0];
    setSheet(vicino);
  };
  g.addEventListener("pointerup", fine); g.addEventListener("pointercancel", fine);
  window.addEventListener("resize", () => setSheet(sheetPos));
})();
function bordiMappa() { // spazio occupato da barra e pannello, per inquadrare il giro nella parte visibile
  const h = sheet.getBoundingClientRect().height + 64;
  return { paddingTopLeft: [24, 80], paddingBottomRight: [24, h + 20] };
}

// ---------- Calcolo percorso (OSRM, gratuito, dati OpenStreetMap) ----------
async function calcola(tappe, noAuto) {
  const pts = [cfg.casa, ...tappe, cfg.casa].map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  const base = `https://router.project-osrm.org/route/v1/driving/${pts}?overview=full&geometries=geojson`;
  const prova = async (url) => {
    const r = await fetch(url);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.code !== "Ok") throw new Error(j?.message || "Errore " + r.status);
    return j.routes[0];
  };
  let rt, avviso = "";
  const AVVISO_AUTO = "Il server gratuito non sa evitare le autostrade: controlla il percorso.";
  if (noAuto && calcola.noExclude) { rt = await prova(base); avviso = AVVISO_AUTO; }
  else {
    try { rt = await prova(base + (noAuto ? "&exclude=motorway" : "")); }
    catch (e) {
      if (!noAuto) throw e;
      calcola.noExclude = /exclude/i.test(e.message); // il server non lo supporta: non ci riprovo
      rt = await prova(base); avviso = AVVISO_AUTO;
    }
  }
  // tempo in moto: OSRM è tarato sulle auto, aggiungo un 10% per curve e tornanti
  return { geo: rt.geometry.coordinates.map(([lo, la]) => [la, lo]), km: rt.distance / 1000, min: (rt.duration / 60) * 1.1, avviso };
}

// ---------- Mappa ----------
const map = L.map("map", { zoomControl: false, attributionControl: true }).setView([cfg.casa.lat, cfg.casa.lon], 9);
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
const ATTR_ESRI = "Mappa © Esri · dati © OpenStreetMap, HERE, Garmin";
const TILES = { // servizi senza chiave: funzionano anche dentro l'app Android
  dark: L.layerGroup([
    L.tileLayer(ESRI + "Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: ATTR_ESRI }),
    L.tileLayer(ESRI + "Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }),
  ]),
  light: L.tileLayer(ESRI + "World_Street_Map/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: ATTR_ESRI }),
};
let tiles = TILES[cfg.mappa].addTo(map);
function stileMappa(s) {
  map.removeLayer(tiles); tiles = TILES[s].addTo(map); cfg.mappa = s; LS.set("gm_cfg", cfg);
  map.setMaxZoom(s === "dark" ? 16 : 19);
  document.querySelectorAll("#mapStyle button").forEach((b) => b.classList.toggle("on", b.dataset.s === s));
}
const icona = (cls, html = "") => L.divIcon({ className: "", html: `<div class="pin ${cls}">${html}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
const casaHtml = '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>';
let casaMk = L.marker([cfg.casa.lat, cfg.casa.lon], { icon: icona("casa", casaHtml), zIndexOffset: 500 }).addTo(map).bindPopup("<b>Casa</b><br><small>Partenza e arrivo</small>");
const lyRoute = L.layerGroup().addTo(map);
const lyTappe = L.layerGroup().addTo(map);
const lyPoi = L.layerGroup().addTo(map);

function disegnaPoi() {
  lyPoi.clearLayers();
  tuttiPoi().forEach((p) => {
    const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: `<div class="pin poi ${p.mio ? "mio" : p.t}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) });
    const div = document.createElement("div");
    div.innerHTML = `<b>${esc(p.n)}</b><br><small>${esc(p.note || TIPO[p.t]?.[1] || "")}</small>`;
    const b = document.createElement("button"); b.textContent = corrente ? "Aggiungi al giro" : "Giro fin qui";
    b.onclick = () => { map.closePopup(); usaPoi(p); };
    div.appendChild(b); m.bindPopup(div); lyPoi.addLayer(m);
  });
}

function disegnaGiro(g, fit = true) {
  lyRoute.clearLayers();
  if (!g?.geo) return;
  L.polyline(g.geo, { color: "#ff6a13", weight: 12, opacity: 0.22, interactive: false }).addTo(lyRoute); // alone
  const linea = L.polyline(g.geo, { color: "#ff6a13", weight: 4.5, opacity: 1 }).addTo(lyRoute);
  if (fit) map.fitBounds(linea.getBounds(), bordiMappa());
}

// ---------- Scelte rapide (chip) ----------
function chips(box, opzioni, valore, onScegli) {
  box.innerHTML = "";
  opzioni.forEach(([v, t]) => {
    const b = document.createElement("button"); b.className = "chip" + (String(v) === String(valore) ? " on" : ""); b.textContent = t; b.dataset.v = v;
    b.onclick = () => { box.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === b)); onScegli(v); };
    box.appendChild(b);
  });
}
function aggiornaCruscotto() {
  const km = +$("#km").value, ore = +$("#ore").value;
  $("#kmVal").textContent = km;
  const r = $("#km"); r.style.setProperty("--p", ((km - r.min) / (r.max - r.min)) * 100 + "%");
  const max = ore > 0 ? Math.round(ore * cfg.vel) : 0;
  if (max && km > max) { $("#kmTempo").textContent = `max ${max} km`; $("#kmTempo").nextElementSibling.textContent = `in ${$("#ore").selectedOptions[0].text}`; }
  else { $("#kmTempo").textContent = durata((km / cfg.vel) * 60); $("#kmTempo").nextElementSibling.textContent = "di guida stimata"; }
}

// ---------- Generazione proposte ----------
function poolPerZona(zona, target) {
  let pool = tuttiPoi();
  if (zona === "CASA") pool = pool.filter((p) => 2 * dist(cfg.casa, p) * FATT_STRADA <= target * 1.05);
  else if (zona === "VENETO") pool = pool.filter((p) => p.p !== "TN");
  else pool = pool.filter((p) => p.p === zona);
  return pool;
}

function combinazioni(pool, target) {
  const viste = new Map();
  const kMax = Math.min(4, pool.length);
  for (let i = 0; i < 4000 && pool.length; i++) {
    const k = 1 + Math.floor(Math.random() * kMax);
    const scelta = [...pool].sort(() => Math.random() - 0.5).slice(0, k);
    const chiave = scelta.map((p) => p.n).sort().join("|");
    if (viste.has(chiave)) continue;
    const ord = ordineMigliore(scelta);
    const est = stima(ord);
    viste.set(chiave, { tappe: ord, est, scarto: Math.abs(est - target) / target });
  }
  const tutte = [...viste.values()].sort((a, b) => a.scarto - b.scarto);
  const scelte = [];
  for (const c of tutte) {
    if (c.scarto > 0.35 || scelte.length >= 3) break;
    const nomi = new Set(c.tappe.map((t) => t.n));
    const troppoSimile = scelte.some((s) => {
      const comuni = s.tappe.filter((t) => nomi.has(t.n)).length;
      return comuni / Math.max(nomi.size, s.tappe.length) >= 0.5;
    });
    if (!troppoSimile) scelte.push(c);
  }
  const minimo = tutte.length ? Math.min(...tutte.map((c) => c.est)) : 0;
  return { scelte, minimo };
}

function giroLibero(gradi, target) {
  const r = target / (3 * FATT_STRADA); // triangolo casa → A → B → casa
  return [puntoA(cfg.casa, gradi - 30, r), puntoA(cfg.casa, gradi + 30, r)].map((p, i) => ({ ...p, n: `Punto ${i + 1}`, libero: true }));
}

async function proponi() {
  const btn = $("#btnProponi");
  let target = +$("#km").value;
  const ore = +$("#ore").value, zona = $("#zona").value, noAuto = $("#noAuto").checked, conRitrovi = $("#ritrovi").checked;
  if (ore > 0 && target > ore * cfg.vel) {
    target = Math.round(ore * cfg.vel);
    toast(`In ${$("#ore").selectedOptions[0].text} stanno circa ${target} km: calcolo su quelli.`, 4500);
  }
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span><span>Calcolo i giri…</span>';
  $("#proposte").innerHTML = ""; $("#dots").innerHTML = "";
  proposte = []; selIdx = -1;

  const bozze = [];
  if (conRitrovi) {
    const pool = poolPerZona(zona, target);
    const { scelte, minimo } = combinazioni(pool, target);
    if (!scelte.length && minimo > target) toast(`Per ${ZONE[zona].n} servono almeno ~${Math.round(minimo / 10) * 10} km.`, 5000);
    scelte.forEach((c) => bozze.push({ nome: c.tappe.map((t) => t.n.split(" (")[0]).join(" · "), tappe: c.tappe }));
  }
  // completo con giri "liberi" fino ad averne 3
  const verso = ZONE[zona]?.c ? rotta(cfg.casa, { lat: ZONE[zona].c[0], lon: ZONE[zona].c[1] }) : Math.random() * 360;
  const dir = [verso, verso + 120, verso - 120];
  let j = 0;
  while (bozze.length < 3) {
    const g = ZONE[zona]?.c ? verso + (j - 1) * 35 : dir[j];
    bozze.push({ nome: `Giro libero verso ${direzione(g)}`, tappe: giroLibero(g, target), libero: true, gradi: g });
    j++;
  }

  for (const b of bozze) {
    try {
      let r = await calcola(b.tappe, noAuto);
      if (b.libero && Math.abs(r.km - target) / target > 0.2) { // ricalibro una volta
        await sleep(400);
        const fatt = target / r.km;
        b.tappe = giroLibero(b.gradi, target * fatt);
        r = await calcola(b.tappe, noAuto);
      }
      proposte.push({ ...b, ...r, noAuto });
      mostraProposte();
      if (proposte.length === 1) { selezionaProposta(0); $("#proposteWrap").scrollIntoView({ behavior: "smooth", block: "start" }); }
    } catch (e) {
      toast("Errore nel calcolo: " + e.message);
    }
    await sleep(400); // il server gratuito non ama le raffiche
  }
  btn.disabled = false; btn.innerHTML = `<span>Proponi altri giri</span>${ic("refresh-cw")}`;
}

function mostraProposte() {
  $("#proposteWrap").classList.toggle("hidden", !proposte.length);
  const box = $("#proposte"); box.innerHTML = "";
  proposte.forEach((p, i) => {
    const d = document.createElement("article");
    d.className = "prop" + (i === selIdx ? " sel" : ""); d.id = "prop" + i; d.dataset.i = i;
    const nomiTappe = p.tappe.filter((t) => !t.libero).map((t) => t.n.split(" (")[0].split(" – ")[0]);
    d.innerHTML = `<span class="n">${i + 1}</span>
      <h3>${esc(p.nome)}</h3>
      <div class="nums"><div><span class="num-l">${Math.round(p.km)}</span><small>km</small></div><div><span class="num-l">${durata(p.min)}</span></div></div>
      <div class="via">${nomiTappe.length ? nomiTappe.map((n) => `<span>${esc(n)}</span>`).join("") : "<span>Anello libero, senza tappe fisse</span>"}</div>
      ${p.avviso ? `<div class="warn">${esc(p.avviso)}</div>` : ""}
      <div class="acts"><button class="btn-sec" data-a="mod">${ic("pencil")}Modifica</button><button class="btn-sec" data-a="gpx">${ic("download")}GPX</button></div>`;
    d.onclick = (ev) => {
      const a = ev.target.closest("[data-a]")?.dataset.a;
      if (a === "mod") apriModifica(structuredClone(p));
      else if (a === "gpx") scaricaGpx(p);
      else { selezionaProposta(i); d.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }
    };
    box.appendChild(d);
  });
  $("#dots").innerHTML = proposte.map((_, i) => `<span class="${i === selIdx ? "on" : ""}"></span>`).join("");
  $("#propHint").textContent = proposte.length > 1 ? "scorri per vederle" : "";
}
// scorrendo il carosello, mostro sulla mappa la proposta al centro
$("#proposte").addEventListener("scroll", () => {
  clearTimeout(mostraProposte._t);
  mostraProposte._t = setTimeout(() => {
    const box = $("#proposte"), c = box.getBoundingClientRect().left + box.clientWidth / 2;
    let best = 0, bd = Infinity;
    box.querySelectorAll(".prop").forEach((el, i) => { const r = el.getBoundingClientRect(); const d = Math.abs(r.left + r.width / 2 - c); if (d < bd) { bd = d; best = i; } });
    if (best !== selIdx) selezionaProposta(best);
  }, 120);
}, { passive: true });
function selezionaProposta(i) {
  selIdx = i;
  document.querySelectorAll(".prop").forEach((e, k) => e.classList.toggle("sel", k === i));
  document.querySelectorAll("#dots span").forEach((e, k) => e.classList.toggle("on", k === i));
  disegnaGiro(proposte[i]);
  lyTappe.clearLayers();
  proposte[i].tappe.forEach((t, k) => L.marker([t.lat, t.lon], { icon: icona("", k + 1) }).addTo(lyTappe));
}

// ---------- Modifica ----------
function apriModifica(g) {
  corrente = g;
  vai("v-modifica");
  disegnaPoi();
  renderModifica(true);
}
function renderModifica(fit = false) {
  const g = corrente; if (!g) return;
  $("#modTitolo").textContent = g.nome || "Il mio giro";
  $("#modStats").innerHTML = [[g.km ? Math.round(g.km) : "–", "km"], [g.km ? durata(g.min) : "–", "di guida"], [g.tappe.length, g.tappe.length === 1 ? "tappa" : "tappe"]]
    .map(([v, t]) => `<div class="stat"><span class="num-l">${v}</span><small>${t}</small></div>`).join("");
  $("#modInfo").classList.toggle("hidden", !g.avviso && !!g.tappe.length);
  $("#modInfo").textContent = !g.tappe.length ? "Aggiungi almeno una tappa toccando la mappa." : g.avviso || "";
  const ol = $("#tappe"); ol.innerHTML = "";
  const casaLi = (t) => `<li><span class="dot home">${ic("house")}</span><span class="name">Casa<small>${t}</small></span></li>`;
  ol.insertAdjacentHTML("beforeend", casaLi("partenza"));
  g.tappe.forEach((t, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="dot">${i + 1}</span><span class="name">${esc(t.n)}</span>
      <span class="tools"><button data-a="su" aria-label="Sposta su" ${i === 0 ? "disabled" : ""}>${ic("chevron-up")}</button>
      <button data-a="giu" aria-label="Sposta giù" ${i === g.tappe.length - 1 ? "disabled" : ""}>${ic("chevron-down")}</button>
      <button data-a="via" aria-label="Rimuovi">${ic("x")}</button></span>`;
    li.onclick = (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a; if (!a) { map.setView([t.lat, t.lon], 12); return; }
      if (a === "via") { g.tappe.splice(i, 1); ricalcola(); return; }
      const k = i + (a === "su" ? -1 : 1); if (k < 0 || k >= g.tappe.length) return;
      [g.tappe[i], g.tappe[k]] = [g.tappe[k], g.tappe[i]]; ricalcola();
    };
    ol.appendChild(li);
  });
  ol.insertAdjacentHTML("beforeend", casaLi("arrivo"));
  disegnaGiro(g, fit);
  lyTappe.clearLayers();
  g.tappe.forEach((t, i) => {
    const m = L.marker([t.lat, t.lon], { icon: icona("", i + 1), draggable: true }).addTo(lyTappe);
    const div = document.createElement("div"); div.innerHTML = `<b>${esc(t.n)}</b>`;
    const b = document.createElement("button"); b.textContent = "Rimuovi tappa";
    b.onclick = () => { map.closePopup(); g.tappe.splice(i, 1); ricalcola(); };
    div.appendChild(b); m.bindPopup(div);
    m.on("dragend", () => { const ll = m.getLatLng(); g.tappe[i] = { n: "Punto scelto da te", lat: ll.lat, lon: ll.lng }; ricalcola(); });
  });
}
let ricTok = 0;
async function ricalcola() {
  renderModifica();
  if (!corrente.tappe.length) { corrente.geo = null; corrente.km = 0; renderModifica(); return; }
  const tok = ++ricTok;
  $("#modStats").querySelector(".num-l").innerHTML = '<span class="spin"></span>';
  await sleep(300);
  if (tok !== ricTok) return;
  try {
    const r = await calcola(corrente.tappe, corrente.noAuto !== false);
    if (tok !== ricTok) return;
    Object.assign(corrente, r);
  } catch (e) { toast("Errore nel calcolo: " + e.message); }
  renderModifica();
}
function inserisciTappa(t) {
  // la metto nel punto del giro dove allunga di meno
  const g = corrente; let best = 0, bs = Infinity;
  for (let i = 0; i <= g.tappe.length; i++) {
    const prova = [...g.tappe.slice(0, i), t, ...g.tappe.slice(i)];
    const s = stima(prova); if (s < bs) { bs = s; best = i; }
  }
  g.tappe.splice(best, 0, t);
  ricalcola();
}
function usaPoi(p) {
  const t = { n: p.n, lat: p.lat, lon: p.lon };
  if (corrente) { vai("v-modifica"); inserisciTappa(t); toast("Aggiunto: " + p.n); }
  else { apriModifica({ nome: "Giro verso " + p.n, tappe: [t], noAuto: $("#noAuto").checked }); ricalcola(); }
}
async function rinomina() {
  if (!corrente) return;
  const r = await chiedi({ titolo: "Nome del giro", valore: corrente.nome || "", ok: "Salva nome" });
  if (r && r.a) { corrente.nome = r.a; renderModifica(); }
}

map.on("click", async (e) => {
  const ll = { lat: e.latlng.lat, lon: e.latlng.lng };
  if (modoTap === "casa") { modoTap = null; impostaCasa(ll); setSheet("mid"); return; }
  if (modoTap === "ritrovo") {
    modoTap = null;
    const r = await chiedi({ titolo: "Nuovo ritrovo", segnaposto: "Nome (es. Bar da Gino)", secondo: "Nota (facoltativa)", ok: "Salva" });
    if (!r || !r.a) return;
    mieiRitrovi.push({ n: r.a, note: r.b, lat: ll.lat, lon: ll.lon, p: "MIEI", t: "ritrovo" });
    LS.set("gm_poi", mieiRitrovi); disegnaPoi(); renderRitrovi(); setSheet("mid"); toast("Ritrovo salvato");
    return;
  }
  if ($("#v-modifica").classList.contains("attiva") && corrente) inserisciTappa({ n: "Punto scelto da te", ...ll });
});

// ---------- GPX ----------
function semplifica(pts, tol = 0.00004) { // Douglas-Peucker: alleggerisce la traccia per i navigatori
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]; let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function creaGpx(g) {
  const nome = g.nome || "Giro in moto";
  const wpt = [{ ...cfg.casa, n: "Partenza – Casa" }, ...g.tappe].map((t) => `  <wpt lat="${t.lat.toFixed(6)}" lon="${t.lon.toFixed(6)}"><name>${esc(t.n)}</name></wpt>`).join("\n");
  const trk = semplifica(g.geo).map(([la, lo]) => `      <trkpt lat="${la.toFixed(6)}" lon="${lo.toFixed(6)}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Giri in Moto" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(nome)}</name><desc>${Math.round(g.km)} km</desc></metadata>
${wpt}
  <trk><name>${esc(nome)}</name><trkseg>
${trk}
  </trkseg></trk>
</gpx>`;
}
async function scaricaGpx(g) {
  if (!g?.geo) return toast("Prima calcola il percorso");
  const nomeFile = (g.nome || "giro").replace(/[^\w\- àèéìòù·]/gi, "").replace(/[\s·]+/g, "_").slice(0, 60) + ".gpx";
  const testo = creaGpx(g);
  if (NATIVE) { // app Android: salvo nella cache e apro "Condividi" (navigatore, Drive, WhatsApp…)
    try {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      const w = await Filesystem.writeFile({ path: nomeFile, data: testo, directory: "CACHE", encoding: "utf8" });
      await Share.share({ title: g.nome || "Giro in moto", files: [w.uri] });
    } catch (e) { if (!/cancel/i.test(e?.message || "")) toast("Condivisione non riuscita"); }
    return;
  }
  const blob = new Blob([testo], { type: "application/gpx+xml" });
  const file = new File([blob], nomeFile, { type: "application/gpx+xml" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: g.nome }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nomeFile; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- Salvati ----------
async function salva() {
  if (!corrente?.geo) return toast("Niente da salvare");
  const r = await chiedi({ titolo: "Salva il giro", valore: corrente.nome || "", segnaposto: "Nome del giro", ok: "Salva" });
  if (!r) return;
  corrente.nome = r.a || corrente.nome;
  const rec = { ...structuredClone(corrente), id: corrente.id || Date.now(), data: new Date().toISOString() };
  salvati = salvati.filter((s) => s.id !== rec.id); salvati.unshift(rec); corrente.id = rec.id;
  LS.set("gm_giri", salvati); renderSalvati(); renderModifica(); toast("Giro salvato");
}
const vuoto = (icona, testo) => `<div class="empty">${ic(icona)}<div>${testo}</div></div>`;
function renderSalvati() {
  const box = $("#listaSalvati");
  $("#salCount").textContent = salvati.length ? `${salvati.length} ${salvati.length === 1 ? "giro" : "giri"}` : "";
  if (!salvati.length) { box.innerHTML = vuoto("bookmark", "Nessun giro salvato.<br>Apri una proposta, sistemala e premi Salva."); return; }
  box.innerHTML = "";
  salvati.forEach((g) => {
    const d = document.createElement("div"); d.className = "item";
    d.innerHTML = `<span class="type ritrovo">${ic("route")}</span>
      <div class="body"><b>${esc(g.nome)}</b><small>${Math.round(g.km)} km · ${durata(g.min)} · ${new Date(g.data).toLocaleDateString("it-IT")}</small></div>
      <div class="btns"><button data-a="gpx" aria-label="GPX">${ic("download")}</button><button data-a="del" aria-label="Elimina">${ic("trash-2")}</button><button class="go" data-a="apri">Apri</button></div>`;
    d.onclick = async (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "gpx") scaricaGpx(g);
      else if (a === "del") { if (await conferma("Eliminare il giro?", g.nome)) { salvati = salvati.filter((s) => s.id !== g.id); LS.set("gm_giri", salvati); renderSalvati(); } }
      else if (a === "apri") apriModifica(structuredClone(g));
      else { disegnaGiro(g); lyTappe.clearLayers(); }
    };
    box.appendChild(d);
  });
}

// ---------- Ritrovi ----------
function renderRitrovi() {
  const f = $("#filtroProv").value;
  const lista = tuttiPoi().filter((p) => f === "TUTTI" || p.p === f || (f === "MIEI" && p.mio))
    .map((p) => ({ ...p, d: dist(cfg.casa, p) })).sort((a, b) => a.d - b.d);
  $("#ritCount").textContent = `${lista.length} luoghi`;
  const box = $("#listaRitrovi"); box.innerHTML = "";
  if (!lista.length) { box.innerHTML = vuoto("flag", f === "MIEI" ? "Non hai ancora ritrovi tuoi.<br>Premi «Aggiungi un mio ritrovo»." : "Nessun luogo in questa zona."); return; }
  lista.forEach((p) => {
    const [icona, nomeTipo] = p.mio ? ["flag", "Mio ritrovo"] : TIPO[p.t] || ["map-pin", ""];
    const d = document.createElement("div"); d.className = "item";
    d.innerHTML = `<span class="type ${p.mio ? "ritrovo" : p.t}">${ic(icona)}</span>
      <div class="body"><b>${esc(p.n)}</b><small>${esc(p.note || nomeTipo)} · ${Math.round(p.d * FATT_STRADA)} km da casa</small></div>
      <div class="btns"><button data-a="map" aria-label="Mostra sulla mappa">${ic("map")}</button>
      ${p.mio ? `<button data-a="del" aria-label="Elimina">${ic("trash-2")}</button>` : ""}
      <button class="go" data-a="giro">${corrente ? "+ Giro" : "Giro"}</button></div>`;
    d.onclick = async (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "map") { setSheet("low"); map.setView([p.lat, p.lon], 12); }
      else if (a === "giro") usaPoi(p);
      else if (a === "del" && await conferma("Eliminare il ritrovo?", p.n)) {
        mieiRitrovi = mieiRitrovi.filter((m) => !(m.n === p.n && m.lat === p.lat)); LS.set("gm_poi", mieiRitrovi); disegnaPoi(); renderRitrovi();
      }
    };
    box.appendChild(d);
  });
}

// ---------- Casa ----------
function impostaCasa(ll) {
  cfg.casa = { lat: ll.lat, lon: ll.lon, n: "Casa" }; cfg.casaOk = true;
  LS.set("gm_cfg", cfg); casaMk.setLatLng([ll.lat, ll.lon]); renderCasa(); renderRitrovi(); toast("Casa impostata");
}
function renderCasa() {
  $("#casaInfo").innerHTML = cfg.casaOk ? `Impostata · ${cfg.casa.lat.toFixed(4)}, ${cfg.casa.lon.toFixed(4)}` : "Non ancora impostata";
  $("#velMedia").value = cfg.vel; $("#velVal").textContent = cfg.vel;
  $("#stato").textContent = cfg.casaOk ? "Casa" : "Imposta casa";
  $("#chipCasa").classList.toggle("warn", !cfg.casaOk);
  aggiornaCruscotto();
}
function usaGps(dopo) {
  if (!navigator.geolocation) return toast("Posizione non disponibile");
  toast("Cerco la posizione…", 8000);
  navigator.geolocation.getCurrentPosition(
    (p) => { impostaCasa({ lat: p.coords.latitude, lon: p.coords.longitude }); map.setView([p.coords.latitude, p.coords.longitude], 12); dopo && dopo(); },
    () => toast("Posizione non disponibile: scegli casa sulla mappa", 4500), { enableHighAccuracy: true, timeout: 15000 });
}
function scegliCasaSullaMappa() { modoTap = "casa"; setSheet("low"); toast("Tocca la mappa sul punto di casa", 5000); }
function cambiaVel(d) { cfg.vel = Math.max(25, Math.min(90, cfg.vel + d)); LS.set("gm_cfg", cfg); renderCasa(); }

// ---------- Navigazione ----------
const POS_VISTA = { "v-giro": "mid", "v-modifica": "mid", "v-ritrovi": "high", "v-salvati": "mid", "v-imp": "high" };
function vai(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("attiva", v.id === id));
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("attiva", b.dataset.v === id || (id === "v-modifica" && b.dataset.v === "v-giro")));
  $("#sheetBody").scrollTop = 0;
  setSheet(POS_VISTA[id] || "mid");
}
document.querySelectorAll(".tabbar button").forEach((b) => b.onclick = () => {
  if (b.dataset.v === "v-giro" && corrente && !$("#v-modifica").classList.contains("attiva")) { vai("v-modifica"); return; }
  vai(b.dataset.v);
});
function esciModifica() {
  corrente = null; disegnaPoi(); renderRitrovi(); vai("v-giro");
  if (proposte.length) selezionaProposta(Math.max(0, selIdx)); else { lyRoute.clearLayers(); lyTappe.clearLayers(); }
}

// ---------- Avvio ----------
Object.entries(ZONE).forEach(([k, z]) => $("#zona").add(new Option(z.n, k)));
chips($("#zonaChips"), Object.keys(ZONE).map((k) => [k, ZONA_BREVE[k] || ZONE[k].n]), $("#zona").value, (v) => { $("#zona").value = v; });
chips($("#oreChips"), [...$("#ore").options].map((o) => [o.value, o.value === "0" ? "Libero" : o.value.replace(".5", " h 30").replace(/^(\d+)$/, "$1 h")]), $("#ore").value,
  (v) => { $("#ore").value = v; aggiornaCruscotto(); });
$("#filtroProv").add(new Option("Tutte", "TUTTI"));
Object.entries(ZONE).filter(([k]) => ZONE[k].c).forEach(([k]) => $("#filtroProv").add(new Option(ZONA_BREVE[k], k)));
$("#filtroProv").add(new Option("I miei", "MIEI"));
chips($("#filtroChips"), [...$("#filtroProv").options].map((o) => [o.value, o.text]), "TUTTI", (v) => { $("#filtroProv").value = v; renderRitrovi(); });

$("#km").oninput = aggiornaCruscotto;
$("#btnProponi").onclick = proponi;
$("#btnGpx").onclick = () => scaricaGpx(corrente);
$("#btnSalva").onclick = salva;
$("#btnRinomina").onclick = rinomina;
$("#btnIndietro").onclick = esciModifica;
$("#btnNuovoRitrovo").onclick = () => { modoTap = "ritrovo"; setSheet("low"); toast("Tocca la mappa dove si trova il ritrovo", 5000); };
$("#btnTapCasa").onclick = scegliCasaSullaMappa;
$("#btnGps").onclick = () => usaGps();
$("#velMeno").onclick = () => cambiaVel(-5);
$("#velPiu").onclick = () => cambiaVel(5);
$("#chipCasa").onclick = () => vai("v-imp");
document.querySelectorAll("#mapStyle button").forEach((b) => b.onclick = () => stileMappa(b.dataset.s));
$("#btnCentra").onclick = () => {
  const linee = lyRoute.getLayers();
  if (linee.length) map.fitBounds(linee[linee.length - 1].getBounds(), bordiMappa());
  else map.setView([cfg.casa.lat, cfg.casa.lon], 11);
};
$("#obGps").onclick = () => usaGps(() => $("#onboard").classList.add("hidden"));
$("#obMappa").onclick = () => { $("#onboard").classList.add("hidden"); vai("v-giro"); scegliCasaSullaMappa(); };

stileMappa(cfg.mappa);
setSheet("mid");
disegnaPoi(); renderRitrovi(); renderSalvati(); renderCasa();
if (!cfg.casaOk) $("#onboard").classList.remove("hidden");

// tasto Indietro di Android
if (NATIVE && window.Capacitor.Plugins.App) window.Capacitor.Plugins.App.addListener("backButton", () => {
  if (!$("#dialog").classList.contains("hidden")) return $("#dlgNo").click();
  if ($("#v-modifica").classList.contains("attiva")) return esciModifica();
  if (!$("#v-giro").classList.contains("attiva")) return vai(corrente ? "v-modifica" : "v-giro");
  if (sheetPos !== "mid") return setSheet("mid");
  window.Capacitor.Plugins.App.exitApp();
});
if (!NATIVE && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
