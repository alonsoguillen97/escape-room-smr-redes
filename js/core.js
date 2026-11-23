/* =========================================================
   OPERACIÓN RECONEXIÓN — núcleo (alumno + profesor)
   Red de las prácticas de 1º SMR: R1 – R2 – R3 en cadena, rutas estáticas,
   DHCP en cada router, un punto de acceso WiFi en el Taller y una
   ampliación pendiente (aula nueva) en R1. Seis tickets con fallos distintos por alumno.
   ========================================================= */
(function (g) {
  "use strict";
  const CONFIG = {
    SECRET: "RECONEXION|1SMR|RL|UD3|v1", // cámbialo cada curso
    TEACHER_PIN: "1SMR",                 // solo para el panel si NO hay ranking automático
    RANKING_URL: "",                     // vacío: no se envía nada fuera; el ranking se monta en el panel con los códigos de los PDF
    // Nota sobre 10 que aparece en el informe PDF: 6 tickets × 1,4 + 1,6 por rapidez
    GRADE: { TICKET: 1.4, HINT: 0.2, WRONG: 0.2, MIN_CLOSED: 0.7, VERIFIED_ONLY: 0.7, SPEED: 1.6 },
    // Rapidez según minutos de trabajo activo (sesión de 2 horas): <= FAST_MIN → máximo; >= SLOW_MIN → 0; lineal entre medias
    SPEED: { FAST_MIN: 75, SLOW_MIN: 115, IDLE_MIN: 5 }, // clase de 2 h: el máximo solo para los más rápidos
    // Puntos del juego (se ganan): por ticket cerrado, extra si es limpio, penalizaciones y rapidez
    POINTS: { TICKET: 200, CLEAN: 50, WRONG: 25, HINT: 50, SPEED: 250 },
  };
  const NT = 6; // número de tickets
  const enc = new TextEncoder();
  const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
  async function sha256(t) { return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(t)))); }

  /* ---------- PRNG ---------- */
  function xmur3(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; }; }
  function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function rng(seed) { const r = mulberry32(xmur3(seed)()); return { next: r, int: (a, b) => a + Math.floor(r() * (b - a + 1)), pick: (arr) => arr[Math.floor(r() * arr.length)], shuffle: (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; } }; }
  const ALPH = "ABCDFGHJKLMNPQRSTUVWXYZ23456789"; // sin E: evita códigos tipo 7E28 que la hoja de cálculo convierte en número
  function generateGroupCode() {
    for (;;) {
      const b = crypto.getRandomValues(new Uint8Array(4));
      const c = Array.from(b, (x) => ALPH[x % ALPH.length]).join("");
      if (!/^\d+$/.test(c)) return c;
    }
  }

  /* ---------- Red de clase ---------- */
  const LANS = {
    R1: { dept: "Secretaría", short: "SEC", pool: "SECRETARIA", seg: "LAN-R1" },
    R2: { dept: "Taller", short: "TAL", pool: "TALLER", seg: "LAN-R2" },
    R3: { dept: "Dirección", short: "DIR", pool: "DIRECCION", seg: "LAN-R3" },
  };
  const ROUTERS = ["R1", "R2", "R3"];
  const MASK24 = "255.255.255.0";
  const HOSTS = { R1: ["SEC-1", "SEC-2"], R2: ["TAL-1", "PORTATIL"], R3: ["DIR-1", "SRV"] };
  const DEVICES = ["R1", "R2", "R3", "SEC-1", "SEC-2", "TAL-1", "PORTATIL", "AP-TALLER", "DIR-1", "SRV", "AULA-1"];
  const hostsOf = (r) => HOSTS[r];
  const lanOfHost = (hn) => (hn.startsWith("SEC") ? "R1" : hn.startsWith("TAL") || hn === "PORTATIL" ? "R2" : hn === "AULA-1" ? "AULA" : "R3");
  const DNS_NAME = "intranet.cited.local";
  const targetOf = { R1: "SEC-2", R2: "TAL-1", R3: "DIR-1" };

  function mac(r) { const h = () => r.int(0, 255).toString(16).padStart(2, "0").toUpperCase(); return `00${h()}.${h()}${h()}.${h()}${h()}`; }
  const IFS = (s) => s.replace("GigabitEthernet", "G");

  function baseline(d) {
    const net = d.net, srv = `${net.R3}.10`;
    const N = { routers: {}, hosts: {}, dns: { [DNS_NAME]: srv, "srv.cited.local": srv } };
    const R = (ifaces, statics, r) => ({ ifaces, statics, rip: null, dhcp: { excluded: [[`${net[r]}.1`, `${net[r]}.${d.excl[r]}`]], pools: [{ name: LANS[r].pool, network: `${net[r]}.0`, mask: MASK24, router: `${net[r]}.1`, dns: srv }] }, leases: [] });
    N.routers.R1 = R({
      "GigabitEthernet0/0": { ip: `${net.R1}.1`, mask: MASK24, shut: false, seg: "LAN-R1" },
      "GigabitEthernet0/1": { ip: "10.0.1.1", mask: MASK24, shut: false, seg: "T12" },
      "GigabitEthernet0/2": { ip: "", mask: "", shut: true, seg: "LAN-AULA" },
    }, [{ net: `${net.R2}.0`, mask: MASK24, nh: "10.0.1.2" }, { net: `${net.R3}.0`, mask: MASK24, nh: "10.0.1.2" }, { net: "10.0.2.0", mask: MASK24, nh: "10.0.1.2" }], "R1");
    N.routers.R2 = R({
      "GigabitEthernet0/0": { ip: `${net.R2}.1`, mask: MASK24, shut: false, seg: "LAN-R2" },
      "GigabitEthernet0/1": { ip: "10.0.1.2", mask: MASK24, shut: false, seg: "T12" },
      "GigabitEthernet0/2": { ip: "10.0.2.1", mask: MASK24, shut: false, seg: "T23" },
    }, [{ net: `${net.R1}.0`, mask: MASK24, nh: "10.0.1.1" }, { net: `${net.R3}.0`, mask: MASK24, nh: "10.0.2.2" }], "R2");
    N.routers.R3 = R({
      "GigabitEthernet0/0": { ip: `${net.R3}.1`, mask: MASK24, shut: false, seg: "LAN-R3" },
      "GigabitEthernet0/1": { ip: "10.0.2.2", mask: MASK24, shut: false, seg: "T23" },
    }, [{ net: `${net.R1}.0`, mask: MASK24, nh: "10.0.2.1" }, { net: `${net.R2}.0`, mask: MASK24, nh: "10.0.2.1" }, { net: "10.0.1.0", mask: MASK24, nh: "10.0.2.1" }], "R3");
    for (const r of ROUTERS) for (const hn of HOSTS[r]) {
      if (hn === "SRV") N.hosts[hn] = { seg: "LAN-R3", mac: d.macs[hn], dhcp: false, ip: srv, mask: MASK24, gw: `${net.R3}.1`, dns: srv, dnsServer: true };
      else N.hosts[hn] = { seg: LANS[r].seg, mac: d.macs[hn], dhcp: true, ip: "", mask: "", gw: "", dns: "" };
    }
    N.hosts.PORTATIL.nic = "Wireless0";
    N.hosts["AULA-1"] = { seg: "LAN-AULA", mac: d.macs["AULA-1"], dhcp: false, ip: "", mask: "", gw: "", dns: "", pending: true };
    N.wlan = {
      ap: { name: "AP-TALLER", ssid: d.ssid, sec: "WPA2-Personal", key: d.key, channel: d.channel, band: "2,4 GHz", seg: "LAN-R2" },
      client: { ssid: d.ssid, key: d.key },
      others: [
        { ssid: "CITED_INVITADOS", sec: "Abierta", key: "", channel: d.channel === 1 ? 11 : 1, signal: 3, seg: "GUEST" },
        { ssid: d.neigh, sec: "WPA2-Personal", key: "x" + d.key, channel: d.channel === 11 ? 6 : 11, signal: 1, seg: "NEIGH" },
      ],
    };
    wlanSync(N);
    return N;
  }

  /* ---------- WiFi: asociación y autenticación del portátil ---------- */
  function wlanNets(N) { const W = N.wlan; return [{ ...W.ap, signal: 4, own: true }, ...W.others]; }
  function wlanStatus(N) {
    const W = N.wlan, c = W.client;
    if (!c.ssid) return { ok: false, state: "off", msg: "Sin conexión inalámbrica." };
    const net = wlanNets(N).find((x) => x.ssid === c.ssid);
    if (!net) return { ok: false, state: "notfound", msg: `No se detecta ninguna red llamada «${c.ssid}».` };
    if (net.sec !== "Abierta" && c.key !== net.key) return { ok: false, state: "auth", net, msg: `Asociado a ${net.ssid}, pero la autenticación ha fallado (clave incorrecta).` };
    return { ok: true, state: "connected", net, msg: `Conectado a ${net.ssid} (${net.sec}, canal ${net.channel}).` };
  }
  // Coloca el portátil en el segmento de la red a la que está asociado. Si cambia, pide IP otra vez.
  function wlanSync(N, forceRenew) {
    const h = N.hosts.PORTATIL; if (!h) return;
    const st = wlanStatus(N);
    const seg = st.ok ? st.net.seg : "AIR";
    if (seg !== h.seg || forceRenew || (h.dhcp && !h.ip)) {
      h.seg = seg;
      if (h.dhcp) NET.dhcpRequest(N, "PORTATIL");
    }
    return st;
  }

  function leaseAll(N, only) {
    for (const [hn, h] of Object.entries(N.hosts)) if (h.dhcp && h.seg !== "AIR" && (!only || only.includes(hn))) NET.dhcpRequest(N, hn);
  }

  /* ---------- Salud de la red ---------- */
  function health(N, skip = ["AULA-1"]) {
    const T = NET.computeRoutes(N);
    const hosts = Object.keys(N.hosts).filter((h) => !skip.includes(h));
    const fails = [];
    for (const a of hosts) for (const b of hosts) {
      if (a === b) continue;
      const p = NET.probe(N, { type: "host", name: a }, N.hosts[b].ip, T);
      if (p.result !== "reply") fails.push(`${a}→${b}`);
    }
    for (const a of hosts) if (!N.hosts[a].dnsServer && !NET.resolve(N, a, DNS_NAME, T).ok) fails.push(`${a} DNS`);
    return { ok: fails.length === 0, fails };
  }
  function pingOk(N, a, b) { const T = NET.computeRoutes(N); return NET.probe(N, { type: "host", name: a }, N.hosts[b].ip, T).result === "reply"; }

  /* ---------- Subredes (cálculo) ---------- */
  function subnet(base, offset, prefix) {
    const size = 2 ** (32 - prefix), n = NET.ip2n(base) + offset;
    return { net: NET.n2ip(n), prefix, mask: NET.n2ip((0xffffffff << (32 - prefix)) >>> 0), gw: NET.n2ip(n + 1), first: NET.n2ip(n + 1), last: NET.n2ip(n + size - 2), bcast: NET.n2ip(n + size - 1), hosts: size - 2 };
  }

  /* ---------- Datos del alumno ---------- */
  const cache = {};
  function deriveGroup(code) {
    if (cache[code]) return cache[code];
    const r = rng(CONFIG.SECRET + "#" + code);
    const d = { code };
    const octs = r.shuffle(Array.from({ length: 24 }, (_, i) => 10 + i * 10)).slice(0, 3);
    d.net = { R1: `192.168.${octs[0]}`, R2: `192.168.${octs[1]}`, R3: `192.168.${octs[2]}` };
    d.excl = { R1: r.int(10, 30), R2: r.int(10, 30), R3: r.int(10, 30) };
    d.macs = {};
    for (const hn of ["SEC-1", "SEC-2", "TAL-1", "PORTATIL", "DIR-1", "SRV", "AULA-1"]) d.macs[hn] = mac(r);
    d.ssid = `CITED_TALLER_${r.int(10, 99)}`;
    d.key = r.pick(["Router", "Switch", "Cable", "Antena", "Enlace", "Puerto"]) + r.pick(["Azul", "Verde", "Lima", "Norte", "Sur"]) + r.int(1000, 9999);
    d.channel = r.pick([1, 6, 11]);
    d.neigh = `MiFibra-${r.int(1000, 9999).toString(16).toUpperCase()}`;
    // T1 · direccionamiento de un PC estático
    d.t1 = { router: r.pick(ROUTERS), variant: r.pick(["net", "mask", "gw"]) };
    d.t1.host = d.t1.variant === "mask" ? r.int(140, 220) : r.int(100, 220);
    d.t1.other = r.pick(ROUTERS.filter((x) => x !== d.t1.router));
    d.t1.wrongGw = r.pick(["254", "other"]);
    // T2 · interfaz apagada
    d.t2 = { variant: r.pick(["lan", "wan"]) };
    if (d.t2.variant === "lan") { d.t2.router = r.pick(ROUTERS); d.t2.iface = "GigabitEthernet0/0"; d.t2.lan = d.t2.router; }
    else { const o = r.pick([["R1", "GigabitEthernet0/1", "R1"], ["R2", "GigabitEthernet0/1", "R1"], ["R2", "GigabitEthernet0/2", "R3"], ["R3", "GigabitEthernet0/1", "R3"]]); d.t2.router = o[0]; d.t2.iface = o[1]; d.t2.lan = o[2]; }
    // T3 · ampliación con VLSM
    d.t3 = { Y: r.int(1, 25) * 10, size: r.pick(["mid", "small"]), big: r.int(33, 60), mid: r.int(17, 29), small: r.int(7, 13) };
    const base = `172.16.${d.t3.Y}.0`;
    d.t3.plan = { big: subnet(base, 0, 26), mid: subnet(base, 64, 27), small: subnet(base, 96, 28), link: subnet(base, 112, 30) };
    d.t3.target = d.t3.plan[d.t3.size];
    d.t3.order = r.shuffle(["big", "mid", "small", "link"]);
    // T4 · WiFi
    d.t4 = { variant: r.pick(["ssid", "key", "wep"]) };
    d.t4.badKey = d.key.replace(/\d$/, (x) => String((+x + r.int(1, 8)) % 10));
    d.t4.wep = Array.from({ length: 10 }, () => "0123456789ABCDEF"[r.int(0, 15)]).join("");
    // T5 · rutas estáticas
    d.t5 = { missing: r.pick(["R1", "R3"]) };
    // T6 · DHCP
    d.t6 = { router: r.pick(["R1", "R3"]), variant: r.pick(["gw", "excl", "net"]) };
    const L6 = d.net[d.t6.router];
    d.t6.wrongGw = r.pick([`${L6}.254`, `${d.net[r.pick(ROUTERS.filter((x) => x !== d.t6.router))]}.1`, `${L6}.${r.int(2, 9)}`]);
    d.t6.wrongNet = `192.168.${+L6.split(".")[2] + r.pick([1, 2, 5])}.0`;
    cache[code] = d;
    return d;
  }

  /* ---------- Tickets ---------- */
  const CATS = { fisico: "Físico", direccionamiento: "Direccionamiento", red: "Enrutamiento / DHCP", servicios: "Servicios", wlan: "Inalámbrico (WLAN)" };
  const CMDS = ["ipconfig /all", "ping", "tracert", "show ip interface brief", "show ip route", "show ip dhcp binding", "show running-config", "PC Wireless (redes WiFi)", "Panel del punto de acceso"];
  const inNet = (ip, net) => typeof ip === "string" && ip.startsWith(net + ".");

  // Un cliente nuevo de ese router recibiría una configuración válida
  function freshClientOk(N, router, d) {
    const M = NET.clone(N), L = d.net[router];
    M.hosts.__NUEVO = { seg: LANS[router].seg, mac: "00FF.FFFF.FFFF", dhcp: true, ip: "", mask: "", gw: "", dns: "" };
    NET.dhcpRequest(M, "__NUEVO");
    const h = M.hosts.__NUEVO;
    if (!inNet(h.ip, L) || h.gw !== `${L}.1` || h.mask !== MASK24) return false;
    return NET.resolve(M, "__NUEVO", DNS_NAME).ok;
  }
  function makeBase(d) { const N = baseline(d); leaseAll(N); wlanSync(N, true); return N; }

  function tickets(d) {
    const net = d.net, srv = `${net.R3}.10`;
    const remote = (hn) => (e) => !inNet(e.dst, net[lanOfHost(hn)]) && e.dst !== "127.0.0.1";
    // ---- T1
    const T1 = d.t1.router, L1 = LANS[T1], n1 = net[T1], t1h = targetOf[T1], mate1 = HOSTS[T1].find((x) => x !== t1h);
    const t1cfg = d.t1.variant === "net" ? { ip: `${net[d.t1.other]}.${d.t1.host}`, mask: MASK24, gw: `${n1}.1` }
      : d.t1.variant === "mask" ? { ip: `${n1}.${d.t1.host}`, mask: "255.255.255.128", gw: `${n1}.1` }
      : { ip: `${n1}.${d.t1.host}`, mask: MASK24, gw: d.t1.wrongGw === "254" ? `${n1}.254` : `${net[d.t1.other]}.1` };
    // ---- T2
    const T2 = d.t2.router, I2 = d.t2.iface, LAN2 = d.t2.lan, LL2 = LANS[LAN2];
    // ---- T3
    const P3 = d.t3.plan, X3 = d.t3.target;
    const names3 = { big: "Laboratorio", mid: d.t3.size === "mid" ? "Aula nueva" : "Sala de profesores", small: d.t3.size === "small" ? "Aula nueva" : "Sala de profesores", link: "Enlace con el almacén" };
    const needs3 = { big: d.t3.big, mid: d.t3.mid, small: d.t3.small, link: 2 };
    const sub3 = (s) => `${s.net}/${s.prefix}`;
    const off = (s, k) => NET.n2ip(NET.ip2n(s.net) + k);
    const wrongSubs = d.t3.size === "mid"
      ? [`${off(P3.mid, -32)}/27`, `${P3.mid.net}/26`, `${off(P3.mid, 32)}/27`, `${P3.big.net}/27`]
      : [`${off(P3.small, -32)}/28`, `${P3.small.net}/27`, `${off(P3.small, 16)}/28`, `${off(P3.small, -48)}/28`];
    // ---- T4
    const V4 = d.t4.variant;
    // ---- T5
    const M5 = d.t5.missing;
    // ---- T6
    const T6 = d.t6.router, L6 = LANS[T6], n6 = net[T6], t6h = targetOf[T6];

    const list = [
      {
        id: "t1", title: `Aviso de ${L1.dept}`, keyword: "DIRECCIONAMIENTO", place: `Oficina de ${L1.dept}`,
        quote: d.t1.variant === "gw"
          ? `Me han configurado el equipo a mano (${t1h}). Veo sin problema a ${mate1}, que está al lado, pero no llego a nada de las otras oficinas.`
          : `Me han cambiado el equipo de mesa y lo han configurado a mano (${t1h}). Está en el mismo switch que ${mate1}, pero ni siquiera nos vemos entre nosotros.`,
        reporter: `Usuario de ${L1.dept}`, affected: [t1h],
        build() { const N = makeBase(d); Object.assign(N.hosts[t1h], { dhcp: false, dhcpServer: "", dns: srv }, t1cfg); return N; },
        target: t1h,
        verify: (e) => e.kind === "ping" && e.ok && e.from === t1h && remote(t1h)(e),
        fixed: (N) => health(N).ok,
        answer: { cat: "direccionamiento", device: t1h, cause: "addr-" + d.t1.variant, cmds: ["ipconfig /all", "ping"] },
        causes: [
          { id: "addr-net", t: "La IP del PC pertenece a otra red distinta de la de su oficina" },
          { id: "addr-mask", t: "El PC tiene una máscara de subred incorrecta" },
          { id: "addr-gw", t: "La puerta de enlace del PC no es la IP del router de su red" },
          { id: "ifdown", t: `La interfaz LAN de ${T1} está apagada` },
          { id: "route", t: `Falta una ruta estática en ${T1}` },
        ],
        hints: [
          `Compara ipconfig /all de ${t1h} con el de ${mate1}, que funciona bien. ¿Qué dato no encaja?`,
          d.t1.variant === "gw" ? "Si llega a los equipos de su red pero no sale de ella, revisa a quién envía los paquetes remotos: la puerta de enlace debe ser la IP del router en esa red." : "Para estar en la misma red, la operación IP AND máscara debe dar la misma dirección de red en los dos equipos.",
        ],
        lesson: "Dos equipos en el mismo switch solo se comunican si están en la <b>misma red</b>: el equipo calcula <b>IP AND máscara</b> y lo compara con el destino. Si es remoto, envía el paquete a su <b>puerta de enlace</b>, que debe ser la IP del router en esa red. Se diagnostica con <b>ipconfig /all</b> comparando con un equipo que funciona.",
        solution: `${t1h}: IP Configuration → IP ${n1}.${d.t1.host} · máscara 255.255.255.0 · gateway ${n1}.1 (o pasar a DHCP). Verificar: ping a otra oficina.`,
        fault: `${t1h} estático: IP ${t1cfg.ip} · máscara ${t1cfg.mask} · gateway ${t1cfg.gw}`,
      },
      {
        id: "t2", title: "Llamada urgente", keyword: "FÍSICO", place: `Oficina de ${LL2.dept}`,
        quote: d.t2.variant === "lan"
          ? `En ${LL2.dept} no llegamos a nada fuera de la oficina. Entre nosotros parece que sí nos vemos. Ha pasado esta mañana, nadie ha tocado los PC.`
          : `Desde ${LL2.dept} no llegamos a las otras oficinas, aunque dentro de la oficina todo funciona y el router nos responde.`,
        reporter: `Responsable de ${LL2.dept}`, affected: HOSTS[LAN2].filter((h) => h !== "SRV"),
        build() { const N = makeBase(d); N.routers[T2].ifaces[I2].shut = true; return N; },
        target: HOSTS[LAN2][0],
        verify: (e) => e.kind === "ping" && e.ok && lanOfHost(e.from) === LAN2 && !inNet(e.dst, net[LAN2]),
        fixed: (N) => health(N).ok,
        answer: { cat: "fisico", device: T2, cause: `down-${T2}-${IFS(I2)}`, cmds: ["show ip interface brief", "show running-config", "tracert"] },
        causes: [
          { id: `down-${T2}-${IFS(I2)}`, t: `La interfaz ${IFS(I2)} de ${T2} está apagada (shutdown)` },
          ...(d.t2.variant === "lan"
            ? [{ id: "down-x1", t: `La interfaz G0/1 de ${T2} está apagada (shutdown)` }, { id: "route", t: `Faltan las rutas estáticas en ${T2}` }]
            : [{ id: "down-x1", t: `La interfaz G0/0 de ${LAN2} está apagada (shutdown)` }, { id: "route", t: `Falta la ruta estática hacia la LAN de ${LL2.dept} en R2` }]),
          { id: "gw", t: `Los PC de ${LL2.dept} tienen mal la puerta de enlace` },
          { id: "dhcp", t: "El pool DHCP se ha quedado sin direcciones" },
        ],
        hints: [
          d.t2.variant === "lan" ? `Desde un PC de ${LL2.dept}: ¿responde su puerta de enlace (${net[LAN2]}.1)? Si no llega ni al gateway, mira el router.` : `Haz tracert desde un PC de ${LL2.dept} a otra oficina: ¿en qué router se corta el camino?`,
          `En los routers, show ip interface brief muestra el estado de cada interfaz. «administratively down» significa que alguien la ha apagado: se enciende con no shutdown.`,
        ],
        lesson: "Si la configuración lógica es correcta pero no hay comunicación, revisa la <b>parte física</b>: cables e interfaces. <b>show ip interface brief</b> muestra el estado de cada interfaz; <code>administratively down</code> indica un <code>shutdown</code>. Se arregla con <code>interface …</code> y <code>no shutdown</code>.",
        solution: `${T2}: enable → configure terminal → interface ${I2} → no shutdown. Verificar: ping desde ${LL2.dept} a otra oficina.`,
        fault: `${T2} ${I2}: shutdown`,
      },
      {
        id: "t3", title: "Encargo de Dirección", keyword: "SUBNETTING", place: "Aula nueva (R1 · G0/2)",
        quote: `Abrimos un aula nueva conectada a la interfaz G0/2 de R1. Hay que darle direcciones con el bloque 172.16.${d.t3.Y}.0/24, repartido con VLSM entre estas necesidades: ${d.t3.order.map((k) => `${names3[k]} (${needs3[k]} ${needs3[k] === 2 ? "direcciones" : "equipos"})`).join(", ")}. Configura el router y AULA-1, y comprueba que el aula llega a Secretaría.`,
        reporter: "Dirección", affected: ["AULA-1", "R1"],
        build() { return makeBase(d); },
        target: "AULA-1",
        verify: (e) => e.kind === "ping" && e.ok && e.from === "AULA-1" && inNet(e.dst, net.R1),
        fixed: (N) => {
          const i = N.routers.R1.ifaces["GigabitEthernet0/2"], h = N.hosts["AULA-1"];
          if (i.shut || i.ip !== X3.gw || i.mask !== X3.mask) return false;
          if (h.dhcp || h.mask !== X3.mask || h.gw !== X3.gw || !NET.sameNet(h.ip, X3.net, X3.mask) || [X3.net, X3.bcast, X3.gw].includes(h.ip)) return false;
          return health(N).ok && pingOk(N, "AULA-1", "SEC-1");
        },
        answer: { cat: "direccionamiento", device: "R1", cause: "sub-ok", cmds: ["show ip interface brief", "ipconfig /all", "ping"] },
        causeLabel: "Subred que corresponde al aula nueva",
        causes: [{ id: "sub-ok", t: sub3(X3) }, ...wrongSubs.map((s, i) => ({ id: "sub-" + i, t: s }))],
        hints: [
          "VLSM: ordena las necesidades de mayor a menor y asigna a cada una la subred más pequeña donde quepa (hosts = 2^h − 2), empezando por la dirección .0 del bloque.",
          `El aula usa la primera dirección útil de su subred como puerta de enlace (la IP de R1 en G0/2). En R1: interface g0/2 → ip address … → no shutdown. En AULA-1: IP Configuration.`,
        ],
        lesson: "Con <b>VLSM</b> cada subred recibe solo el espacio que necesita: se ordenan de mayor a menor y se asignan seguidas. El tamaño sale de <b>2^h − 2 ≥ hosts</b>. La puerta de enlace suele ser la <b>primera dirección útil</b> y debe coincidir con la IP de la interfaz del router en esa subred.",
        solution: `Plan VLSM de 172.16.${d.t3.Y}.0/24: ${["big", "mid", "small", "link"].map((k) => `${names3[k]} ${sub3(P3[k])}`).join(" · ")}. R1: interface GigabitEthernet0/2 → ip address ${X3.gw} ${X3.mask} → no shutdown. AULA-1: IP ${off(X3, 2)} · máscara ${X3.mask} · gateway ${X3.gw}. Verificar: ping a un PC de Secretaría.`,
        fault: `Aula nueva: ${sub3(X3)} (máscara ${X3.mask}, gateway ${X3.gw}, broadcast ${X3.bcast})`,
      },
      {
        id: "t4", title: "Petición del Taller", keyword: "WLAN", place: "Taller",
        quote: V4 === "wep"
          ? `Esta mañana alguien «tocó» el punto de acceso del Taller y desde entonces el portátil no se conecta. La política del centro exige WPA2 con la clave corporativa (está en la documentación de la red).`
          : `El portátil del Taller no tiene red desde que lo formatearon. Ve redes WiFi, pero no consigue conectarse a la nuestra.`,
        reporter: "Profesor del Taller", affected: ["PORTATIL", "AP-TALLER"],
        build() {
          const N = makeBase(d);
          if (V4 === "ssid") N.wlan.client = { ssid: "CITED_INVITADOS", key: "" };
          if (V4 === "key") N.wlan.client = { ssid: d.ssid, key: d.t4.badKey };
          if (V4 === "wep") Object.assign(N.wlan.ap, { sec: "WEP", key: d.t4.wep });
          wlanSync(N, true);
          return N;
        },
        target: "PORTATIL",
        verify: (e) => e.kind === "ping" && e.ok && e.from === "PORTATIL" && !inNet(e.dst, net.R2),
        fixed: (N) => /WPA[23]/.test(N.wlan.ap.sec) && N.wlan.ap.key.length >= 8 && wlanStatus(N).ok && wlanStatus(N).net.own && health(N).ok,
        answer: { cat: "wlan", device: V4 === "wep" ? "AP-TALLER" : "PORTATIL", cause: "w-" + V4, cmds: ["PC Wireless (redes WiFi)", "Panel del punto de acceso", "ipconfig /all"] },
        causes: [
          { id: "w-ssid", t: "El portátil está conectado a otra red (SSID incorrecto)" },
          { id: "w-key", t: "La clave WiFi guardada en el portátil no es la correcta" },
          { id: "w-wep", t: "El punto de acceso usa WEP, un cifrado obsoleto, en vez de WPA2 con la clave del centro" },
          { id: "w-chan", t: "Interferencias: el punto de acceso comparte canal con una red vecina" },
          { id: "w-band", t: "El portátil está fuera de la cobertura del punto de acceso" },
        ],
        hints: [
          "Abre el portátil → pestaña PC Wireless: ¿a qué red intenta conectarse y qué mensaje da? Compáralo con la configuración del punto de acceso (haz clic en AP-TALLER).",
          V4 === "wep" ? "WEP se rompe en minutos y no está permitido. Cambia la seguridad del AP a WPA2-Personal con la clave de la documentación y vuelve a conectar el portátil." : "Detectar una red no es estar autorizado: para entrar hay que elegir el SSID correcto y escribir su clave exacta (distingue mayúsculas).",
        ],
        lesson: "Para usar una WLAN el equipo debe <b>detectar</b> el SSID, <b>asociarse</b> al AP, <b>autenticarse</b> con la clave y obtener una <b>configuración IP</b>. Estar asociado no es tener conectividad. Una IP <code>169.254.x.x</code> en un portátil WiFi suele indicar que no ha llegado a la red correcta. <b>WEP</b> está obsoleto: se usa <b>WPA2/WPA3</b>.",
        solution: V4 === "wep"
          ? `AP-TALLER: seguridad WPA2-Personal con la clave ${d.key}. PORTATIL → PC Wireless → conectar a ${d.ssid} con esa clave. Verificar: ping a otra oficina.`
          : `PORTATIL → PC Wireless → conectar a ${d.ssid} con la clave ${d.key}. Verificar: ping a otra oficina.`,
        fault: V4 === "ssid" ? "Portátil conectado a CITED_INVITADOS (red abierta sin servicio)" : V4 === "key" ? `Clave guardada en el portátil: ${d.t4.badKey} (la buena es ${d.key})` : `AP-TALLER con seguridad WEP (clave ${d.t4.wep})`,
      },
      {
        id: "t5", title: "Llamada de coordinación", keyword: "RUTAS", place: "Coordinación",
        quote: "Secretaría y Dirección no se comunican entre sí. Lo curioso es que las dos llegan sin problemas al Taller. Nadie ha tocado los PC.",
        reporter: "Coordinación", affected: ["SEC-1", "DIR-1"],
        build() {
          const N = makeBase(d);
          const gone = M5 === "R1" ? `${net.R3}.0` : `${net.R1}.0`;
          N.routers[M5].statics = N.routers[M5].statics.filter((s) => s.net !== gone);
          return N;
        },
        target: "SEC-1",
        verify: (e) => e.kind === "ping" && e.ok && ((lanOfHost(e.from) === "R1" && inNet(e.dst, net.R3)) || (lanOfHost(e.from) === "R3" && inNet(e.dst, net.R1))),
        fixed: (N) => health(N).ok,
        answer: { cat: "red", device: M5, cause: "miss-" + M5, cmds: ["show ip route", "tracert", "show running-config"] },
        causes: [
          { id: "miss-R1", t: `A R1 le falta la ruta hacia la LAN de Dirección (${net.R3}.0)` },
          { id: "miss-R3", t: `A R3 le falta la ruta de vuelta hacia la LAN de Secretaría (${net.R1}.0)` },
          { id: "miss-R2", t: "A R2 le falta la ruta hacia una de las dos LAN" },
          { id: "down", t: "La interfaz G0/1 de R2 está apagada" },
          { id: "gw", t: "Los PC de Dirección tienen mal la puerta de enlace" },
        ],
        hints: [
          "Haz tracert desde un PC de Secretaría a uno de Dirección: ¿hasta qué router llega? Recuerda que la respuesta también necesita un camino de vuelta.",
          "Compara show ip route en R1 y R3. Cada router necesita una ruta (S) hacia cada red que no tiene conectada (C). Se añade con ip route RED MÁSCARA SIGUIENTE_SALTO.",
        ],
        lesson: "Un router solo conoce sus redes <b>conectadas</b> (C); el resto hay que enseñárselas con <b>rutas estáticas</b> (S): <code>ip route RED MÁSCARA SIGUIENTE_SALTO</code>. Una comunicación necesita ruta de <b>ida y de vuelta</b>: si falta en cualquiera de los dos extremos, el ping falla en ambos sentidos.",
        solution: M5 === "R1" ? `R1: configure terminal → ip route ${net.R3}.0 255.255.255.0 10.0.1.2. Verificar: ping de SEC-1 a DIR-1.` : `R3: configure terminal → ip route ${net.R1}.0 255.255.255.0 10.0.2.1. Verificar: ping de SEC-1 a DIR-1.`,
        fault: M5 === "R1" ? `R1 sin la ruta ${net.R3}.0/24` : `R3 sin la ruta ${net.R1}.0/24`,
      },
      {
        id: "t6", title: `Incidencia en ${L6.dept}`, keyword: "DHCP", place: `Oficina de ${L6.dept}`,
        quote: d.t6.variant === "gw"
          ? `Hemos reinstalado ${t6h}. Recibe IP automáticamente sin problema, pero no sale de la oficina.`
          : `Hemos reinstalado ${t6h} y no consigue configuración de red. Los demás equipos que llevan tiempo encendidos funcionan.`,
        reporter: `Responsable de ${L6.dept}`, affected: [t6h],
        build() {
          const N = makeBase(d), R = N.routers[T6];
          if (d.t6.variant === "gw") R.dhcp.pools[0].router = d.t6.wrongGw;
          else if (d.t6.variant === "excl") R.dhcp.excluded = [[`${n6}.1`, `${n6}.254`]];
          else R.dhcp.pools[0].network = d.t6.wrongNet;
          const h = N.hosts[t6h];
          R.leases = R.leases.filter((l) => l.mac !== h.mac);
          Object.assign(h, { ip: "", mask: "", gw: "", dns: "" });
          NET.dhcpRequest(N, t6h);
          return N;
        },
        target: t6h,
        verify: (e) => e.kind === "ping" && e.ok && e.from === t6h && !inNet(e.dst, n6),
        fixed: (N) => health(N).ok && freshClientOk(N, T6, d) && N.hosts[t6h].dhcp,
        answer: { cat: ["red", "servicios"], device: T6, cause: "pool-" + d.t6.variant, cmds: ["ipconfig /all", "show running-config", "show ip dhcp binding"] },
        causes: [
          { id: "pool-gw", t: "El pool DHCP entrega una puerta de enlace incorrecta" },
          { id: "pool-excl", t: "Las direcciones excluidas ocupan todo el rango de la red" },
          { id: "pool-net", t: "El pool DHCP está configurado con una red que no es la de la oficina" },
          { id: "ifdown", t: `La interfaz LAN de ${T6} está apagada` },
          { id: "mask", t: "El PC tiene la máscara mal escrita a mano" },
        ],
        hints: [
          d.t6.variant === "gw" ? `ipconfig /all en ${t6h}: ¿qué puerta de enlace ha recibido? ¿Es la IP del router en esa red?` : `ipconfig /all en ${t6h}: una IP 169.254.x.x significa que el PC no ha recibido respuesta del servidor DHCP.`,
          `En ${T6}: show running-config muestra el pool (network, default-router, dns-server) y las direcciones excluidas. Tras corregir, en el PC: ipconfig /renew.`,
        ],
        lesson: "El servidor DHCP entrega <b>IP, máscara, puerta de enlace y DNS</b> desde un <b>pool</b>. Recibir IP no garantiza que funcione: si el pool tiene un dato mal, todos los equipos nuevos lo heredan. Una IP <code>169.254.x.x</code> (APIPA) indica que no hubo concesión. Se diagnostica con <b>ipconfig /all</b> y <b>show running-config</b>.",
        solution: d.t6.variant === "gw" ? `${T6}: configure terminal → ip dhcp pool ${L6.pool} → default-router ${n6}.1. En ${t6h}: ipconfig /renew.`
          : d.t6.variant === "excl" ? `${T6}: configure terminal → no ip dhcp excluded-address ${n6}.1 ${n6}.254 → ip dhcp excluded-address ${n6}.1 ${n6}.${d.excl[T6]}. En ${t6h}: ipconfig /renew.`
          : `${T6}: configure terminal → ip dhcp pool ${L6.pool} → network ${n6}.0 255.255.255.0. En ${t6h}: ipconfig /renew.`,
        fault: d.t6.variant === "gw" ? `Pool ${L6.pool}: default-router ${d.t6.wrongGw}` : d.t6.variant === "excl" ? `${T6}: ip dhcp excluded-address ${n6}.1 ${n6}.254` : `Pool ${L6.pool}: network ${d.t6.wrongNet}`,
      },
    ];
    // Tercera pista: casi la solución (cuesta lo mismo que las otras)
    const via5 = M5 === "R1" ? `ip route ${net.R3}.0 255.255.255.0 10.0.1.2` : `ip route ${net.R1}.0 255.255.255.0 10.0.2.1`;
    const last = {
      t1: d.t1.variant === "net" ? `La IP de ${t1h} tiene que estar en la red ${n1}.0/24. Corrígela en IP Configuration (o pon DHCP).` : d.t1.variant === "mask" ? `La máscara de la oficina es 255.255.255.0 (/24). Corrígela en IP Configuration de ${t1h} (o pon DHCP).` : `La puerta de enlace de ${L1.dept} es ${n1}.1. Corrígela en IP Configuration de ${t1h} (o pon DHCP).`,
      t2: `En ${T2}: enable → configure terminal → interface ${I2} → no shutdown. Después repite el ping.`,
      t3: `El aula va en la subred ${sub3(X3)} (máscara ${X3.mask}). R1 G0/2 lleva ${X3.gw} y AULA-1 una IP entre ${off(X3, 2)} y ${X3.last} con gateway ${X3.gw}.`,
      t4: V4 === "ssid" ? `En PC Wireless conecta el portátil a ${d.ssid} con la clave de la documentación (botón 🗺️).` : V4 === "key" ? `Vuelve a conectar el portátil a ${d.ssid} escribiendo la clave que aparece en el AP (Config · Wireless) o en la documentación.` : `En AP-TALLER pon Seguridad WPA2-Personal con la clave de la documentación y guarda: el portátil se reconectará solo.`,
      t5: `En ${M5}: enable → configure terminal → ${via5}`,
      t6: d.t6.variant === "gw" ? `En ${T6}: ip dhcp pool ${L6.pool} → default-router ${n6}.1. Luego ipconfig /renew en ${t6h}.` : d.t6.variant === "excl" ? `En ${T6} las exclusiones van de ${n6}.1 a ${n6}.254: quítalas con no ip dhcp excluded-address y excluye solo de ${n6}.1 a ${n6}.${d.excl[T6]}. Luego ipconfig /renew.` : `En ${T6}: ip dhcp pool ${L6.pool} → network ${n6}.0 255.255.255.0. Luego ipconfig /renew en ${t6h}.`,
    };
    // Evidencias admitidas: cualquier comando razonable para ese fallo
    const moreCmds = { t2: ["ping"], t3: ["show running-config"], t5: ["ping"] };
    // Qué ping concreto da por verificada la incidencia (se muestra al alumno cuando ya parece arreglada)
    const howVerify = {
      t1: `haz ping desde ${t1h} a un equipo de otra oficina`,
      t2: `haz ping desde un equipo de ${LL2.dept} a otra oficina`,
      t3: "haz ping desde AULA-1 a un equipo de Secretaría",
      t4: "haz ping desde PORTATIL a un equipo de otra oficina",
      t5: "haz ping entre un equipo de Secretaría y uno de Dirección",
      t6: `haz ping desde ${t6h} a un equipo de otra oficina`,
    };
    for (const t of list) { t.hints.push(last[t.id]); if (moreCmds[t.id]) t.answer.cmds.push(...moreCmds[t.id]); t.howVerify = howVerify[t.id]; }
    return list;
  }

  /* ---------- Código de verificación y partidas guardadas ---------- */
  function b64u(str) { let bin = ""; enc.encode(str).forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function unb64u(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); }
  async function makeFinishCode(res) {
    const team = String(res.team || "").replace(/[|]/g, "/").slice(0, 60);
    const payload = [res.group, team, res.elapsed, res.score, res.hints, res.errors, res.end, res.tickets, res.partial ? "P" : "F", res.grade == null ? "" : res.grade].join("|");
    return `OR.${b64u(payload)}.${(await sha256(CONFIG.SECRET + "#FIN#" + payload)).slice(0, 8).toUpperCase()}`;
  }
  async function parseFinishCode(code) {
    try {
      const [p, body, chk] = code.trim().split(".");
      if (p !== "OR" || !body || !chk) return null;
      const payload = unb64u(body);
      const ok = (await sha256(CONFIG.SECRET + "#FIN#" + payload)).slice(0, 8).toUpperCase() === chk.toUpperCase();
      const [group, team, elapsed, score, hints, errors, end, tickets, kind, grade] = payload.split("|");
      return { valid: ok, group, team, elapsed: +elapsed, score: +score, hints: +hints, errors: +errors, end: +end, tickets: +tickets, partial: kind === "P", grade: grade ? +grade : null };
    } catch (e) { return null; }
  }
  /* ---------- Tiempo, puntos y nota ---------- */
  function activeMin(S) { return S.activeMs != null ? S.activeMs / 60000 : Math.max(0, ((S.endTime || Date.now()) - S.startTime) / 60000); }
  function speedFactor(S) {
    if (!S.finished || (S.completed || []).length < NT) return 0;
    const { FAST_MIN, SLOW_MIN } = CONFIG.SPEED, m = activeMin(S);
    return Math.max(0, Math.min(1, (SLOW_MIN - m) / (SLOW_MIN - FAST_MIN)));
  }
  function score(S) {
    const P = CONFIG.POINTS;
    let pts = 0;
    for (let k = 1; k <= NT; k++) {
      const id = "t" + k;
      if (!((S.parts || {})[id] || {}).report) continue;
      pts += P.TICKET + (((S.errorsByRoom || {})[id] || 0) === 0 ? P.CLEAN : 0);
    }
    pts -= P.WRONG * (S.totalErrors || 0) + P.HINT * (S.hintsUsed || 0);
    pts += Math.round(P.SPEED * speedFactor(S));
    return pts;
  }
  function grade(S, TK) {
    const G = CONFIG.GRADE;
    const per = TK.map((t) => {
      const P = (S.parts || {})[t.id] || {};
      const hints = (S.hintsByRoom || {})[t.id] || 0, wrong = (S.errorsByRoom || {})[t.id] || 0;
      let pts = 0, estado = "Sin resolver";
      if (P.report) { pts = Math.max(G.MIN_CLOSED, G.TICKET - G.HINT * hints - G.WRONG * wrong); estado = "Cerrado"; }
      else if (P.verified) { pts = G.VERIFIED_ONLY; estado = "Corregido, sin parte"; }
      return { id: t.id, title: t.title, estado, hints, wrong, pts: Math.round(pts * 100) / 100 };
    });
    const sp = Math.round(G.SPEED * speedFactor(S) * 100) / 100;
    const total = Math.round((per.reduce((a, x) => a + x.pts, 0) + sp) * 100) / 100;
    return { total: Math.min(10, total), per, speed: { pts: sp, minutes: Math.round(activeMin(S)), applies: !!S.finished && (S.completed || []).length >= NT } };
  }
  const fmtGrade = (n) => String(Math.round(n * 100) / 100).replace(".", ",");

  /* ---------- Ranking automático (Apps Script) ---------- */
  async function rankPayload(S) {
    const d = { code: S.groupCode, name: String(S.team || "").slice(0, 60), score: S.score, tickets: S.completed.length, hints: S.hintsUsed, errors: S.totalErrors, finished: !!S.finished, start: S.startTime };
    const payload = [d.code, d.name, d.score, d.tickets, d.hints, d.errors, d.finished ? 1 : 0, d.start].join("|");
    d.chk = (await sha256(CONFIG.SECRET + "#RANK#" + payload)).slice(0, 16);
    return d;
  }
  async function sendRank(S) {
    if (!CONFIG.RANKING_URL) return "off";
    const body = JSON.stringify(await rankPayload(S));
    try { await fetch(CONFIG.RANKING_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body }); return "ok"; } catch (e) { return "error"; }
  }
  async function readRank(pin) { const r = await fetch(CONFIG.RANKING_URL + "?pin=" + encodeURIComponent(pin) + "&t=" + Date.now()); return r.json(); }

  async function makeSave(state) { return JSON.stringify({ app: "reconexion", state, chk: await sha256(CONFIG.SECRET + "#SAVE#" + JSON.stringify(state)) }); }
  async function readSave(text) {
    try { const o = JSON.parse(text); if (o.app !== "reconexion" || !o.state) return null; if ((await sha256(CONFIG.SECRET + "#SAVE#" + JSON.stringify(o.state))) !== o.chk) return { tampered: true }; return { state: o.state }; } catch (e) { return null; }
  }
  const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

  g.CN = { CONFIG, NT, LANS, ROUTERS, HOSTS, DEVICES, DNS_NAME, CATS, CMDS, rng, sha256, generateGroupCode, deriveGroup, tickets, baseline, makeBase, lanOfHost, hostsOf, health, wlanNets, wlanStatus, wlanSync, subnet, makeFinishCode, parseFinishCode, makeSave, readSave, fmtTime, sendRank, readRank, rankPayload, grade, fmtGrade, score, activeMin, speedFactor };
})(typeof window !== "undefined" ? window : globalThis);
