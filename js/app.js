/* =========================================================
   OPERACIÓN RECONEXIÓN — escape room de redes locales (1º SMR)
   ========================================================= */
(function () {
  "use strict";
  const C = CN.CONFIG;
  const STORE = "reconexion.v1";
  const app = document.getElementById("app");
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const catName = (c) => CN.CATS[[].concat(c)[0]];
  const N_ = "#101C3A", L_ = "#A9DB2E", LL = "#EAF8C9", R_ = "#D94444";

  let S = null, D = null, TK = null, CUR = null;

  /* =============== SONIDO =============== */
  const Snd = {
    ctx: null,
    tone(f, dur = 0.12, type = "sine", vol = 0.1, delay = 0) {
      if (!S || S.muted) return;
      try {
        this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
        const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
      } catch (e) {}
    },
    key() { this.tone(1300, 0.02, "square", 0.015); },
    ok() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.16, "triangle", 0.1, i * 0.08)); },
    bad() { this.tone(170, 0.25, "sawtooth", 0.1); this.tone(120, 0.3, "sawtooth", 0.08, 0.18); },
    blip() { this.tone(900, 0.05, "sine", 0.05); },
    fail() { this.tone(220, 0.15, "square", 0.05); },
    alarm() { [880, 660, 880, 660].forEach((f, i) => this.tone(f, 0.14, "square", 0.04, i * 0.16)); },
  };

  /* =============== UTILIDADES =============== */
  function toast(msg, type = "ok") {
    const el = document.createElement("div"); el.className = `toast-item ${type}`; el.textContent = msg;
    document.getElementById("toast").appendChild(el);
    setTimeout(() => el.classList.add("out"), 2800); setTimeout(() => el.remove(), 3300);
  }
  function modal({ title, body, ok = "Aceptar", cancel = null }) {
    return new Promise((resolve) => {
      const m = document.getElementById("modal");
      m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="mt"><h3 id="mt">${title}</h3><div class="modal-body">${body}</div><div class="modal-actions">${cancel ? `<button class="btn ghost" data-r="0">${cancel}</button>` : ""}<button class="btn" data-r="1">${ok}</button></div></div>`;
      m.hidden = false;
      $$("button", m).forEach((b) => (b.onclick = () => { m.hidden = true; resolve(b.dataset.r === "1"); }));
      $("button[data-r='1']", m).focus();
    });
  }
  function panel(title, html, { wide = false, icon = "📋" } = {}) {
    const ov = document.createElement("div");
    ov.className = "win-ov";
    ov.innerHTML = `<div class="win ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="win-bar"><span class="win-dots"><i></i><i></i><i></i></span><span class="win-title">${icon} ${title}</span><button class="win-x" type="button" aria-label="Cerrar">✕</button></div><div class="win-body">${html}</div></div>`;
    document.body.appendChild(ov);
    const close = () => { document.removeEventListener("keydown", onKey); ov.remove(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    $(".win-x", ov).onclick = close;
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    return { el: $(".win-body", ov), close };
  }
  function download(name, content, type = "text/plain;charset=utf-8") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".copy"); if (!b) return;
    const txt = b.closest(".cmd").querySelector("code").textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { b.textContent = "Copiado ✓"; setTimeout(() => (b.textContent = "Copiar"), 1500); }, () => toast("Selecciónalo a mano", "bad"));
  });
  const cmdBox = (code, label) => `<div class="cmd"><div class="cmd-head"><span>${label}</span><button class="copy" type="button">Copiar</button></div><pre><code>${esc(code)}</code></pre></div>`;

  /* =============== MAPA DE LA TOPOLOGÍA =============== */
  const POS = {
    R1: [200, 250], R2: [480, 250], R3: [760, 250],
    SW4: [200, 95], "AULA-1": [80, 95],
    SW1: [200, 385], "SEC-1": [110, 495], "SEC-2": [290, 495],
    SW2: [480, 385], "TAL-1": [420, 500], "AP-TALLER": [560, 445], PORTATIL: [575, 540],
    SW3: [760, 385], "DIR-1": [690, 500], SRV: [850, 495],
  };
  const SEGSW = { "LAN-R1": "SW1", "LAN-R2": "SW2", "LAN-R3": "SW3", "LAN-AULA": "SW4" };
  // [a, b, extremos del enlace en routers "R|iface", …]
  const LINKS = [
    ["AULA-1", "SW4"], ["SW4", "R1", "R1|GigabitEthernet0/2"],
    ["SEC-1", "SW1"], ["SEC-2", "SW1"], ["SW1", "R1", "R1|GigabitEthernet0/0"],
    ["R1", "R2", "R1|GigabitEthernet0/1", "R2|GigabitEthernet0/1"], ["R2", "R3", "R2|GigabitEthernet0/2", "R3|GigabitEthernet0/1"],
    ["SW2", "R2", "R2|GigabitEthernet0/0"], ["TAL-1", "SW2"], ["AP-TALLER", "SW2"],
    ["SW3", "R3", "R3|GigabitEthernet0/0"], ["DIR-1", "SW3"], ["SRV", "SW3"],
  ];
  const DEVTYPE = (id) => (/^R\d$/.test(id) ? "router" : /^SW/.test(id) ? "switch" : id === "SRV" ? "server" : id === "AP-TALLER" ? "ap" : "pc");
  function icon(id) {
    const [x, y] = POS[id], t = DEVTYPE(id);
    if (t === "router") return `<circle cx="${x}" cy="${y}" r="28" fill="${N_}" stroke="${N_}" stroke-width="4"/><path d="M${x - 14} ${y}h28M${x} ${y - 14}v28" stroke="${L_}" stroke-width="4" stroke-linecap="round"/><path d="M${x + 8} ${y - 6}l6 6-6 6M${x - 8} ${y - 6}l-6 6 6 6" stroke="${L_}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (t === "switch") return `<rect x="${x - 30}" y="${y - 14}" width="60" height="28" rx="7" fill="${LL}" stroke="${N_}" stroke-width="4"/><path d="M${x - 16} ${y - 4}h26l-5-4M${x + 16} ${y + 4}h-26l5 4" stroke="${N_}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (t === "server") return `<rect x="${x - 18}" y="${y - 30}" width="36" height="54" rx="6" fill="#fff" stroke="${N_}" stroke-width="4"/><path d="M${x - 10} ${y - 18}h20M${x - 10} ${y - 8}h20" stroke="${N_}" stroke-width="3"/><circle cx="${x}" cy="${y + 12}" r="4" fill="${L_}" stroke="${N_}" stroke-width="2"/>`;
    if (t === "ap") return `<rect x="${x - 24}" y="${y - 8}" width="48" height="20" rx="8" fill="#fff" stroke="${N_}" stroke-width="4"/><circle cx="${x}" cy="${y + 2}" r="3.5" fill="${L_}" stroke="${N_}" stroke-width="1.5"/><path d="M${x - 10} ${y - 16}a14 14 0 0 1 20 0M${x - 16} ${y - 22}a22 22 0 0 1 32 0" stroke="${N_}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (id === "PORTATIL") return `<rect x="${x - 22}" y="${y - 24}" width="44" height="30" rx="4" fill="#fff" stroke="${N_}" stroke-width="4"/><rect x="${x - 16}" y="${y - 18}" width="32" height="18" rx="2" fill="${LL}"/><path d="M${x - 30} ${y + 8}h60l-6 8h-48z" fill="${N_}" stroke="${N_}" stroke-width="2" stroke-linejoin="round"/>`;
    return `<rect x="${x - 26}" y="${y - 24}" width="52" height="36" rx="5" fill="#fff" stroke="${N_}" stroke-width="4"/><rect x="${x - 19}" y="${y - 17}" width="38" height="22" rx="2" fill="${LL}"/><path d="M${x - 8} ${y + 12}l-4 10h24l-4-10" fill="${N_}" stroke="${N_}" stroke-width="3" stroke-linejoin="round"/>`;
  }
  const NETS = () => D.net;
  function mapSVG() {
    const lan = (x, y, t1, t2) => `<g class="lan-label"><text x="${x}" y="${y}">${t1}</text><text x="${x}" y="${y + 16}" class="mono">${t2}</text></g>`;
    const ifl = (x, y, label) => `<text class="if-label" x="${x}" y="${y}">${label}</text>`;
    const n = NETS();
    return `<svg viewBox="0 0 960 600" class="topo" role="img" aria-label="Topología de la red">
      <rect x="20" y="20" width="350" height="140" rx="22" class="zone pending"/>${lan(250, 44, "Aula nueva", "pendiente")}
      <rect x="20" y="335" width="350" height="255" rx="22" class="zone"/>${lan(34, 360, "LAN Secretaría", n.R1 + ".0/24")}
      <rect x="385" y="335" width="250" height="255" rx="22" class="zone"/>${lan(399, 360, "LAN Taller", n.R2 + ".0/24")}
      <rect x="650" y="335" width="290" height="255" rx="22" class="zone"/>${lan(800, 360, "LAN Dirección", n.R3 + ".0/24")}
      ${lan(282, 215, "10.0.1.0/24", "")}${lan(565, 215, "10.0.2.0/24", "")}
      <g class="links">${LINKS.map(([a, b, ...ends]) => `<line data-link="${ends.join(",")}" x1="${POS[a][0]}" y1="${POS[a][1]}" x2="${POS[b][0]}" y2="${POS[b][1]}"/>`).join("")}
        <line class="wifi" x1="${POS["AP-TALLER"][0]}" y1="${POS["AP-TALLER"][1] + 12}" x2="${POS.PORTATIL[0]}" y2="${POS.PORTATIL[1] - 26}"/></g>
      <g class="ifs">${ifl(130, 238, "G0/1 .1")}${ifl(212, 300, "G0/0 .1")}${ifl(212, 175, "G0/2")}${ifl(392, 238, "G0/1 .2")}${ifl(512, 238, "G0/2 .1")}${ifl(492, 300, "G0/0 .1")}${ifl(672, 238, "G0/1 .2")}${ifl(772, 300, "G0/0 .1")}</g>
      <g class="leds"></g>
      ${Object.keys(POS).map((id) => `<g class="dev ${DEVTYPE(id)}" data-dev="${id}" ${DEVTYPE(id) === "switch" ? "" : `tabindex="0" role="button" aria-label="Abrir ${id}"`}>${icon(id)}<text class="dev-label" x="${POS[id][0] + (DEVTYPE(id) === "router" ? -48 : 0)}" y="${POS[id][1] + (DEVTYPE(id) === "router" ? -30 : DEVTYPE(id) === "switch" ? 32 : DEVTYPE(id) === "ap" ? 34 : 42)}">${id}</text></g>`).join("")}
      <g class="anim"></g>
    </svg>`;
  }
  function paintMap() {
    const svg = $(".topo", app); if (!svg) return;
    const N = CUR.net;
    let leds = "";
    $$("line[data-link]", svg).forEach((l) => {
      if (!l.dataset.link) return;
      const ends = l.dataset.link.split(",").map((x) => x.split("|"));
      const isDown = ([r, i]) => { const f = N.routers[r].ifaces[i]; return f.shut || !f.ip; };
      l.classList.toggle("down", ends.some(isDown));
      const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((a) => +l.getAttribute(a));
      for (const e of ends) {
        const [rx, ry] = POS[e[0]];
        const ox = rx === x1 && ry === y1 ? x2 : x1, oy = rx === x1 && ry === y1 ? y2 : y1;
        const d = Math.hypot(ox - rx, oy - ry), px = rx + ((ox - rx) / d) * 40, py = ry + ((oy - ry) / d) * 40;
        leds += isDown(e) ? `<path d="M${px - 7} ${py - 6}h14l-7 12z" fill="${R_}" stroke="${N_}" stroke-width="1.5"/>` : `<circle cx="${px}" cy="${py}" r="5" fill="${L_}" stroke="${N_}" stroke-width="1.5"/>`;
      }
    });
    const w = $("line.wifi", svg), st = CN.wlanStatus(N);
    if (w) w.classList.toggle("down", !(st.ok && st.net.own));
    $(".leds", svg).innerHTML = leds;
    $$(".dev", svg).forEach((g) => g.classList.toggle("open", CUR.tabs.includes(g.dataset.dev)));
  }
  // Recorrido de un paquete para animarlo en el mapa
  const access = (N, hn) => { const h = N.hosts[hn]; const sw = SEGSW[h.seg]; return hn === "PORTATIL" ? (h.seg === "LAN-R2" ? ["AP-TALLER", sw] : []) : [sw]; };
  function legNodes(N, start, res) {
    const seq = [start.name];
    if (start.type === "host") seq.push(...access(N, start.name));
    (res.hops || []).forEach((h) => seq.push(h.router));
    if (res.status === "ok" && res.dst && res.dst.type === "host" && res.dst.name !== start.name) {
      const path = access(N, res.dst.name).reverse();
      for (const p of path) if (seq[seq.length - 1] !== p) seq.push(p);
      seq.push(res.dst.name);
    }
    return seq.filter((x, i, a) => POS[x] && x !== a[i - 1]);
  }
  async function animate(seq, color, failAtEnd) {
    const g = $(".topo .anim", app); if (!g || seq.length < 1) return;
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", 9); dot.setAttribute("fill", color); dot.setAttribute("stroke", N_); dot.setAttribute("stroke-width", 3);
    g.appendChild(dot);
    for (let k = 0; k < seq.length - 1; k++) {
      const [x1, y1] = POS[seq[k]], [x2, y2] = POS[seq[k + 1]];
      const steps = 12;
      for (let s = 0; s <= steps; s++) { dot.setAttribute("cx", x1 + ((x2 - x1) * s) / steps); dot.setAttribute("cy", y1 + ((y2 - y1) * s) / steps); await sleep(14); }
    }
    if (seq.length === 1) { dot.setAttribute("cx", POS[seq[0]][0]); dot.setAttribute("cy", POS[seq[0]][1]); }
    if (failAtEnd) {
      const [x, y] = POS[seq[seq.length - 1]];
      const x_ = document.createElementNS("http://www.w3.org/2000/svg", "g");
      x_.innerHTML = `<circle cx="${x + 26}" cy="${y - 26}" r="15" fill="${R_}" stroke="${N_}" stroke-width="3"/><path d="M${x + 20} ${y - 32}l12 12M${x + 32} ${y - 32}l-12 12" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>`;
      x_.classList.add("fail-x"); g.appendChild(x_); Snd.fail();
      setTimeout(() => x_.remove(), 2200);
    }
    dot.remove();
  }
  async function animateProbe(src, p) {
    if (!p || !p.fwd) return;
    const N = CUR.net;
    const fwd = legNodes(N, src, p.fwd);
    const fwdOk = p.fwd.status === "ok";
    await animate(fwd, "#fff", !fwdOk);
    if (fwdOk && !p.fwd.self && p.back) {
      const back = legNodes(N, p.fwd.dst, p.back);
      await animate(back, L_, p.result !== "reply");
    }
  }

  /* =============== CONSOLAS =============== */
  function term(dev) {
    const P = CUR.parts;
    P.term = P.term || {};
    CUR.terms[dev] = CUR.terms[dev] || { hist: [], hi: 0, sess: { mode: "user" }, busy: false };
    if (P.term[dev] === undefined) P.term[dev] = DEVTYPE(dev) === "router" ? `\n${dev} con0 is now available\n\nPress RETURN to get started.\n\n` : `Cisco Packet Tracer PC Command Line 1.0\n`;
    return CUR.terms[dev];
  }
  const promptOf = (dev) => (DEVTYPE(dev) === "router" ? NET.prompt(dev, term(dev).sess) : "C:\\>");
  function appendOut(dev, text) {
    const P = CUR.parts;
    P.term[dev] = (P.term[dev] + text).slice(-12000);
    const pre = $(`.term[data-dev="${dev}"] .term-out`, app);
    if (pre) { pre.textContent = P.term[dev]; pre.parentElement.scrollTop = pre.parentElement.scrollHeight; }
  }
  function openDevice(dev) {
    if (DEVTYPE(dev) === "switch") return;
    if (!CUR.tabs.includes(dev)) CUR.tabs.push(dev);
    CUR.active = dev; Snd.blip();
    DOCK.min = false; saveDock();
    renderDock(); paintMap();
    setTimeout(() => $(".dock input.term-input")?.focus({ preventScroll: true }), 30);
  }
  /* Ventana flotante de consolas: posición, tamaño y estado guardados por navegador */
  const DOCK = (() => { try { return JSON.parse(localStorage.getItem("reconexion.dock")) || {}; } catch (e) { return {}; } })();
  function saveDock() { try { localStorage.setItem("reconexion.dock", JSON.stringify(DOCK)); } catch (e) {} }
  function placeDock(dock) {
    const small = window.innerWidth < 700;
    dock.classList.toggle("min", !!DOCK.min);
    if (small) { dock.style.cssText = ""; return; }
    const w = Math.min(DOCK.w || 780, window.innerWidth - 24), h = Math.min(DOCK.h || 470, window.innerHeight - 90);
    const left = DOCK.left == null ? window.innerWidth - w - 24 : Math.max(8, Math.min(DOCK.left, window.innerWidth - 120));
    const top = DOCK.top == null ? window.innerHeight - h - 20 : Math.max(8, Math.min(DOCK.top, window.innerHeight - 50));
    dock.style.left = left + "px"; dock.style.top = (DOCK.min ? Math.max(8, window.innerHeight - 60) : top) + "px";
    dock.style.width = w + "px"; dock.style.height = DOCK.min ? "" : h + "px";
  }
  function bindDockWindow(dock) {
    const bar = $(".dock-tabs", dock);
    bar.onpointerdown = (e) => {
      if (e.target.closest("button, i") || window.innerWidth < 700) return;
      e.preventDefault();
      const r = dock.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      dock.classList.add("dragging");
      const move = (ev) => { dock.style.left = Math.max(0, Math.min(ev.clientX - dx, window.innerWidth - 80)) + "px"; dock.style.top = Math.max(0, Math.min(ev.clientY - dy, window.innerHeight - 40)) + "px"; };
      const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); dock.classList.remove("dragging"); if (!DOCK.min) { DOCK.left = parseInt(dock.style.left); DOCK.top = parseInt(dock.style.top); saveDock(); } };
      document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
    };
    // guardar tamaño al redimensionar desde la esquina
    if (window.ResizeObserver && !dock._ro) {
      dock._ro = new ResizeObserver(() => { if (DOCK.min || window.innerWidth < 700 || dock.hidden) return; const w = dock.offsetWidth, h = dock.offsetHeight; if (w > 200 && h > 150) { DOCK.w = w; DOCK.h = h; saveDock(); } });
      dock._ro.observe(dock);
    }
    $("[data-dmin]", dock).onclick = () => { DOCK.min = !DOCK.min; saveDock(); renderDock(); };
    $("[data-dclose]", dock).onclick = () => { CUR.tabs = []; CUR.active = null; renderDock(); paintMap(); };
  }
  function renderDock() {
    const dock = $(".dock", app); if (!dock) return;
    if (!CUR.tabs.length) { dock.hidden = true; return; }
    dock.hidden = false;
    const dev = CUR.active;
    const type = DEVTYPE(dev);
    CUR.pcView = CUR.pcView || {};
    const view = type === "router" ? "cli" : type === "ap" ? "ap" : CUR.pcView[dev] || "cmd";
    const views = type === "ap" ? `<div class="pc-views"><button type="button" class="on">Config · Wireless</button><span class="cli-tip">Interfaz web del punto de acceso del Taller</span></div>`
      : type !== "router" ? `<div class="pc-views"><button type="button" class="${view === "cmd" ? "on" : ""}" data-view="cmd">Command Prompt</button><button type="button" class="${view === "ipcfg" ? "on" : ""}" data-view="ipcfg">IP Configuration</button>${dev === "PORTATIL" ? `<button type="button" class="${view === "wifi" ? "on" : ""}" data-view="wifi">PC Wireless</button>` : ""}</div>` : null;
    dock.innerHTML = `<div class="dock-tabs">${CUR.tabs.map((t) => `<button type="button" class="dock-tab ${t === dev ? "on" : ""}" data-tab="${t}"><span>${DEVTYPE(t) === "router" ? "⌁" : DEVTYPE(t) === "server" ? "🗄" : DEVTYPE(t) === "ap" ? "📶" : t === "PORTATIL" ? "💻" : "🖥"}</span>${t}<i data-close="${t}" title="Cerrar">✕</i></button>`).join("")}<span class="sim-tag">SIMULACIÓN</span><span class="dock-ctl"><button type="button" data-dmin title="${DOCK.min ? "Restaurar" : "Minimizar"}" aria-label="${DOCK.min ? "Restaurar" : "Minimizar"} consola">${DOCK.min ? "▢" : "–"}</button><button type="button" data-dclose title="Cerrar consolas" aria-label="Cerrar todas las consolas">✕</button></span></div>
      ${views ? views : `<div class="pc-views"><button type="button" class="on">CLI · ${dev}</button><span class="cli-tip">Abreviaturas como en Packet Tracer: <code>en</code> · <code>conf t</code> · <code>int g0/0</code> · <code>no shut</code> · <code>sh ip int br</code> · <kbd>Tab</kbd> completa · <kbd>↑</kbd> repite · <code>?</code> ayuda</span></div>`}
      <div class="dock-body"></div>`;
    placeDock(dock); bindDockWindow(dock);
    $$(".dock-tab", dock).forEach((b) => (b.onclick = (e) => {
      const c = e.target.closest("[data-close]");
      if (c) { CUR.tabs = CUR.tabs.filter((x) => x !== c.dataset.close); if (CUR.active === c.dataset.close) CUR.active = CUR.tabs[CUR.tabs.length - 1]; }
      else { CUR.active = b.dataset.tab; if (DOCK.min) { DOCK.min = false; saveDock(); } }
      renderDock(); paintMap();
    }));
    $$("[data-view]", dock).forEach((b) => (b.onclick = () => { CUR.pcView[dev] = b.dataset.view; renderDock(); }));
    const body = $(".dock-body", dock);
    if (view === "ipcfg") return renderIpCfg(body, dev);
    if (view === "ap") return renderAP(body);
    if (view === "wifi") return renderWifi(body);
    const T = term(dev);
    body.innerHTML = `<div class="term" data-dev="${dev}"><pre class="term-out"></pre><label class="term-line"><span class="term-prompt">${esc(promptOf(dev))}</span><input class="term-input" autocomplete="off" spellcheck="false" aria-label="Comando en ${dev}"></label></div>`;
    const pre = $(".term-out", body), inp = $(".term-input", body), box = $(".term", body);
    pre.textContent = CUR.parts.term[dev];
    box.scrollTop = box.scrollHeight;
    box.onclick = () => inp.focus();
    inp.onkeydown = async (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        if (type !== "router") return;
        // Autocompletar la última palabra, como en IOS
        const m = inp.value.match(/^(.*?)(\S+)$/);
        if (!m) return;
        const opts = tabOptions(T.sess.mode, inp.value.trim().split(/\s+/));
        if (opts.length === 1) inp.value = m[1] + opts[0] + " ";
        else if (opts.length > 1) { appendOut(dev, `\n${promptOf(dev)}${inp.value}\n${opts.join("  ")}\n`); }
        return;
      }
      if (e.key === "Enter") {
        if (T.busy) return;
        const line = inp.value; inp.value = "";
        if (line.trim()) { T.hist.push(line); T.hi = T.hist.length; }
        await runLine(dev, line);
        $(".term-prompt", body).textContent = promptOf(dev);
        inp.focus();
      } else if (e.key === "ArrowUp") { if (T.hi > 0) { T.hi--; inp.value = T.hist[T.hi]; } e.preventDefault(); }
      else if (e.key === "ArrowDown") { if (T.hi < T.hist.length - 1) { T.hi++; inp.value = T.hist[T.hi]; } else { T.hi = T.hist.length; inp.value = ""; } e.preventDefault(); }
      else if (e.key.length === 1) Snd.key();
    };
  }
  /* Punto de acceso: interfaz web (Config → Wireless), al estilo del WRT300N de Packet Tracer */
  function renderAP(body) {
    const N = CUR.net, ap = N.wlan.ap, st = CN.wlanStatus(N);
    const opt = (list, v) => list.map((x) => `<option ${String(x) === String(v) ? "selected" : ""}>${x}</option>`).join("");
    body.innerHTML = `<div class="ipcfg apcfg">
      <p class="small muted">AP-TALLER está conectado al switch del Taller (LAN ${D.net.R2}.0/24): los clientes WiFi reciben IP del DHCP de R2.</p>
      <div class="ipcfg-grid">
        <label>SSID (nombre de la red)<input data-f="ssid" class="mono" value="${esc(ap.ssid)}" maxlength="32"></label>
        <label>Banda<select data-f="band">${opt(["2,4 GHz", "5 GHz"], ap.band)}</select></label>
        <label>Canal<select data-f="channel">${opt(ap.band === "5 GHz" ? [36, 40, 44, 48] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], ap.channel)}</select></label>
        <label>Seguridad<select data-f="sec">${opt(["Abierta", "WEP", "WPA2-Personal", "WPA3-Personal"], ap.sec)}</select></label>
        <label class="span2">Clave${ap.sec === "WEP" ? " (WEP: 10 caracteres hexadecimales)" : " (WPA: de 8 a 63 caracteres)"}<input data-f="key" class="mono" value="${esc(ap.key)}" ${ap.sec === "Abierta" ? "disabled" : ""}></label>
      </div>
      <p class="ap-clients"><b>Clientes asociados:</b> ${st.ok && st.net.own ? `PORTATIL · ${CUR.net.hosts.PORTATIL.mac}` : "ninguno"}</p>
      <div class="ipcfg-msg"></div><button class="btn" type="button">Guardar cambios</button></div>`;
    const f = (k) => $(`[data-f="${k}"]`, body);
    f("band").onchange = () => { f("channel").innerHTML = opt(f("band").value === "5 GHz" ? [36, 40, 44, 48] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], ""); };
    f("sec").onchange = () => { f("key").disabled = f("sec").value === "Abierta"; };
    $(".btn", body).onclick = () => {
      const msg = $(".ipcfg-msg", body);
      const v = { ssid: f("ssid").value.trim(), band: f("band").value, channel: +f("channel").value, sec: f("sec").value, key: f("sec").value === "Abierta" ? "" : f("key").value.trim() };
      const ko = (t) => { msg.textContent = t; msg.className = "ipcfg-msg ko"; };
      if (!v.ssid) return ko("El SSID no puede estar vacío.");
      if (v.sec === "WEP" && !/^[0-9A-Fa-f]{10}$|^[0-9A-Fa-f]{26}$/.test(v.key)) return ko("Una clave WEP debe tener 10 o 26 caracteres hexadecimales.");
      if (/WPA/.test(v.sec) && (v.key.length < 8 || v.key.length > 63)) return ko("Una clave WPA debe tener entre 8 y 63 caracteres.");
      Object.assign(N.wlan.ap, v);
      const s2 = CN.wlanSync(N);
      msg.textContent = "Configuración guardada." + (s2.ok && s2.net.own ? " PORTATIL se ha reconectado." : ""); msg.className = "ipcfg-msg ok";
      record("AP-TALLER", `Config · Wireless: SSID ${v.ssid} · ${v.sec} · canal ${v.channel}`, { kind: "wifi", cmd: "Panel del punto de acceso" });
      afterChange(`AP-TALLER: SSID ${v.ssid} · ${v.sec}${v.sec === "Abierta" ? "" : " con clave"} · ${v.band} canal ${v.channel}`);
      Snd.blip();
      setTimeout(() => CUR.active === "AP-TALLER" && renderAP(body), 1200);
    };
  }
  /* Portátil: Desktop → PC Wireless (redes detectadas y conexión) */
  function renderWifi(body) {
    const N = CUR.net, st = CN.wlanStatus(N), h = N.hosts.PORTATIL;
    const bars = (n) => `<span class="bars">${[1, 2, 3, 4].map((k) => `<i class="${k <= n ? "on" : ""}" style="height:${k * 4 + 2}px"></i>`).join("")}</span>`;
    const nets = CN.wlanNets(N);
    body.innerHTML = `<div class="ipcfg wifi">
      <div class="wifi-status ${st.ok && st.net.own ? "ok" : "ko"}"><b>${st.state === "connected" ? "Conectado" : st.state === "auth" ? "Autenticación fallida" : "Sin conexión"}</b><span>${esc(st.msg)}</span><span class="mono small">Wireless0 · IP ${esc(h.ip || "0.0.0.0")}</span></div>
      <table class="doc-table wifi-table"><tr><th>Red (SSID)</th><th>Seguridad</th><th>Canal</th><th>Señal</th><th></th></tr>
      ${nets.map((n, i) => `<tr><td class="mono">${esc(n.ssid)}${N.wlan.client.ssid === n.ssid ? " <small>(perfil guardado)</small>" : ""}</td><td>${n.sec}</td><td>${n.channel}</td><td>${bars(n.signal)}</td><td><button class="btn ghost" type="button" data-net="${i}">Conectar</button></td></tr>`).join("")}</table>
      <form class="wifi-key" hidden><label>Clave de <b class="mono"></b><input type="password" class="mono" autocomplete="off"></label><button class="btn" type="submit">Conectar</button></form>
      <div class="ipcfg-msg"></div>
      <p class="small muted">Detectar una red no es poder usarla: hay que asociarse, autenticarse con la clave y obtener una IP.</p></div>`;
    const form = $(".wifi-key", body);
    const connect = (n, key) => {
      N.wlan.client = { ssid: n.ssid, key };
      const s2 = CN.wlanSync(N, true);
      const msg = $(".ipcfg-msg", body);
      msg.textContent = s2.msg + (s2.ok ? ` IP obtenida: ${h.ip}` : ""); msg.className = "ipcfg-msg " + (s2.ok && s2.net.own ? "ok" : "ko");
      record("PORTATIL", `PC Wireless: conectar a ${n.ssid}`, { kind: "wifi", cmd: "PC Wireless (redes WiFi)", ok: s2.ok });
      afterChange(`PORTATIL: conectar a ${n.ssid}${key ? " con clave" : ""} → ${s2.ok ? "conectado, IP " + h.ip : s2.state === "auth" ? "autenticación fallida" : "sin conexión"}`);
      setTimeout(() => CUR.active === "PORTATIL" && CUR.pcView.PORTATIL === "wifi" && renderWifi(body), 1600);
    };
    $$("[data-net]", body).forEach((b) => (b.onclick = () => {
      const n = nets[+b.dataset.net];
      if (n.sec === "Abierta") return connect(n, "");
      form.hidden = false; $("b", form).textContent = n.ssid; const inp = $("input", form); inp.value = ""; inp.focus();
      form.onsubmit = (e) => { e.preventDefault(); connect(n, inp.value); };
    }));
  }
  function renderIpCfg(body, dev) {
    const h = CUR.net.hosts[dev];
    if (dev === "SRV") { body.innerHTML = `<div class="ipcfg"><p>El servidor (DNS e intranet) tiene configuración estática y <b>no forma parte de las incidencias</b>. Puedes consultarla con <code>ipconfig /all</code>.</p></div>`; return; }
    body.innerHTML = `<div class="ipcfg"><div class="ipcfg-mode"><label><input type="radio" name="m" value="dhcp" ${h.dhcp ? "checked" : ""}> DHCP</label><label><input type="radio" name="m" value="static" ${h.dhcp ? "" : "checked"}> Static</label></div>
      <div class="ipcfg-grid">
        <label>IPv4 Address<input data-f="ip" class="mono" value="${esc(h.ip || "")}"></label>
        <label>Subnet Mask<input data-f="mask" class="mono" value="${esc(h.mask || "")}"></label>
        <label>Default Gateway<input data-f="gw" class="mono" value="${esc(h.gw || "")}"></label>
        <label>DNS Server<input data-f="dns" class="mono" value="${esc(h.dns || "")}"></label>
      </div><div class="ipcfg-msg"></div><button class="btn" type="button">Aplicar</button></div>`;
    const setDis = () => { const dh = $("input[value=dhcp]", body).checked; $$("[data-f]", body).forEach((i) => (i.disabled = dh)); };
    $$("input[name=m]", body).forEach((r) => (r.onchange = setDis));
    setDis();
    $(".btn", body).onclick = () => {
      const msg = $(".ipcfg-msg", body);
      if ($("input[value=dhcp]", body).checked) {
        h.dhcp = true;
        const ok = NET.dhcpRequest(CUR.net, dev);
        msg.textContent = ok ? "DHCP request successful." : "DHCP failed. APIPA is being used.";
        msg.className = "ipcfg-msg " + (ok ? "ok" : "ko");
        afterChange(`${dev}: configuración por DHCP → ${h.ip} / ${h.mask} gw ${h.gw || "-"} dns ${h.dns || "-"}`);
      } else {
        const v = Object.fromEntries($$("[data-f]", body).map((i) => [i.dataset.f, i.value.trim()]));
        if (!NET.isIP(v.ip)) return (msg.textContent = "Dirección IPv4 no válida.", msg.className = "ipcfg-msg ko");
        if (!NET.validMask(v.mask)) return (msg.textContent = "Máscara no válida.", msg.className = "ipcfg-msg ko");
        if (v.gw && !NET.isIP(v.gw)) return (msg.textContent = "Puerta de enlace no válida.", msg.className = "ipcfg-msg ko");
        if (v.dns && !NET.isIP(v.dns)) return (msg.textContent = "Servidor DNS no válido.", msg.className = "ipcfg-msg ko");
        Object.assign(h, { dhcp: false, ip: v.ip, mask: v.mask, gw: v.gw, dns: v.dns, dhcpServer: "" });
        msg.textContent = "Configuración aplicada."; msg.className = "ipcfg-msg ok";
        afterChange(`${dev}: IP estática ${v.ip} ${v.mask} gw ${v.gw || "-"} dns ${v.dns || "-"}`);
      }
      Snd.blip();
      setTimeout(() => renderIpCfg(body, dev), 900);
    };
  }

  // Autocompletado con Tab según el modo y la palabra anterior (como IOS)
  const FIRST = {
    user: ["enable", "exit", "ping", "show"],
    priv: ["configure", "copy", "disable", "enable", "exit", "ping", "show", "write"],
    config: ["do", "end", "exit", "interface", "ip", "no"],
    if: ["do", "end", "exit", "interface", "ip", "no", "shutdown"],
    router: ["auto-summary", "do", "end", "exit", "network", "no", "version"],
    dhcp: ["default-router", "dns-server", "do", "end", "exit", "network", "no"],
  };
  const NEXT = {
    show: ["ip", "running-config"], ip: ["address", "dhcp", "interface", "protocols", "route"], interface: ["brief", "GigabitEthernet0/0", "GigabitEthernet0/1", "GigabitEthernet0/2"],
    dhcp: ["binding", "excluded-address", "pool"], configure: ["terminal"], copy: ["running-config"], "running-config": ["startup-config"],
    no: ["default-router", "dns-server", "ip", "network", "shutdown"], do: ["show", "ping", "write"],
  };
  function tabOptions(mode, toks) {
    let prev = null;
    for (let k = 0; k < toks.length; k++) {
      let list = k === 0 ? FIRST[mode] : NEXT[prev] || [];
      if (k > 0 && prev === "ip" && mode === "if") list = ["address"];
      if (k > 0 && prev === "ip" && toks[0].toLowerCase().startsWith("sh")) list = ["dhcp", "interface", "protocols", "route"];
      if (k > 0 && prev === "ip" && ["config", "router", "dhcp"].includes(mode)) list = ["dhcp", "route"];
      const c = list.filter((w) => w.toLowerCase().startsWith(toks[k].toLowerCase()));
      if (k === toks.length - 1) return c;
      prev = c.length === 1 ? c[0] : list.find((w) => w.toLowerCase() === toks[k].toLowerCase()) || null;
      if (!prev) return [];
    }
    return [];
  }
  const PC_HELP = `Comandos disponibles en esta simulación:
  ipconfig            Configuración IP básica
  ipconfig /all       Configuración completa (MAC, DHCP, DNS)
  ipconfig /renew     Pedir de nuevo la configuración al DHCP
  ipconfig /release   Liberar la configuración DHCP
  ping <ip|nombre>    Comprobar conectividad
  tracert <ip|nombre> Ver los saltos hasta el destino
  nslookup <nombre>   Comprobar la resolución DNS
  cls                 Limpiar la pantalla
`;
  async function runLine(dev, line) {
    const T = term(dev);
    const prev = CUR.parts.term[dev] || "";
    appendOut(dev, `${DEVTYPE(dev) === "router" && prev.endsWith("\n") ? "" : "\n"}${promptOf(dev)}${line}\n`);
    if (DEVTYPE(dev) === "router") {
      const r = NET.ios(CUR.net, dev, T.sess, line);
      if (r.out) appendOut(dev, r.out);
      if (r.event) record(dev, line, r.event);
      if (r.changed) afterChange(`${dev}: ${r.change}`, true);
      return;
    }
    // PC / servidor
    const t = line.trim(); if (!t) return;
    const [c0, ...args] = t.split(/\s+/);
    const c = c0.toLowerCase(), a = (args[0] || "").toLowerCase();
    const N = CUR.net, h = N.hosts[dev];
    if (c === "cls") { CUR.parts.term[dev] = ""; appendOut(dev, ""); return; }
    if (c === "help" || c === "?") return appendOut(dev, PC_HELP);
    if (c === "ipconfig") {
      if (!a) { appendOut(dev, NET.pcIpconfig(N, dev, false)); return record(dev, t, { kind: "show", cmd: "ipconfig /all", from: dev }); }
      if (a === "/all") { appendOut(dev, NET.pcIpconfig(N, dev, true)); return record(dev, t, { kind: "show", cmd: "ipconfig /all", from: dev }); }
      if (a === "/renew") {
        if (!h.dhcp) return appendOut(dev, "\nEste equipo tiene configuración estática (IP Configuration → Static).\n");
        const ok = NET.dhcpRequest(N, dev);
        appendOut(dev, ok ? NET.pcRenewOut(N, dev) : "\nDHCP request failed.\n" + NET.pcRenewOut(N, dev));
        return afterChange(`${dev}: ipconfig /renew → ${h.ip} gw ${h.gw || "-"} dns ${h.dns || "-"}`);
      }
      if (a === "/release") {
        if (!h.dhcp) return appendOut(dev, "\nEste equipo tiene configuración estática.\n");
        Object.assign(h, { ip: "0.0.0.0", mask: "0.0.0.0", gw: "", dns: "" });
        appendOut(dev, NET.pcRenewOut(N, dev));
        return afterChange(`${dev}: ipconfig /release`);
      }
      return appendOut(dev, "\nError: opción no reconocida. Usa ipconfig, ipconfig /all, /renew o /release.\n");
    }
    if (c === "ping" || c === "tracert") {
      if (!args[0]) return appendOut(dev, `\nUso: ${c} <dirección IP o nombre>\n`);
      T.busy = true;
      const r = c === "ping" ? NET.pcPing(N, dev, args[0]) : NET.pcTracert(N, dev, args[0]);
      const anim = r.probe ? animateProbe({ type: "host", name: dev }, r.probe) : r.fwd ? animate(legNodes(N, { type: "host", name: dev }, r.fwd), "#fff", r.fwd.status !== "ok") : null;
      const lines = r.text.split("\n");
      for (const ln of lines) { appendOut(dev, ln + "\n"); if (/Reply|Request timed|^\s+\d+\s/.test(ln)) await sleep(c === "ping" ? 260 : 110); }
      if (anim) await anim;
      T.busy = false;
      return record(dev, t, { kind: c, from: dev, dst: r.ip || args[0], ok: r.ok, byName: !NET.isIP(args[0]) });
    }
    if (c === "nslookup") {
      const r = NET.pcNslookup(N, dev, args[0]);
      appendOut(dev, "\n" + r.text);
      return record(dev, t, { kind: "nslookup", from: dev, ok: r.ok, dst: args[0] || "" });
    }
    appendOut(dev, "Invalid Command.\n");
  }

  /* =============== LÓGICA DEL TICKET =============== */
  const CMD_OF = (ev, line) => ev.cmd || (ev.kind === "ping" ? "ping" : ev.kind === "tracert" ? "tracert" : ev.kind === "nslookup" ? "nslookup" : line);
  function record(dev, line, ev) {
    const P = CUR.parts;
    P.log = P.log || [];
    P.log.push({ dev, cmd: line.trim(), ok: ev.ok, t: Date.now() });
    if (P.log.length > 120) P.log.shift();
    P.diag = (P.diag || 0) + 1;
    P.touched = Array.from(new Set([...(P.touched || []), dev]));
    P.cmdsUsed = Array.from(new Set([...(P.cmdsUsed || []), CMD_OF(ev, line)]));
    // ¿verificación tras la corrección?
    if (ev.ok && !P.verified && CUR.t.verify(ev, CUR.net) && CUR.t.fixed(CUR.net)) {
      P.verified = true; P.fixed = true;
      P.verifyText = `[${dev}] ${line.trim()} → correcto`;
      Snd.ok(); toast("✅ Verificación correcta: la incidencia está resuelta", "ok");
      setTimeout(() => toast("Ahora documenta la incidencia: «Cerrar incidencia»", "info"), 1200);
    }
    save(); renderPhases();
  }
  function afterChange(desc, cli) {
    const P = CUR.parts;
    P.changes = P.changes || [];
    P.changes.push(desc);
    // si se rompe de nuevo, hay que volver a verificar
    if (P.verified && !CUR.t.fixed(CUR.net)) { P.verified = false; P.fixed = false; toast("⚠️ Ese cambio ha vuelto a romper algo: verifica de nuevo", "bad"); }
    if (!P.verified && CUR.t.howVerify && CUR.t.fixed(CUR.net)) setTimeout(() => toast(`👍 Parece arreglado. Ahora verifícalo: ${CUR.t.howVerify}`, "ok"), 400);
    else if (!cli) toast("Cambio aplicado", "info");
    save(); paintMap(); renderPhases();
  }
  function phases() {
    const P = CUR.parts || {}, a = CUR.t.answer;
    return [
      { k: "Observar", done: true },
      { k: "Comprobar", done: (P.diag || 0) >= 2 || !!P.verified },
      { k: "Localizar", done: (P.touched || []).includes(a.device) || !!P.verified },
      { k: "Corregir", done: !!P.verified },
      { k: "Verificar", done: !!P.verified },
      { k: "Documentar", done: !!P.report },
    ];
  }
  function renderPhases() {
    const el = $(".phasebar", app); if (!el) return;
    el.innerHTML = phases().map((p, i) => `<li class="${p.done ? "done" : ""}"><span>${p.done ? "✓" : i + 1}</span>${p.k}</li>`).join("");
    // Siguiente paso: siempre dice al alumno qué le falta, aunque haya corregido antes de diagnosticar
    const ns = $("#nextStep", app);
    if (ns && CUR.t.howVerify) {
      const P = CUR.parts;
      let fixedNow = false; try { fixedNow = CUR.t.fixed(CUR.net); } catch (e) {}
      const [cls, txt] = P.report ? ["done", "✓ Incidencia cerrada. Pasa al siguiente ticket."]
        : P.verified ? ["go", "✓ Verificado. <b>Último paso:</b> pulsa «Cerrar incidencia» y rellena el parte."]
        : fixedNow ? ["go", `La configuración ya parece correcta. <b>Siguiente paso:</b> verifícalo; ${CUR.t.howVerify}.`]
        : (P.changes || []).length ? ["wait", `Todavía no funciona. Sigue comprobando y, cuando lo corrijas, ${CUR.t.howVerify} para verificarlo.`]
        : ["wait", `Comprueba el síntoma con comandos en los equipos afectados, localiza el fallo y corrígelo. Para verificar: ${CUR.t.howVerify}.`];
      ns.className = "next-step " + cls; ns.innerHTML = txt;
    }
    const btn = $("#closeBtn", app);
    if (btn) { btn.disabled = !CUR.parts.verified || !!CUR.parts.report; btn.textContent = CUR.parts.report ? "✓ Incidencia cerrada" : CUR.parts.verified ? "📝 Cerrar incidencia" : "📝 Cerrar incidencia (primero corrige y verifica)"; }
  }

  function openReport() {
    const t = CUR.t, P = CUR.parts;
    const devs = CN.DEVICES;
    const causes = CN.rng(S.groupCode + t.id).shuffle(t.causes);
    const pn = panel(`Parte de incidencia · ${t.title}`, `
      <form class="report-form" novalidate>
        <fieldset><legend>1 · Tipo de fallo</legend><div class="chips">${Object.entries(CN.CATS).map(([k, v]) => `<label class="chip"><input type="radio" name="cat" value="${k}"><span>${v}</span></label>`).join("")}</div></fieldset>
        <fieldset><legend>2 · ¿En qué dispositivo estaba el fallo?</legend><select name="device"><option value="">— Elige —</option>${devs.map((d) => `<option>${d}</option>`).join("")}</select></fieldset>
        <fieldset><legend>3 · ${t.causeLabel || "Causa"}</legend><div class="causes">${causes.map((c) => `<label class="cause"><input type="radio" name="cause" value="${c.id}"><span>${c.t}</span></label>`).join("")}</div></fieldset>
        <fieldset><legend>4 · ¿Qué comando te dio la evidencia clave?</legend><select name="cmd"><option value="">— Elige —</option>${CN.CMDS.map((c) => `<option>${c}</option>`).join("")}</select></fieldset>
        <fieldset><legend>5 · Justificación (para el profesor)</legend><textarea name="why" rows="3" placeholder="Qué observaste en la salida del comando y por qué te llevó a esa causa…"></textarea></fieldset>
        <div class="auto"><b>Corrección aplicada</b><ul>${(P.changes || []).slice(-8).map((c) => `<li><code>${esc(c)}</code></li>`).join("") || "<li>—</li>"}</ul><b>Verificación</b><p><code>${esc(P.verifyText || "")}</code></p></div>
        <button class="btn big" type="submit">Enviar parte</button>
      </form>`, { wide: true, icon: "📝" });
    const f = $("form", pn.el);
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = { cat: f.cat.value, device: f.device.value, cause: f.cause.value, cmd: f.cmd.value, why: f.why.value.trim() };
      if (!v.cat || !v.device || !v.cause || !v.cmd) return toast("Completa los cuatro primeros apartados", "info");
      if (v.why.length < 15) return toast("Escribe una justificación breve (al menos una frase)", "info");
      const wrong = [![].concat(t.answer.cat).includes(v.cat) && "tipo", v.device !== t.answer.device && "dispositivo", v.cause !== t.answer.cause && "causa", !t.answer.cmds.includes(v.cmd) && "comando de evidencia"].filter(Boolean);
      if (wrong.length) { fail(`Revisa en el parte: ${wrong.join(", ")}`); return; }
      P.report = { ...v, causeText: t.causes.find((c) => c.id === v.cause).t };
      save(); pn.close(); completeTicket();
    };
  }
  function fail(msg) {
    const id = CUR.t.id;
    S.errorsByRoom[id] = (S.errorsByRoom[id] || 0) + 1; S.totalErrors++;
    addScore(-1); save(); Snd.bad(); toast(`${msg} · −${C.POINTS.WRONG} puntos`, "bad");
    document.body.classList.remove("alarm"); void document.body.offsetWidth; document.body.classList.add("alarm");
  }
  function completeTicket() {
    const idx = CUR.idx, t = CUR.t;
    if (!S.completed.includes(idx)) {
      S.completed.push(idx); S.keywords.push(t.keyword);
      addScore(1);
      save(); updateHUD(); scheduleRank(true);
    }
    renderPhases(); Snd.ok(); confetti(40);
    showDone(idx, !S.errorsByRoom[t.id]);
  }
  function showDone(idx, bonus) {
    const t = TK[idx], last = idx === TK.length - 1;
    const ov = document.createElement("div"); ov.className = "done-ov";
    ov.innerHTML = `<div class="done-card card pop"><div class="done-badge">✓ TICKET ${idx + 1} CERRADO</div><h2>${t.title}</h2><p>${t.lesson}</p><p class="bonus">+${C.POINTS.TICKET} puntos por cerrar el ticket${bonus ? ` · +${C.POINTS.CLEAN} por hacerlo sin errores` : ""}</p><div class="keyword"><span>CATEGORÍA</span><strong>${catName(t.answer.cat).toUpperCase()}</strong></div><button class="btn big" type="button">${last ? "VER INFORME FINAL →" : "SIGUIENTE TICKET →"}</button></div>`;
    document.body.appendChild(ov);
    $("button", ov).focus();
    $("button", ov).onclick = () => { ov.remove(); last ? finish() : renderTicket(idx + 1); };
  }

  /* =============== PANTALLAS =============== */
  function renderTicket(idx) {
    const t = TK[idx];
    S.current = idx;
    S.parts[t.id] = S.parts[t.id] || {};
    const P = S.parts[t.id];
    if (!P.net) P.net = t.build();
    CUR = { idx, t, parts: P, net: P.net, tabs: [], active: null, terms: {} };
    save(); updateHUD();
    app.innerHTML = `<section class="room enter ticket">
      <div class="room-head"><span class="eyebrow">TICKET ${idx + 1} DE ${TK.length} · ${esc(t.place)}</span><h2>${t.title}</h2></div>
      <ol class="phasebar"></ol><p class="next-step" id="nextStep" role="status"></p>
      <div class="ticket-grid">
        <aside class="side">
          <div class="card ticket-card"><div class="tk-head"><span class="tk-prio">PRIORIDAD ALTA</span><span class="mono">#${S.groupCode}-${idx + 1}</span></div>
            <blockquote>“${esc(t.quote)}”</blockquote><p class="tk-from">— ${esc(t.reporter)}</p>
            <p class="tk-aff"><b>Equipos afectados:</b> ${t.affected.map((a) => `<button type="button" class="dev-chip" data-open="${a}">${a}</button>`).join(" ")}</p></div>
          <div class="card radio"><div class="radio-head"><span class="radio-led"></span>MÉTODO</div><p class="method">1 <b>Observa</b> el síntoma · 2 <b>Comprueba</b> con comandos · 3 <b>Localiza</b> el dispositivo · 4 <b>Corrige</b> lo mínimo · 5 <b>Verifica</b> repitiendo la prueba · 6 <b>Documenta</b>.</p></div>
          <button class="btn big" id="closeBtn" type="button" disabled>📝 Cerrar incidencia</button>
          <div class="hint-zone"><button class="btn ghost hint-btn" type="button">💡 Pista <small>−${C.POINTS.HINT}</small></button><div class="hints"></div></div>
        </aside>
        <div class="workbench">
          <div class="card map-card">${mapSVG()}<p class="scene-tip">Haz clic en un equipo para abrir su consola. Las salidas de los comandos son <b>simuladas</b> a partir del estado de la red.</p></div>

        </div>
      </div></section><div class="card dock float" hidden role="dialog" aria-label="Consolas de los equipos"></div>`;
    $$(".topo .dev", app).forEach((g) => { g.onclick = () => openDevice(g.dataset.dev); g.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDevice(g.dataset.dev); } }; });
    $$("[data-open]", app).forEach((b) => (b.onclick = () => openDevice(b.dataset.open)));
    $("#closeBtn", app).onclick = openReport;
    $(".hint-btn", app).onclick = askHint;
    renderHints(); renderPhases(); paintMap(); renderDock();
    window.scrollTo({ top: 0 });
    if (P.report) setTimeout(() => showDone(idx, !S.errorsByRoom[t.id]), 300);
  }
  function renderHints() {
    const t = CUR.t, n = S.hintsByRoom[t.id] || 0;
    $(".hints", app).innerHTML = t.hints.slice(0, n).map((h, i) => `<div class="hint"><b>Pista ${i + 1}</b> ${esc(h)}</div>`).join("");
    const b = $(".hint-btn", app);
    if (n >= t.hints.length) { b.disabled = true; b.textContent = "Sin más pistas"; }
  }
  async function askHint() {
    const t = CUR.t, n = S.hintsByRoom[t.id] || 0;
    if (n >= t.hints.length) return;
    if (!(await modal({ title: "¿Pedir una pista?", body: `<p>Cuesta <b>${C.POINTS.HINT} puntos</b>. Orienta, no da la solución.</p>`, ok: "Pedir pista", cancel: "Mejor no" }))) return;
    S.hintsByRoom[t.id] = n + 1; S.hintsUsed++; addScore(-1); save(); renderHints();
  }

  function showDocs() {
    const n = D.net;
    panel("Documentación de la red de CITED", `
      <p>Es la red de las prácticas de clase: <b>tres routers en cadena</b> (R1 – R2 – R3) unidos con cable cruzado, una LAN por router y <b>rutas estáticas</b>. <b>Los PC obtienen su configuración por DHCP</b> desde el router de su oficina, salvo que alguien la haya cambiado a mano.</p>
      <div class="tbl-wrap"><table class="doc-table"><tr><th>Router</th><th>G0/0 (LAN)</th><th>G0/1</th><th>G0/2</th><th>Pool DHCP</th></tr>
        <tr><td><b>R1</b></td><td>${n.R1}.1/24 · Secretaría</td><td>10.0.1.1/24 (hacia R2)</td><td><i>Aula nueva (pendiente)</i></td><td>SECRETARIA</td></tr>
        <tr><td><b>R2</b></td><td>${n.R2}.1/24 · Taller</td><td>10.0.1.2/24 (hacia R1)</td><td>10.0.2.1/24 (hacia R3)</td><td>TALLER</td></tr>
        <tr><td><b>R3</b></td><td>${n.R3}.1/24 · Dirección</td><td>10.0.2.2/24 (hacia R2)</td><td>—</td><td>DIRECCION</td></tr></table></div>
      <div class="tbl-wrap"><table class="doc-table"><tr><th>Elemento</th><th>Datos</th></tr>
        <tr><td>Servidor (DNS e intranet)</td><td><b>SRV</b> · ${n.R3}.10 (estático) · nombre <code>intranet.cited.local</code></td></tr>
        <tr><td>DHCP</td><td>Cada router excluye de la .1 en adelante las direcciones reservadas para equipos fijos y reparte el resto con su IP como puerta de enlace y el servidor SRV como DNS.</td></tr>
        <tr><td>WiFi del Taller</td><td><b>AP-TALLER</b> conectado al switch del Taller · SSID <code>${esc(D.ssid)}</code> · seguridad <b>WPA2-Personal</b> · clave corporativa <code>${esc(D.key)}</code></td></tr>
        <tr><td>Equipos</td><td>SEC-1, SEC-2 · TAL-1, PORTATIL (WiFi) · DIR-1, SRV · AULA-1 (aula nueva, sin configurar)</td></tr></table></div>
      <p class="small muted">Cada ticket parte de esta red funcionando con <b>un único fallo</b> introducido (o, en el encargo del aula nueva, con una tarea pendiente). Los tickets son independientes.</p>`, { wide: true, icon: "🗺️" });
  }
  function showHelp() {
    panel("Chuleta de comandos", `
      <div class="grid2">
        <div><h4>🖥 En los PC</h4>${cmdBox("ipconfig\nipconfig /all\nipconfig /renew\nping 10.0.1.1\ntracert 10.0.2.2", "PC")}<p class="small">Pestaña <b>IP Configuration</b>: cambiar entre DHCP y estática. En el portátil, <b>PC Wireless</b> muestra las redes WiFi y permite conectarse.</p></div>
        <div><h4>⌁ En los routers (consulta)</h4>${cmdBox("show ip interface brief\nshow ip route\nshow ip dhcp binding\nenable\nshow running-config", "ROUTER")}<p class="small"><b>show running-config</b> muestra toda la configuración. Requiere <code>enable</code>.</p></div>
      </div>
      <h4>⌁ Configuración en los routers</h4>
      ${cmdBox("enable\nconfigure terminal\n\ninterface GigabitEthernet0/2\n ip address IP MASCARA\n no shutdown\n exit\n\nip route RED_DESTINO MASCARA SIGUIENTE_SALTO\n\nip dhcp excluded-address INICIO FIN\nno ip dhcp excluded-address INICIO FIN\n\nip dhcp pool NOMBRE\n network RED MASCARA\n default-router IP_DEL_ROUTER\n dns-server IP_DEL_DNS\n exit\n\nend\ncopy running-config startup-config", "IOS")}
      <p class="small muted">Se admiten abreviaturas (<code>en</code>, <code>conf t</code>, <code>int g0/0</code>, <code>no shut</code>, <code>sh ip int br</code>…), <code>?</code> para ver los comandos del modo y <code>do</code> para lanzar un <code>show</code> desde configuración. Flecha ↑ repite comandos.</p>
      <h4>Subredes</h4>
      <div class="tbl-wrap"><table class="doc-table"><tr><th>Prefijo</th><th>Máscara</th><th>Direcciones</th><th>Hosts útiles</th></tr>${[24, 25, 26, 27, 28, 29, 30].map((p) => `<tr><td>/${p}</td><td class="mono">255.255.255.${256 - 2 ** (32 - p) === 256 ? 0 : 256 - 2 ** (32 - p)}</td><td>${2 ** (32 - p)}</td><td>${2 ** (32 - p) - 2}</td></tr>`).join("")}</table></div>
      <p class="small">Hosts útiles = 2<sup>h</sup> − 2 (h = bits de host). Red = IP AND máscara · broadcast = última dirección · VLSM: ordena de mayor a menor y asigna seguidas.</p>
      <h4>Tipos de fallo</h4>
      <p><b>Físico</b>: cable, conexión o interfaz apagada · <b>Direccionamiento</b>: IP, máscara o gateway del equipo · <b>Enrutamiento / DHCP</b>: rutas o pool DHCP del router · <b>Servicios</b>: DNS u otros servicios · <b>Inalámbrico</b>: SSID, autenticación o cifrado de la WiFi.</p>`, { wide: true, icon: "📘" });
  }

  function renderIntro() {
    $("#topbar").hidden = true;
    app.innerHTML = `<section class="intro"><div class="intro-card card">
      <span class="eyebrow">CITED · REDES LOCALES · 1º SMR · UD3</span>
      <h1>OPERACIÓN<br><span class="hl">RECONEXIÓN</span></h1>
      <p class="lead">Lunes, 8:00. Fin de semana de obras en CITED: han movido equipos, han tocado routers y alguien ha «configurado» la WiFi del Taller. Hoy nadie se comunica con nadie y Dirección quiere además el aula nueva funcionando. Eres el técnico de la red. Tienes <b>${CN.NT} tickets</b> y <b>una sesión de clase</b> para cerrarlos. Una regla: <b>estar conectado no es estar comunicado</b>.</p>
      <div class="mission">
        <div><b>Cómo se juega</b><ul><li>Abre los PC, routers y el punto de acceso desde el mapa</li><li>Comprueba con los comandos de clase (ipconfig, ping, show…)</li><li>Corrige la configuración: IP, máscara, rutas, DHCP, WiFi</li><li>Verifica con un ping y documenta cada incidencia</li></ul></div>
        <div><b>Cada ticket sigue el método</b><ul><li>Observar → Comprobar</li><li>Localizar → Corregir</li><li>Verificar → Documentar</li><li>Las salidas son <b>simuladas</b> pero coherentes</li></ul></div>
      </div>
      <div class="rules"><span>🎫 Ticket cerrado +${C.POINTS.TICKET}</span><span>★ Sin errores +${C.POINTS.CLEAN}</span><span>✗ Parte erróneo −${C.POINTS.WRONG}</span><span>💡 Pista −${C.POINTS.HINT}</span><span>⚡ Rapidez hasta +${C.POINTS.SPEED}</span></div>
      <p class="small muted">Es una actividad <b>individual</b>: cada alumno recibe fallos y direcciones distintos. Al acabar la clase pulsa 💾 para guardar la partida. Al terminar descargarás tu informe en PDF para subirlo al campus.</p>
      <form class="start" id="startForm"><label><span>Nombre y apellidos</span><input id="teamName" maxlength="60" autocomplete="name" placeholder="p. ej. Laura García Pérez"></label><button class="btn big" type="submit">EMPEZAR LA RECONEXIÓN</button></form>
      <div class="load-row">¿Vienes de otra clase? ${loadButton()}</div>
    </div></section>`;
    bindLoad(app);
    $("#startForm").onsubmit = async (e) => {
      e.preventDefault();
      const team = $("#teamName").value.trim(); if (!team) return $("#teamName").focus();
      S = newState(team); save(); scheduleRank(true); boot();
    };
  }
  function renderResume(saved) {
    $("#topbar").hidden = true;
    app.innerHTML = `<section class="intro"><div class="intro-card card narrow"><h2>¿CONTINUAR CON LOS TICKETS?</h2>
      <div class="resume-grid"><div><span>ALUMNO/A</span><b>${esc(saved.team)}</b></div><div><span>CÓDIGO</span><b>${saved.groupCode}</b></div><div><span>PUNTOS</span><b>${CN.score(saved)}</b></div><div><span>TICKETS</span><b>${saved.completed.length}/${CN.NT}</b></div></div>
      <div class="row-actions"><button class="btn big" id="cont">CONTINUAR</button><button class="btn ghost big" id="reset">REINICIAR</button></div><div class="load-row">${loadButton()}</div></div></section>`;
    bindLoad(app);
    $("#cont").onclick = () => { S = saved; boot(); };
    $("#reset").onclick = async () => { if (await modal({ title: "¿Reiniciar?", body: "<p>Se pierde el progreso y se genera un <b>código nuevo</b> con fallos distintos.</p>", ok: "Sí, reiniciar", cancel: "Cancelar" })) { clear(); S = null; renderIntro(); } };
  }
  function renderBriefing() {
    app.innerHTML = `<section class="room enter"><div class="room-head"><span class="eyebrow">ANTES DE EMPEZAR · CÓDIGO ${S.groupCode}</span><h2>Esta es la red de CITED</h2></div>
      <div class="ticket-grid"><aside class="side">
        <div class="card ticket-card"><p>Es la red de vuestras prácticas: <b>R1 – R2 – R3</b> en cadena, una LAN por router (Secretaría, Taller y Dirección), <b>rutas estáticas</b> y <b>DHCP</b> en cada router. En el Taller hay un <b>punto de acceso WiFi</b> y un portátil; en Dirección, el servidor <b>SRV</b>. Arriba está el <b>aula nueva</b>, todavía sin configurar.</p><p>Haz clic en cualquier equipo para abrirlo. Prueba, por ejemplo, <code>ipconfig /all</code> en un PC, <code>show ip route</code> en un router o la pestaña <b>PC Wireless</b> del portátil.</p><p class="small muted">Aquí todo funciona (salvo el aula nueva). En cada ticket habrá un fallo distinto.</p></div>
        <button class="btn ghost" type="button" id="docs2">🗺️ Documentación de la red</button><button class="btn ghost" type="button" id="help2">📘 Chuleta de comandos</button>
        <button class="btn big" type="button" id="go">ABRIR EL PRIMER TICKET →</button>
      </aside><div class="workbench"><div class="card map-card">${mapSVG()}</div></div></div></section><div class="card dock float" hidden role="dialog" aria-label="Consolas de los equipos"></div>`;
    const base = CN.makeBase(D);
    S.parts.brief = S.parts.brief || {};
    CUR = { idx: -1, t: { id: "brief", verify: () => false, fixed: () => true, answer: { device: "" } }, parts: S.parts.brief, net: base, tabs: [], active: null, terms: {} };
    $$(".topo .dev", app).forEach((g) => (g.onclick = () => openDevice(g.dataset.dev)));
    $("#docs2").onclick = showDocs; $("#help2").onclick = showHelp;
    $("#go").onclick = () => { S.briefed = true; save(); renderTicket(0); };
    paintMap(); renderDock();
  }
  async function boot() {
    D = CN.deriveGroup(S.groupCode);
    TK = CN.tickets(D);
    if (S.activeMs == null) {           // partidas empezadas antes de medir el tiempo activo
      const wall = (S.endTime || Date.now()) - S.startTime;
      S.activeMs = wall < 4 * 3600000 ? wall : 60 * 60000;
    }
    S.score = CN.score(S); save(); scheduleRank(true);
    updateHUD();
    if (S.finished) return renderFinal();
    if (!S.briefed) return renderBriefing();
    renderTicket(Math.min(S.current, TK.length - 1));
  }
  let lastAct = Date.now();
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) => document.addEventListener(ev, () => (lastAct = Date.now()), { passive: true }));
  setInterval(() => {
    if (!S || !TK || S.finished || document.visibilityState !== "visible") return;
    if (Date.now() - lastAct > C.SPEED.IDLE_MIN * 60000) return;
    S.activeMs = (S.activeMs || 0) + 5000; save();
  }, 5000);
  const fmtMin = (m) => `${Math.floor(m / 60) ? Math.floor(m / 60) + " h " : ""}${Math.round(m % 60)} min`;
  function finish() {
    if (!S.finished) {
      S.finished = true; S.endTime = Date.now();
      S.score = CN.score(S); save();
      const bonus = Math.round(C.POINTS.SPEED * CN.speedFactor(S));
      setTimeout(() => toast(bonus ? `⚡ +${bonus} puntos por rapidez (${fmtMin(CN.activeMin(S))} de trabajo)` : `Tiempo de trabajo: ${fmtMin(CN.activeMin(S))}`, "ok"), 600);
    }
    scheduleRank(true);
    renderFinal();
  }
  function reportText() {
    const L = [];
    L.push("HOJA DE RESULTADOS · OPERACIÓN RECONEXIÓN (1º SMR · REDES LOCALES · UD3)");
    L.push(`Alumno/a: ${S.team} · Código: ${S.groupCode} · Fecha: ${new Date(S.endTime || Date.now()).toLocaleString("es-ES")}`);
    L.push(`Nota: ${CN.fmtGrade(CN.grade(S, TK).total)} / 10 · Puntos: ${S.score} · Pistas: ${S.hintsUsed} · Partes erróneos: ${S.totalErrors}`);
    L.push(`Inicio: ${new Date(S.startTime).toLocaleString("es-ES")} · Fin: ${S.endTime ? new Date(S.endTime).toLocaleString("es-ES") : "-"} · Tiempo de trabajo: ${fmtMin(CN.activeMin(S))}`);
    L.push("Las evidencias proceden de una simulación de la red de clase.\n");
    TK.forEach((t, i) => {
      const P = S.parts[t.id] || {}, r = P.report || {};
      L.push("=".repeat(70));
      L.push(`TICKET ${i + 1} · ${t.title}`);
      L.push(`1. SÍNTOMA: ${t.quote}`);
      L.push("2. PRUEBAS REALIZADAS:");
      (P.log || []).slice(0, 25).forEach((l) => L.push(`   [${l.dev}] ${l.cmd}${l.ok === true ? "  → OK" : l.ok === false ? "  → falla" : ""}`));
      L.push(`3. DIAGNÓSTICO: tipo ${CN.CATS[r.cat] || "-"} · dispositivo ${r.device || "-"} · causa: ${r.causeText || "-"} · evidencia: ${r.cmd || "-"}`);
      L.push(`   Justificación: ${r.why || "-"}`);
      L.push("4. CORRECCIÓN:");
      (P.changes || []).forEach((c) => L.push(`   ${c}`));
      L.push(`5. VERIFICACIÓN: ${P.verifyText || "-"}`);
    });
    return L.join("\n") + "\n";
  }
  async function reportCode(partial) {
    const end = partial ? Date.now() : S.endTime;
    const elapsed = Math.round(CN.activeMin(S) * 60);
    const g = CN.grade(S, TK).total;
    return CN.makeFinishCode({ group: S.groupCode, team: S.team, elapsed, score: S.score, hints: S.hintsUsed, errors: S.totalErrors, end, tickets: S.completed.length, partial, grade: g });
  }
  async function renderFinal() {
    updateHUD();
    const code = await reportCode(false);
    const G = CN.grade(S, TK);
    app.innerHTML = `<section class="final"><div class="card final-card">
      <span class="eyebrow">TODOS LOS TICKETS CERRADOS</span><h1>RED <span class="hl">RECONECTADA</span></h1>
      <div class="stats"><div><span>TICKETS</span><b>${S.completed.length}/${CN.NT}</b></div><div><span>PUNTOS</span><b>${S.score}</b></div><div><span>TIEMPO</span><b>${Math.round(CN.activeMin(S))}′</b></div><div><span>PISTAS</span><b>${S.hintsUsed}</b></div><div><span>ERRORES</span><b>${S.totalErrors}</b></div></div>
      <div class="tbl-wrap"><table class="doc-table summary-table"><tr><th>#</th><th>Incidencia</th><th>Tipo</th><th>Causa</th><th>Corrección</th></tr>
      ${TK.map((t, i) => { const P = S.parts[t.id] || {}; return `<tr><td>${i + 1}</td><td>${t.title}</td><td>${catName(t.answer.cat)}</td><td>${esc((P.report || {}).causeText || "")}</td><td><code>${esc((P.changes || []).slice(-2).join(" · "))}</code></td></tr>`; }).join("")}</table></div>
      <div class="pdf-box"><div><b>📄 Tu informe en PDF</b><p class="small">Incluye tus datos, tu <b>nota</b>, los ${CN.NT} tickets (síntoma, pruebas, diagnóstico, corrección y verificación) y un código de verificación. <b>Descárgalo y súbelo a la tarea del campus.</b></p></div><button class="btn big" id="dlPdf" type="button">⬇️ Descargar PDF</button></div>
      <p class="rank-status" id="rankStatus">${rankMsg()}</p>
      <div class="finish-code"><span>CÓDIGO DE VERIFICACIÓN · también aparece en el PDF</span>${cmdBox(code, esc(S.team) + " · " + S.groupCode)}</div>
      <p class="small muted"><button class="linkish" id="dlTxt" type="button">Descargar también en texto (.txt)</button></p>
    </div></section>`;
    $("#dlPdf").onclick = () => downloadPDF(code, false);
    $("#dlTxt").onclick = () => download(`Reconexion_${fileName()}.txt`, reportText());
    document.addEventListener("click", (e) => { if (e.target && e.target.id === "rankRetry") { S.rankStatus = ""; $("#rankStatus").innerHTML = rankMsg(); scheduleRank(true); } });
    confetti(80); Snd.ok();
  }
  const fileName = () => String(S.team || "alumno").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "alumno";
  function loadJsPDF() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = () => res(window.jspdf); s.onerror = () => rej(new Error("jspdf"));
      document.head.appendChild(s);
    });
  }
  // jsPDF con fuentes estándar solo admite Latin-1: sustituimos símbolos
  const pdfSafe = (t) => String(t == null ? "" : t).replace(/[→⇒]/g, "->").replace(/[✓✔]/g, "OK").replace(/[✗✘]/g, "X").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[—–]/g, "-").replace(/·/g, "·").replace(/…/g, "...").replace(/[^\x00-\xFF]/g, "");
  async function downloadPDF(code, partial) {
    const G = CN.grade(S, TK);
    let lib;
    try { lib = await loadJsPDF(); } catch (e) { toast("No se pudo cargar el generador de PDF. Descarga el .txt", "bad"); return; }
    const doc = new lib.jsPDF({ unit: "mm", format: "a4" });
    const W = 210, M = 16, CW = W - 2 * M;
    const NAVY = [16, 28, 58], LIME = [169, 219, 46], LLIME = [234, 248, 201], GRAY = [107, 116, 136], RED = [217, 68, 68];
    let y = 0;
    const footer = () => {
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        doc.setPage(i);
        doc.setDrawColor(...NAVY); doc.setLineWidth(0.4); doc.line(M, 284, W - M, 284);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
        doc.text(pdfSafe(`Código de verificación: ${code}`), M, 289);
        doc.text(`Página ${i} de ${n}`, W - M, 289, { align: "right" });
      }
    };
    const need = (h) => { if (y + h > 278) { doc.addPage(); y = 18; } };
    const para = (t, { size = 9.5, bold = false, color = NAVY, font = "helvetica", indent = 0, gap = 1.2 } = {}) => {
      doc.setFont(font, bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...color);
      const lines = doc.splitTextToSize(pdfSafe(t), CW - indent);
      const lh = size * 0.42;
      for (const ln of lines) { need(lh); doc.text(ln, M + indent, y); y += lh; }
      y += gap;
    };
    const label = (k, v) => { need(6); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...NAVY); doc.text(pdfSafe(k), M, y); const w = doc.getTextWidth(pdfSafe(k)) + 2; doc.setFont("helvetica", "normal"); const lines = doc.splitTextToSize(pdfSafe(v), CW - w); doc.text(lines[0] || "", M + w, y); y += 4.6; for (const ln of lines.slice(1)) { need(4.6); doc.text(ln, M + w, y); y += 4.6; } y += 0.6; };

    // Cabecera
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 34, "F");
    doc.setFillColor(...LIME); doc.rect(0, 34, W, 2.2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...LIME);
    doc.text(pdfSafe("CITED · REDES LOCALES · 1º SMR · UD3 · CONFIGURACIÓN DE REDES LOCALES"), M, 11);
    doc.setFontSize(22); doc.setTextColor(255, 255, 255); doc.text(pdfSafe("OPERACIÓN RECONEXIÓN"), M, 22);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(207, 214, 230);
    doc.text("Informe de configuración y resolución de incidencias · CITED", M, 29);
    y = 46;
    if (partial) {
      doc.setFillColor(...RED); doc.rect(0, 36.2, W, 8, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(255, 255, 255);
      doc.text(pdfSafe(`INFORME PARCIAL · ${S.completed.length}/${CN.NT} tickets cerrados · nota provisional · generado el ${new Date().toLocaleString("es-ES")}`), W / 2, 41.6, { align: "center" });
      y = 54;
    }

    // Datos del alumno
    doc.setFillColor(...LLIME); doc.setDrawColor(...NAVY); doc.setLineWidth(0.6); doc.roundedRect(M, y - 6, CW, 30, 3, 3, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...NAVY); doc.text(pdfSafe(S.team), M + 5, y + 1);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRAY);
    const hora = (t) => new Date(t).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    doc.text(pdfSafe(`Código: ${S.groupCode}  ·  Inicio: ${hora(S.startTime)}  ·  ${partial ? "Generado" : "Fin"}: ${hora(partial ? Date.now() : S.endTime || Date.now())}  ·  Trabajo: ${fmtMin(CN.activeMin(S))}`), M + 5, y + 7);
    // Nota destacada
    doc.setFillColor(...NAVY); doc.roundedRect(W - M - 38, y - 3, 34, 24, 3, 3, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...LIME); doc.text(partial ? "NOTA PROVISIONAL" : "NOTA", W - M - 21, y + 2.5, { align: "center" });
    doc.setFontSize(20); doc.setTextColor(255, 255, 255); doc.text(CN.fmtGrade(G.total), W - M - 21, y + 13, { align: "center" });
    doc.setFontSize(8); doc.setTextColor(207, 214, 230); doc.text("sobre 10", W - M - 21, y + 18, { align: "center" });
    const stats = [["PUNTOS", S.score], ["TICKETS", `${S.completed.length}/${CN.NT}`], ["TIEMPO", `${Math.round(CN.activeMin(S))} min`], ["PISTAS", S.hintsUsed], ["ERRORES", S.totalErrors]];
    stats.forEach(([k, v], i) => {
      const x = M + 5 + i * 27;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...GRAY); doc.text(k, x, y + 14);
      doc.setFontSize(14); doc.setTextColor(...NAVY); doc.text(String(v), x, y + 21);
    });
    y += 32;

    // Resumen
    para("RESUMEN DE INCIDENCIAS", { size: 11, bold: true, gap: 2 });
    const cols = [10, 50, 34, 24, CW - 118];
    const head = ["#", "Incidencia", "Tipo", "Dispositivo", "Causa"];
    const row = (cells, bold, fill) => {
      doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(8.5);
      const wrapped = cells.map((c, i) => doc.splitTextToSize(pdfSafe(c), cols[i] - 3));
      const h = Math.max(...wrapped.map((w) => w.length)) * 3.8 + 2.6;
      need(h);
      if (fill) { doc.setFillColor(...fill); doc.rect(M, y - 4, CW, h, "F"); }
      let x = M;
      wrapped.forEach((w, i) => { doc.setTextColor(...(fill === NAVY ? [255, 255, 255] : NAVY)); doc.text(w, x + 1.5, y); x += cols[i]; });
      y += h; doc.setDrawColor(228, 232, 237); doc.setLineWidth(0.2); doc.line(M, y - 4, M + CW, y - 4);
    };
    row(head, true, NAVY);
    TK.forEach((t, i) => { const r = (S.parts[t.id] || {}).report || {}; row([String(i + 1), t.title, CN.CATS[r.cat] || "-", r.device || "-", r.causeText || "Sin resolver"], false, i % 2 ? [247, 248, 250] : null); });
    y += 4;

    // Calificación
    need(60);
    para(partial ? "CALIFICACIÓN PROVISIONAL" : "CALIFICACIÓN", { size: 11, bold: true, gap: 2 });
    const C2 = [10, 64, 40, 18, 26, CW - 158];
    const row2 = (cells, bold, fill) => {
      doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(8.5);
      need(7);
      if (fill) { doc.setFillColor(...fill); doc.rect(M, y - 4, CW, 6.4, "F"); }
      let x = M;
      cells.forEach((c, i) => { doc.setTextColor(...(fill === NAVY ? [255, 255, 255] : NAVY)); doc.text(pdfSafe(c), x + 1.5, y); x += C2[i]; });
      y += 6.4; doc.setDrawColor(228, 232, 237); doc.setLineWidth(0.2); doc.line(M, y - 4, M + CW, y - 4);
    };
    row2(["#", "Ticket", "Estado", "Pistas", "Partes err.", "Puntos"], true, NAVY);
    G.per.forEach((x, i) => row2([String(i + 1), x.title, x.estado, String(x.hints), String(x.wrong), `${CN.fmtGrade(x.pts)} / ${CN.fmtGrade(C.GRADE.TICKET)}`], false, i % 2 ? [247, 248, 250] : null));
    row2(["⚡", "Rapidez", G.speed.applies ? `${G.speed.minutes} min de trabajo` : "Solo al terminar", "-", "-", `${CN.fmtGrade(G.speed.pts)} / ${CN.fmtGrade(C.GRADE.SPEED)}`], false, [234, 248, 201]);
    doc.setFillColor(...LLIME); doc.rect(M, y - 4, CW, 7.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...NAVY);
    doc.text(partial ? "NOTA PROVISIONAL" : "NOTA FINAL", M + 1.5, y + 1);
    doc.text(`${CN.fmtGrade(G.total)} / 10`, M + CW - 2, y + 1, { align: "right" });
    y += 9;
    para(`Criterio: tickets hasta ${CN.fmtGrade(C.GRADE.TICKET * CN.NT)} puntos (${CN.fmtGrade(C.GRADE.TICKET)} por ticket cerrado, menos ${CN.fmtGrade(C.GRADE.HINT)} por pista y ${CN.fmtGrade(C.GRADE.WRONG)} por parte erróneo, mínimo ${CN.fmtGrade(C.GRADE.MIN_CLOSED)}; ${CN.fmtGrade(C.GRADE.VERIFIED_ONLY)} si está corregido sin parte). Rapidez hasta ${CN.fmtGrade(C.GRADE.SPEED)} puntos si se terminan los ${CN.NT} tickets: ${C.SPEED.FAST_MIN} min de trabajo o menos = máximo; ${C.SPEED.SLOW_MIN} min o más = 0. Solo cuenta el tiempo con la actividad abierta y en uso.`, { size: 7.8, color: GRAY, gap: 4 });

    // Detalle por ticket
    TK.forEach((t, i) => {
      const P = S.parts[t.id] || {}, r = P.report || {};
      need(22);
      doc.setFillColor(...NAVY); doc.roundedRect(M, y - 5, CW, 9, 2, 2, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...LIME);
      doc.text(pdfSafe(`TICKET ${i + 1} · ${t.title.toUpperCase()}`), M + 4, y + 1);
      y += 10;
      if (!P.report) { need(6); para(P.verified ? "Estado: corregido y verificado, falta documentar el parte." : "Estado: SIN RESOLVER.", { bold: true, color: RED, gap: 1 }); }
      label("1. Síntoma: ", t.quote);
      need(6); para("2. Pruebas realizadas:", { bold: true, gap: 0.6 });
      const log = (P.log || []).slice(0, 18);
      if (!log.length) para("-", { indent: 4 });
      log.forEach((l) => para(`[${l.dev}] ${l.cmd}${l.ok === true ? "   -> correcto" : l.ok === false ? "   -> falla" : ""}`, { font: "courier", size: 8.3, indent: 4, gap: 0.3, color: [42, 54, 88] }));
      if ((P.log || []).length > 18) para(`(+${P.log.length - 18} comandos más)`, { size: 8, indent: 4, color: GRAY });
      y += 1;
      label("3. Diagnóstico: ", `${CN.CATS[r.cat] || "-"} · dispositivo ${r.device || "-"} · ${r.causeText || "-"}`);
      label("   Evidencia clave: ", r.cmd || "-");
      label("   Justificación: ", r.why || "-");
      need(6); para("4. Corrección aplicada:", { bold: true, gap: 0.6 });
      (P.changes || []).slice(-10).forEach((c) => para(c, { font: "courier", size: 8.3, indent: 4, gap: 0.3, color: [42, 54, 88] }));
      if (!(P.changes || []).length) para("-", { indent: 4 });
      y += 1;
      label("5. Verificación: ", P.verifyText || "-");
      y += 4;
    });
    need(20);
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.4); doc.setFillColor(247, 248, 250); doc.roundedRect(M, y - 4, CW, 16, 2, 2, "FD");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.3); doc.setTextColor(...GRAY);
    doc.text(doc.splitTextToSize(pdfSafe("Las evidencias proceden de una simulación de la red de clase (estilo Cisco Packet Tracer). El profesor puede comprobar la autenticidad de este informe con el código de verificación en el panel del profesor."), CW - 8), M + 4, y + 1);
    footer();
    doc.save(`Reconexion_${fileName()}${partial ? "_PARCIAL" : ""}.pdf`);
    toast(partial ? "Informe parcial descargado." : "PDF descargado. Súbelo a la tarea del campus.", "ok");
  }
  function confetti(n) {
    const wrap = document.createElement("div"); wrap.className = "confetti";
    for (let i = 0; i < n; i++) { const p = document.createElement("i"); p.style.left = Math.random() * 100 + "vw"; p.style.background = [L_, N_, LL, "#fff"][i % 4]; p.style.animationDelay = Math.random() * 0.8 + "s"; p.style.animationDuration = 2 + Math.random() * 1.5 + "s"; wrap.appendChild(p); }
    document.body.appendChild(wrap); setTimeout(() => wrap.remove(), 4500);
  }

  /* =============== ESTADO / HUD =============== */
  function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }
  function clear() { try { localStorage.removeItem(STORE); } catch (e) {} }
  function newState(team) { return { v: 1, groupCode: CN.generateGroupCode(), team, current: 0, score: 0, activeMs: 0, hintsUsed: 0, hintsByRoom: {}, errorsByRoom: {}, totalErrors: 0, completed: [], keywords: [], parts: {}, startTime: Date.now(), endTime: null, finished: false, briefed: false, muted: false }; }
  let rankTimer = null;
  function scheduleRank(now) {
    if (!C.RANKING_URL || !S) return;
    clearTimeout(rankTimer);
    rankTimer = setTimeout(async () => { S.rankStatus = await CN.sendRank(S); save(); const el = $("#rankStatus"); if (el) el.innerHTML = rankMsg(); }, now ? 0 : 1500);
  }
  const rankMsg = () => !C.RANKING_URL ? "" : S.rankStatus === "ok" ? "✓ Resultado enviado al ranking" : S.rankStatus === "error" ? "⚠ No se pudo enviar al ranking (revisa la conexión) <button class='btn ghost' id='rankRetry' type='button'>Reintentar</button>" : "Enviando al ranking…";
  function addScore(d) { scheduleRank(); S.score = CN.score(S); const el = $("#hudScore"); el.textContent = S.score; el.parentElement.classList.remove("bump-up", "bump-down"); void el.offsetWidth; el.parentElement.classList.add(d >= 0 ? "bump-up" : "bump-down"); }
  function setHdr() { const tb = $("#topbar"); if (tb && !tb.hidden) document.documentElement.style.setProperty("--hdr", tb.offsetHeight + "px"); }
  window.addEventListener("resize", () => { setHdr(); const d = $(".dock", app); if (d && !d.hidden) placeDock(d); });
  function updateHUD() {
    $("#topbar").hidden = false;
    requestAnimationFrame(setHdr);
    $("#hudTeam").textContent = S.team; $("#hudGroup").textContent = S.groupCode; $("#hudScore").textContent = S.score;
    $("#muteBtn").textContent = S.muted ? "🔇" : "🔊";
    const done = S.completed.length, total = CN.NT, cur = Math.min(S.current, total - 1);
    $("#hudStage").textContent = S.finished ? "TODOS LOS TICKETS CERRADOS" : `TICKET ${cur + 1} DE ${total}`;
    $("#hudPct").textContent = Math.round((done / total) * 100) + "%";
    $("#progressFill").style.width = (done / total) * 100 + "%";
    const names = Array.from({ length: CN.NT }, (_, i) => `Ticket ${i + 1}`);
    $("#stageMap").innerHTML = names.map((n, i) => `<li class="${S.completed.includes(i) ? "done" : i === cur && !S.finished ? "current" : ""}"><span>${S.completed.includes(i) ? "✓" : i + 1}</span><em>${n}</em></li>`).join("");
  }
  $("#muteBtn").onclick = () => { if (!S) return; S.muted = !S.muted; save(); updateHUD(); };
  $("#docBtn").onclick = showDocs;
  $("#helpBtn").onclick = showHelp;
  $("#reportBtn").onclick = async () => {
    if (!S || !TK) return;
    if (S.finished) return downloadPDF(await reportCode(false), false);
    const ok = await modal({ title: "¿Descargar informe parcial?", body: `<p>Aún no has cerrado los ${CN.NT} tickets (llevas <b>${S.completed.length}/${CN.NT}</b>). Se generará un <b>informe PARCIAL</b> con lo que llevas hecho hasta ahora.</p><p class="small muted">Puedes seguir jugando después y descargar otro informe más adelante. Sube al campus el último.</p>`, ok: "Descargar informe parcial", cancel: "Cancelar" });
    if (ok) downloadPDF(await reportCode(true), true);
  };
  $("#saveBtn").onclick = async () => { if (!S) return; download(`partida_${S.groupCode}.reconexion`, await CN.makeSave(S), "application/json"); toast("Partida guardada en Descargas", "info"); };
  function loadButton() { return `<label class="btn ghost load-btn"><input type="file" accept=".reconexion,.json,.txt" hidden>📂 Cargar partida guardada</label>`; }
  function bindLoad(root) {
    const inp = $(".load-btn input", root); if (!inp) return;
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const r = await CN.readSave(await f.text()); inp.value = "";
      if (!r) return modal({ title: "Archivo no válido", body: "<p>Ese archivo no es una partida de Operación Reconexión.</p>" });
      if (r.tampered) return modal({ title: "Partida manipulada", body: "<p>El archivo se ha modificado y no se puede cargar.</p>" });
      S = r.state; save(); toast(`Partida de ${S.team} cargada`, "ok"); boot();
    };
  }

  /* =============== ARRANQUE =============== */
  const saved = load();
  if (saved && saved.groupCode) renderResume(saved); else renderIntro();
})();
