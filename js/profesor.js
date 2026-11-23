/* Panel del profesor · Operación Reconexión (1º SMR) */
(function () {
  "use strict";
  const C = CN.CONFIG;
  const root = document.getElementById("t");
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (t) => (t ? new Date(t).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-");
  let PIN = sessionStorage.getItem("cr-pin") || "";
  let timer = null;

  function gate() {
    if (PIN) return main();
    root.innerHTML = `<div class="card gate"><span class="eyebrow">PANEL DEL PROFESOR</span><h2>Operación Reconexión</h2>
      <form id="g"><label><span>PIN ${C.RANKING_URL ? "del ranking (el de tu Apps Script)" : ""}</span><input id="pin" type="password" autocomplete="off"></label><br><button class="btn" type="submit">Entrar</button><p class="small muted" id="gmsg"></p></form></div>`;
    $("#g").onsubmit = async (e) => {
      e.preventDefault();
      const p = $("#pin").value;
      if (C.RANKING_URL) {
        $("#gmsg").textContent = "Comprobando…";
        try { const r = await CN.readRank(p); if (r.error) throw 0; } catch (err) { $("#gmsg").textContent = "PIN incorrecto o ranking no accesible."; return; }
      } else if (p !== C.TEACHER_PIN) { $("#pin").classList.add("shake"); return; }
      PIN = p; sessionStorage.setItem("cr-pin", p); main();
    };
  }
  function main() {
    root.innerHTML = `<span class="eyebrow">PANEL DEL PROFESOR · 1º SMR · UD3</span><h1>OPERACIÓN <span class="hl">RECONEXIÓN</span></h1>
      <div class="tabs" role="tablist">
        <button class="btn" role="tab" data-tab="rank" aria-selected="true">🏆 Ranking en directo</button>
        <button class="btn" role="tab" data-tab="check" aria-selected="false">✅ Comprobar PDF</button>
        <button class="btn" role="tab" data-tab="sol" aria-selected="false">🔎 Solucionario</button>
        <button class="btn" role="tab" data-tab="setup" aria-selected="false">⚙️ Configurar ranking</button>
      </div><section class="card panel" id="view"></section>`;
    root.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => {
      root.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      clearInterval(timer);
      ({ rank, check, sol, setup })[b.dataset.tab]();
    }));
    C.RANKING_URL ? rank() : setup();
  }

  /* ---------- Ranking en directo ---------- */
  const norm = (n) => String(n || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
  function best(rows) {
    const by = {};
    for (const r of rows) {
      const k = norm(r.name); if (!k) continue;
      (by[k] = by[k] || []).push(r);
    }
    return Object.values(by).map((list) => {
      list.sort((a, b) => (b.finished - a.finished) || (b.tickets - a.tickets) || (b.score - a.score));
      return { ...list[0], attempts: list.length };
    }).sort((a, b) => (b.tickets - a.tickets) || (b.score - a.score) || (a.updated - b.updated));
  }
  async function rank() {
    const v = $("#view");
    if (!C.RANKING_URL) { v.innerHTML = `<p>El ranking automático aún no está configurado. Ve a <b>⚙️ Configurar ranking</b>.</p>`; return; }
    v.innerHTML = `<div class="rank-top"><h2>Ranking en directo</h2><div class="toolbar"><span class="small muted" id="upd">Cargando…</span><button class="btn ghost" id="fs" type="button">⛶ Pantalla completa</button><button class="btn ghost" id="csv" type="button">⬇️ CSV</button></div></div><div id="rk"></div>`;
    $("#fs").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen && v.requestFullscreen());
    let last = [];
    $("#csv").onclick = () => {
      const lines = [["Alumno/a", "Puntos", "Tickets", "Pistas", "Partes erróneos", "Terminado", "Intentos", "Código", "Última actualización", "Firma válida"].join(";")]
        .concat(last.map((r) => [r.name, r.score, r.tickets, r.hints, r.errors, r.finished ? "Sí" : "No", r.attempts, r.code, fmt(r.updated), r.verified ? "Sí" : "NO"].join(";")));
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" })); a.download = "ranking_codigo_rojo.csv"; a.click();
    };
    const load = async () => {
      try {
        const r = await CN.readRank(PIN);
        if (r.error) { $("#upd").textContent = "PIN no válido"; return; }
        last = best(r.rows || []);
        draw(last);
        $("#upd").textContent = `Actualizado ${new Date().toLocaleTimeString("es-ES")} · se refresca cada 15 s`;
      } catch (e) { $("#upd").textContent = "No se pudo leer el ranking (reintentando…)"; }
    };
    await load();
    timer = setInterval(load, 15000);
  }
  function draw(rows) {
    const fin = rows.filter((r) => r.finished).sort((a, b) => b.score - a.score);
    const pod = [fin[1], fin[0], fin[2]];
    $("#rk").innerHTML = `
      ${fin.length ? `<h3>Podio (terminados)</h3><div class="podium">${pod.map((x, i) => (x ? `<div class="pod p${[2, 1, 3][i]}"><div class="bar">${[2, 1, 3][i]}</div><b>${esc(x.name)}</b><span>${x.score} pts</span></div>` : "<div></div>")).join("")}</div>` : ""}
      <p class="small muted">${rows.length} alumno(s) · ${fin.length} han terminado. Se muestra el mejor intento de cada alumno.</p>
      <table><thead><tr><th>#</th><th>Alumno/a</th><th>Progreso</th><th>Puntos</th><th>Pistas</th><th>Partes erróneos</th><th>Estado</th><th>Últ. actividad</th><th></th></tr></thead><tbody>
      ${rows.map((x, i) => `<tr class="${x.verified ? "" : "invalid"}"><td>${i + 1}</td><td><b>${esc(x.name)}</b>${x.attempts > 1 ? `<br><span class="small muted">${x.attempts} intentos</span>` : ""}</td>
        <td><div class="tk-bar">${Array.from({ length: CN.NT }, (_, k) => k).map((k) => `<i class="${k < x.tickets ? "on" : ""}"></i>`).join("")}</div><span class="small">${x.tickets}/${CN.NT}</span></td>
        <td><b>${x.score}</b></td><td>${x.hints}</td><td>${x.errors}</td><td>${x.finished ? "✅ Terminado" : "⏳ En curso"}</td><td class="mono">${fmt(x.updated)}</td><td>${x.verified ? "" : "⚠ firma no válida"}</td></tr>`).join("") || `<tr><td colspan="9">Todavía no hay alumnos conectados.</td></tr>`}
      </tbody></table>`;
  }

  /* ---------- Comprobar el código de un PDF ---------- */
  function check() {
    const v = $("#view");
    v.innerHTML = `<h2>Comprobar un informe PDF</h2><p class="muted small">Copia el <b>código de verificación</b> que aparece al pie del PDF (empieza por <code>OR.</code>) y pégalo aquí. Puedes pegar varios, uno por línea. Verás si es un informe <b>final</b> o <b>parcial</b> y la <b>nota</b> que le corresponde; si alguien ha editado el PDF, el código no coincidirá.</p>
      <textarea id="codes" placeholder="OR.xxxxx.XXXXXXXX"></textarea><div class="toolbar"><button class="btn" id="go">Comprobar</button></div><div id="res"></div>`;
    $("#go").onclick = async () => {
      const lines = $("#codes").value.split(/\s+/).filter(Boolean);
      const out = [];
      for (const l of lines) { const r = await CN.parseFinishCode(l); out.push(r ? { ...r, raw: l } : { valid: false, raw: l, bad: true }); }
      $("#res").innerHTML = `<table><thead><tr><th>Alumno/a</th><th>Informe</th><th>Nota</th><th>Puntos</th><th>Pistas</th><th>Partes erróneos</th><th>Fecha</th><th>Resultado</th></tr></thead><tbody>${out.map((x) => x.bad ? `<tr class="invalid"><td colspan="7" class="mono">${esc(x.raw.slice(0, 40))}</td><td>No es un código válido</td></tr>` : `<tr class="${x.valid ? "" : "invalid"}"><td>${esc(x.team)}<br><span class="small muted mono">${esc(x.group)}</span></td><td>${x.partial ? `⏳ Parcial (${x.tickets}/${CN.NT})` : "✅ Final"}</td><td><b>${x.grade == null ? "-" : CN.fmtGrade(x.grade) + " / 10"}</b></td><td>${x.score}</td><td>${x.hints}</td><td>${x.errors}</td><td class="mono">${fmt(x.end)}</td><td>${x.valid ? "✅ Auténtico" : "❌ Manipulado"}</td></tr>`).join("")}</tbody></table>`;
    };
  }

  /* ---------- Solucionario ---------- */
  const faultText = (t) => t.fault;
  function sol() {
    const v = $("#view");
    v.innerHTML = `<h2>Solucionario por alumno</h2><p class="muted small">Escribe el código de 4 caracteres que aparece arriba en la pantalla del alumno (también está en el ranking y en su PDF).</p>
      <form id="f" class="answer"><label><span>Código</span><input id="gc" class="mono" maxlength="4" placeholder="XXXX"></label><button class="btn" type="submit">Ver soluciones</button></form><div id="out" style="margin-top:18px"></div>`;
    $("#f").onsubmit = (e) => {
      e.preventDefault();
      const code = $("#gc").value.trim().toUpperCase(); if (code.length !== 4) return;
      const d = CN.deriveGroup(code), tk = CN.tickets(d);
      $("#out").innerHTML = `<div class="sol">${tk.map((t, i) => `<div><b>TICKET ${i + 1} · ${esc(t.title)}</b>
        <p><i>Síntoma:</i> “${esc(t.quote)}”</p>
        <p><i>Fallo introducido:</i> <code>${esc(faultText(t, d))}</code></p>
        <p><i>Parte correcto:</i> ${[].concat(t.answer.cat).map((c) => CN.CATS[c]).join(" o ")} · dispositivo <b>${t.answer.device}</b> · ${esc(t.causes.find((c) => c.id === t.answer.cause).t)} · evidencia: ${t.answer.cmds.join(" / ")}</p>
        <p><i>Solución:</i> <code>${esc(t.solution)}</code></p></div>`).join("")}</div>`;
    };
  }

  /* ---------- Instrucciones de configuración ---------- */
  function setup() {
    $("#view").innerHTML = `<h2>Configurar el ranking automático (una sola vez, 5 minutos)</h2>
      <p>Estado: ${C.RANKING_URL ? `<b>✅ configurado</b> · <code class="small">${esc(C.RANKING_URL.slice(0, 60))}…</code>` : "<b>❌ sin configurar</b> (el juego funciona, pero no envía resultados)"}</p>
      <ol class="setup-steps">
        <li>Crea una <b>Hoja de cálculo de Google</b> nueva con tu cuenta (por ejemplo «Ranking Operación Reconexión»).</li>
        <li>En la hoja: <b>Extensiones → Apps Script</b>. Borra lo que haya y pega el contenido de <a href="apps-script/Codigo.gs" target="_blank" rel="noopener">apps-script/Codigo.gs</a>.</li>
        <li>Cambia la línea <code>const PIN = "CAMBIA-ESTE-PIN";</code> por un PIN tuyo. Guarda (💾).</li>
        <li><b>Implementar → Nueva implementación →</b> tipo <b>Aplicación web</b>. Ejecutar como: <b>Yo</b>. Quién tiene acceso: <b>Cualquier usuario</b>. Pulsa Implementar y autoriza los permisos.</li>
        <li>Copia la <b>URL de la aplicación web</b> (termina en <code>/exec</code>) y pásamela: la pongo en <code>js/core.js</code> (<code>RANKING_URL</code>) y lo vuelvo a publicar.</li>
      </ol>
      <p class="small muted">Los resultados quedan en tu hoja de Google (pestaña «Resultados»): nombre, puntos, tickets, pistas y errores. Solo quien tenga tu PIN puede leerlos desde este panel.</p>`;
  }
  gate();
})();
