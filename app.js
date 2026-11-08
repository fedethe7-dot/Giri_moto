/* Giri in Moto – v1 */
const $ = (s) => document.querySelector(s);
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- Stato ----------
let cfg = LS.get("gm_cfg", { casa: { lat: 45.4064, lon: 11.8768, n: "Casa (da impostare)" }, vel: 50, casaOk: false });
let mieiRitrovi = LS.get("gm_poi", []);
let salvati = LS.get("gm_giri", []);
let proposte = [];
let corrente = null;      // giro in modifica: {nome, tappe:[{n,lat,lon}], geo, km, min, avviso}
let modoTap = null;       // null | 'casa' | 'ritrovo'
const FATT_STRADA = 1.3;  // km su strada ≈ km in linea d'aria × 1.3

const tuttiPoi = () => POIS.concat(mieiRitrovi.map((p) => ({ ...p, mio: true })));

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
const durata = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
const direzione = (g) => ["nord", "nord-est", "est", "sud-est", "sud", "sud-ovest", "ovest", "nord-ovest"][Math.round(((g % 360) + 360) % 360 / 45) % 8];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  try { rt = await prova(base + (noAuto ? "&exclude=motorway" : "")); }
  catch (e) {
    if (!noAuto) throw e;
    rt = await prova(base); avviso = "Il server non ha potuto escludere le autostrade: controlla il percorso.";
  }
  // tempo in moto: OSRM è tarato sulle auto, aggiungo un 10% per curve e tornanti
  return { geo: rt.geometry.coordinates.map(([lo, la]) => [la, lo]), km: rt.distance / 1000, min: (rt.duration / 60) * 1.1, avviso };
}

// ---------- Mappa ----------
const map = L.map("map", { zoomControl: false }).setView([cfg.casa.lat, cfg.casa.lon], 9);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
const icona = (cls, txt = "") => L.divIcon({ className: "", html: `<div class="pin ${cls}">${txt}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
let casaMk = L.marker([cfg.casa.lat, cfg.casa.lon], { icon: icona("casa", "⌂") }).addTo(map).bindPopup("Casa");
const lyRoute = L.layerGroup().addTo(map);
const lyTappe = L.layerGroup().addTo(map);
const lyPoi = L.layerGroup().addTo(map);

function disegnaPoi() {
  lyPoi.clearLayers();
  tuttiPoi().forEach((p) => {
    const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", html: '<div class="pin poi"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) });
    const div = document.createElement("div");
    div.innerHTML = `<b>${p.n}</b><br><small>${p.note || ""}</small>`;
    const b = document.createElement("button"); b.textContent = corrente ? "+ Aggiungi al giro" : "Giro fin qui";
    b.onclick = () => { map.closePopup(); usaPoi(p); };
    div.appendChild(b); m.bindPopup(div); lyPoi.addLayer(m);
  });
}

function disegnaGiro(g, fit = true) {
  lyRoute.clearLayers();
  if (!g?.geo) return;
  const linea = L.polyline(g.geo, { color: "#ff7a1a", weight: 5, opacity: 0.9 }).addTo(lyRoute);
  if (fit) map.fitBounds(linea.getBounds(), { padding: [20, 20] });
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
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Calcolo i giri…';
  $("#proposte").innerHTML = "";
  proposte = [];

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
        b.tappe = giroLibero(b.gradi, (target / 1) * fatt);
        r = await calcola(b.tappe, noAuto);
      }
      proposte.push({ ...b, ...r, noAuto });
      mostraProposte();
    } catch (e) {
      toast("Errore nel calcolo: " + e.message);
    }
    await sleep(400); // il server gratuito non ama le raffiche
  }
  btn.disabled = false; btn.textContent = "Proponi altri giri";
  if (proposte[0]) selezionaProposta(0);
}

function mostraProposte() {
  const box = $("#proposte"); box.innerHTML = "";
  proposte.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "prop"; d.id = "prop" + i;
    const nomiTappe = p.tappe.filter((t) => !t.libero).map((t) => t.n);
    d.innerHTML = `<h3>${i + 1}. ${p.nome}</h3>
      <div class="num"><span><b>${Math.round(p.km)}</b> km</span><span><b>${durata(p.min)}</b> di guida</span></div>
      <div class="tp">${nomiTappe.length ? "Passa da: " + nomiTappe.join(", ") : "Anello senza tappe fisse"}</div>
      ${p.avviso ? `<div class="tp">⚠️ ${p.avviso}</div>` : ""}
      <div class="riga"><button class="sec" data-a="mod">✏️ Modifica</button><button class="sec" data-a="gpx">📥 GPX</button></div>`;
    d.onclick = (ev) => {
      const a = ev.target.dataset.a;
      if (a === "mod") apriModifica(structuredClone(p));
      else if (a === "gpx") scaricaGpx(p);
      else selezionaProposta(i);
    };
    box.appendChild(d);
  });
}
function selezionaProposta(i) {
  document.querySelectorAll(".prop").forEach((e) => e.classList.remove("sel"));
  $("#prop" + i)?.classList.add("sel");
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
  $("#modInfo").innerHTML = g.km ? `<b>${Math.round(g.km)} km</b> · <b>${durata(g.min)}</b> di guida · ${g.tappe.length} tappe${g.avviso ? "<br>⚠️ " + g.avviso : ""}` : "Aggiungi almeno una tappa toccando la mappa.";
  const ol = $("#tappe"); ol.innerHTML = "";
  g.tappe.forEach((t, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${t.n}</span>`;
    [["▲", -1], ["▼", 1]].forEach(([s, d]) => {
      const b = document.createElement("button"); b.textContent = s;
      b.onclick = () => { const k = i + d; if (k < 0 || k >= g.tappe.length) return; [g.tappe[i], g.tappe[k]] = [g.tappe[k], g.tappe[i]]; ricalcola(); };
      li.appendChild(b);
    });
    const x = document.createElement("button"); x.textContent = "✕"; x.onclick = () => { g.tappe.splice(i, 1); ricalcola(); };
    li.appendChild(x); ol.appendChild(li);
  });
  disegnaGiro(g, fit);
  lyTappe.clearLayers();
  g.tappe.forEach((t, i) => {
    const m = L.marker([t.lat, t.lon], { icon: icona("", i + 1), draggable: true }).addTo(lyTappe);
    const div = document.createElement("div"); div.innerHTML = `<b>${t.n}</b>`;
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
  $("#modInfo").innerHTML = '<span class="spin" style="border-color:#ff7a1a;border-top-color:transparent"></span>Ricalcolo il percorso…';
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
  else apriModifica({ nome: "Giro verso " + p.n, tappe: [t], noAuto: $("#noAuto").checked }), ricalcola();
}

map.on("click", (e) => {
  const ll = { lat: e.latlng.lat, lon: e.latlng.lng };
  if (modoTap === "casa") { impostaCasa(ll); modoTap = null; return; }
  if (modoTap === "ritrovo") {
    modoTap = null;
    const n = prompt("Nome del ritrovo:"); if (!n) return;
    const note = prompt("Nota (facoltativa):") || "";
    mieiRitrovi.push({ n, note, lat: ll.lat, lon: ll.lon, p: "MIEI", t: "ritrovo" });
    LS.set("gm_poi", mieiRitrovi); disegnaPoi(); renderRitrovi(); toast("Ritrovo salvato");
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
const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
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
  const blob = new Blob([creaGpx(g)], { type: "application/gpx+xml" });
  const file = new File([blob], nomeFile, { type: "application/gpx+xml" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: g.nome }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nomeFile; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- Salvati ----------
function salva() {
  if (!corrente?.geo) return toast("Niente da salvare");
  const n = prompt("Nome del giro:", corrente.nome || ""); if (n === null) return;
  corrente.nome = n || corrente.nome;
  const rec = { ...structuredClone(corrente), id: corrente.id || Date.now(), data: new Date().toISOString() };
  salvati = salvati.filter((s) => s.id !== rec.id); salvati.unshift(rec); corrente.id = rec.id;
  LS.set("gm_giri", salvati); renderSalvati(); renderModifica(); toast("Giro salvato");
}
function renderSalvati() {
  const box = $("#listaSalvati");
  if (!salvati.length) { box.innerHTML = '<p class="aiuto">Nessun giro salvato. Apri una proposta, sistemala e premi Salva.</p>'; return; }
  box.innerHTML = "";
  salvati.forEach((g) => {
    const d = document.createElement("div"); d.className = "rit";
    d.innerHTML = `<div><b>${esc(g.nome)}</b><small>${Math.round(g.km)} km · ${durata(g.min)} · ${new Date(g.data).toLocaleDateString("it-IT")}</small></div>`;
    [["Apri", () => apriModifica(structuredClone(g))], ["GPX", () => scaricaGpx(g)], ["🗑", () => { if (confirm("Eliminare " + g.nome + "?")) { salvati = salvati.filter((s) => s.id !== g.id); LS.set("gm_giri", salvati); renderSalvati(); } }]]
      .forEach(([t, f]) => { const b = document.createElement("button"); b.textContent = t; b.onclick = f; d.appendChild(b); });
    box.appendChild(d);
  });
}

// ---------- Ritrovi ----------
function renderRitrovi() {
  const f = $("#filtroProv").value;
  const lista = tuttiPoi().filter((p) => f === "TUTTI" || p.p === f || (f === "MIEI" && p.mio))
    .map((p) => ({ ...p, d: dist(cfg.casa, p) })).sort((a, b) => a.d - b.d);
  const box = $("#listaRitrovi"); box.innerHTML = "";
  lista.forEach((p) => {
    const d = document.createElement("div"); d.className = "rit";
    d.innerHTML = `<div><b>${esc(p.n)}</b><span class="badge">${p.p}</span><small>${esc(p.note || "")} · ${Math.round(p.d * FATT_STRADA)} km da casa</small></div>`;
    const v = document.createElement("button"); v.textContent = "🗺"; v.onclick = () => { map.setView([p.lat, p.lon], 12); window.scrollTo({ top: 0, behavior: "smooth" }); };
    const g = document.createElement("button"); g.textContent = corrente ? "+ Al giro" : "Giro"; g.onclick = () => usaPoi(p);
    d.append(v, g);
    if (p.mio) { const x = document.createElement("button"); x.textContent = "🗑"; x.onclick = () => { mieiRitrovi = mieiRitrovi.filter((m) => !(m.n === p.n && m.lat === p.lat)); LS.set("gm_poi", mieiRitrovi); disegnaPoi(); renderRitrovi(); }; d.append(x); }
    box.appendChild(d);
  });
}

// ---------- Casa ----------
function impostaCasa(ll) {
  cfg.casa = { lat: ll.lat, lon: ll.lon, n: "Casa" }; cfg.casaOk = true;
  LS.set("gm_cfg", cfg); casaMk.setLatLng([ll.lat, ll.lon]); renderCasa(); $("#stato").textContent = "partenza da casa"; renderRitrovi(); toast("Casa aggiornata");
}
function renderCasa() {
  $("#casaInfo").innerHTML = `<b>${esc(cfg.casa.n)}</b><br>${cfg.casa.lat.toFixed(5)}, ${cfg.casa.lon.toFixed(5)}`;
  $("#velMedia").value = cfg.vel;
}

// ---------- Navigazione ----------
function vai(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("attiva", v.id === id));
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("attiva", b.dataset.v === id || (id === "v-modifica" && b.dataset.v === "v-giro")));
}
document.querySelectorAll("nav button").forEach((b) => b.onclick = () => {
  if (b.dataset.v === "v-giro" && corrente && !$("#v-modifica").classList.contains("attiva")) { vai("v-modifica"); return; }
  vai(b.dataset.v);
});

// ---------- Avvio ----------
Object.entries(ZONE).forEach(([k, z]) => $("#zona").add(new Option(z.n, k)));
$("#filtroProv").add(new Option("Tutte le zone", "TUTTI"));
Object.entries(ZONE).filter(([k]) => ZONE[k].c).forEach(([k, z]) => $("#filtroProv").add(new Option(z.n, k)));
$("#filtroProv").add(new Option("I miei ritrovi", "MIEI"));
$("#filtroProv").onchange = renderRitrovi;
$("#km").oninput = () => ($("#kmVal").textContent = $("#km").value + " km");
$("#btnProponi").onclick = proponi;
$("#btnGpx").onclick = () => scaricaGpx(corrente);
$("#btnSalva").onclick = salva;
$("#btnIndietro").onclick = () => { corrente = null; disegnaPoi(); renderRitrovi(); vai("v-giro"); if (proposte.length) selezionaProposta(0); else { lyRoute.clearLayers(); lyTappe.clearLayers(); } };
$("#btnNuovoRitrovo").onclick = () => { modoTap = "ritrovo"; window.scrollTo({ top: 0, behavior: "smooth" }); toast("Tocca la mappa dove si trova il ritrovo"); };
$("#btnTapCasa").onclick = () => { modoTap = "casa"; window.scrollTo({ top: 0, behavior: "smooth" }); toast("Tocca la mappa sul punto di casa"); };
$("#btnGps").onclick = () => navigator.geolocation?.getCurrentPosition(
  (p) => { impostaCasa({ lat: p.coords.latitude, lon: p.coords.longitude }); map.setView([p.coords.latitude, p.coords.longitude], 14); },
  () => toast("Posizione non disponibile"), { enableHighAccuracy: true });
$("#velMedia").onchange = () => { cfg.vel = Math.max(25, Math.min(90, +$("#velMedia").value || 50)); LS.set("gm_cfg", cfg); };

disegnaPoi(); renderRitrovi(); renderSalvati(); renderCasa();
$("#stato").textContent = cfg.casaOk ? "partenza da casa" : "⚠️ imposta casa";
if (!cfg.casaOk) { vai("v-imp"); toast("Prima imposta la posizione di casa: resta salvata solo su questo telefono", 6000); }
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
