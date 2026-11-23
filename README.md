# Operación Reconexión — Escape room de redes locales (1º SMR · Redes locales · UD3)

Es una web estática (HTML, CSS y JS) para GitHub Pages. Incluye un **simulador de la red de las prácticas** que imita Packet Tracer:

- R1 – R2 – R3 en cadena (10.0.1.0/24 y 10.0.2.0/24).
- Una LAN por router: Secretaría, Taller y Dirección.
- Rutas estáticas y DHCP en cada router.
- Un punto de acceso WiFi en el Taller con un portátil.
- Un aula nueva pendiente de configurar en la G0/2 de R1.

Cada alumno recibe redes, claves y fallos distintos.

## Los 6 tickets (títulos neutros, sin pistas)
| # | Ticket | Qué tiene que hacer el alumno (varía por alumno) | Tema UD3 |
|---|--------|---------------------------------------------------|----------|
| 1 | Aviso de … | PC estático con IP de otra red, máscara /25 o puerta de enlace errónea | IP, máscara, AND, gateway |
| 2 | Llamada urgente | `shutdown` en la LAN de un router o en un enlace entre routers | Conexión física |
| 3 | Encargo de Dirección | Calcular con VLSM la subred del aula nueva y configurar R1 G0/2 y AULA-1 | Subnetting / VLSM |
| 4 | Petición del Taller | Portátil en el SSID equivocado, con la clave mal o con el AP en WEP | WLAN (SSID, autenticación, WPA2) |
| 5 | Llamada de coordinación | Falta una ruta estática de ida (R1) o de vuelta (R3) | Enrutamiento estático |
| 6 | Incidencia en … | Pool DHCP con gateway erróneo, exclusiones que tapan todo el rango o red mal escrita | DHCP |

Cada ticket sigue las fases **Observar → Comprobar → Localizar → Corregir → Verificar → Documentar**. La corrección se comprueba sobre el estado real de la red simulada y se verifica con un `ping`. Después el alumno rellena el **parte de incidencia**: tipo de fallo, dispositivo, causa (en el ticket 3, la subred elegida), comando de evidencia y justificación.

## Archivos
```
index.html      Juego del alumnado
profesor.html   Ranking a partir de los PDF, Comprobar PDF y Solucionario por alumno (PIN 1SMR)
js/net.js       Simulador: rutas C/L/S, DHCP, decisión local/remoto, ping, tracert, CLI IOS
js/core.js      Red base, WiFi, 6 tickets con variantes, CONFIG (secreto, PIN, puntos, nota)
js/app.js       Interfaz: mapa, consola flotante, PC Wireless, panel del AP, partes e informe PDF
```

## Nota sobre 10, puntos y rapidez
- La nota aparece **solo en el PDF**. Cada ticket cerrado vale 1,4. Se resta 0,2 por pista y 0,2 por parte erróneo, con un mínimo de 0,7 por ticket cerrado. Un ticket corregido y verificado pero sin parte vale 0,7.
- La **rapidez** suma hasta 1,6 si se terminan los 6 tickets: 50 minutos de trabajo activo o menos dan el máximo y 120 o más dan 0. Solo cuenta el tiempo con la actividad abierta y en uso.
- Los alumnos ven solo los **puntos**, que se ganan: +200 por ticket, +50 si se cierra sin errores, −25 por parte erróneo, −50 por pista y hasta +250 por rapidez.
- El botón 📄 descarga el informe en cualquier momento. Antes de terminar sale como **PARCIAL**.
- El código de verificación del pie del PDF empieza por `OR.` y se comprueba en el panel del profesor.

## Ranking de la clase (sin hojas de cálculo)
No se envía nada a ningún servidor: todo ocurre en el navegador del alumno. El alumno descarga su PDF y lo sube al campus. En `profesor.html` → **Ranking**, pegas los códigos `OR.` de los PDF y el panel monta la clasificación con la nota, los puntos, los tickets, el tiempo y la autenticidad de cada informe. De cada alumno cuenta su mejor informe. Los códigos se guardan en el navegador del profesor y se pueden exportar a CSV.
