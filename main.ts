// Solis Relay Server for Deno Deploy
// ESP32 sends data via HTTP POST /esp (every 10 sec)
// Browsers connect via WebSocket /ws for real-time updates

let latestData: any = null;
let espConnected = false;
let lastEspTime = 0;
const browsers = new Set<WebSocket>();

function checkEspTimeout() {
    if (espConnected && Date.now() - lastEspTime > 30000) {
        espConnected = false;
        latestData = null;
        const msg = JSON.stringify({ esp_connected: false, online: false });
        for (const browser of browsers) {
            if (browser.readyState === WebSocket.OPEN) browser.send(msg);
        }
        console.log("ESP32 timeout - marked offline");
    }
}

const history: number[][] = [];
const MAX_HISTORY = 1440;
let historyMinute = 0;
let lastHistoryTime = 0;

function addToHistory(d: any) {
    const now = Date.now();
    if (now - lastHistoryTime < 58000) return;
    lastHistoryTime = now;
    const point = [
        historyMinute++,
        (d.pv1_w || 0) + (d.pv2_w || 0),
        d.bat_w || 0,
        d.bat_soc || 0,
        d.grid_w || 0,
        d.load_w || 0,
    ];
    history.push(point);
    if (history.length > MAX_HISTORY) history.shift();
}

let lastDay = new Date().getDate();
function checkDayReset() {
    const today = new Date().getDate();
    if (today !== lastDay) {
        history.length = 0;
        historyMinute = 0;
        lastDay = today;
        console.log("History reset for new day");
    }
}

function broadcast(data: string) {
    for (const browser of browsers) {
        if (browser.readyState === WebSocket.OPEN) browser.send(data);
    }
}

// --- Static files inlined ---
const CSS = `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; min-height: 100vh; padding: 12px; }
header { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
header h1 { font-size: 1.2em; color: #fff; }
.header-right { display: flex; align-items: center; gap: 8px; }
.status { padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600; }
.status.online { background: #00c853; color: #000; }
.status.offline { background: #ff5252; color: #fff; }
.time-bar { display: flex; justify-content: space-between; padding: 0 16px 8px; font-size: 0.85em; opacity: 0.6; }
.last-update { text-align: right; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.card { background: #16213e; border-radius: 12px; padding: 16px; border-left: 4px solid #555; }
.card h2 { font-size: 1em; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8; }
.card.solar { border-left-color: #ffc107; } .card.solar h2 { color: #ffc107; }
.card.battery { border-left-color: #2196f3; } .card.battery h2 { color: #2196f3; }
.card.grid-card { border-left-color: #f44336; } .card.grid-card h2 { color: #f44336; }
.card.load { border-left-color: #4caf50; } .card.load h2 { color: #4caf50; }
.total-power { text-align: center; margin: 8px 0; }
.big-value { font-size: 2.2em; font-weight: 700; color: #fff; }
.unit { font-size: 1em; opacity: 0.6; margin-left: 4px; }
.row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.9em; border-bottom: 1px solid rgba(255,255,255,0.05); }
.label { opacity: 0.6; }
.pv-strings { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 8px 0; }
.pv-string { background: rgba(255,255,255,0.03); border-radius: 8px; padding: 8px; }
.pv-string h3 { font-size: 0.85em; opacity: 0.7; margin-bottom: 4px; }
.soc-container { display: flex; align-items: center; gap: 12px; margin: 8px 0; }
.soc-bar { flex: 1; height: 20px; background: #0a0a1a; border-radius: 10px; overflow: hidden; }
.soc-fill { height: 100%; background: linear-gradient(90deg, #f44336, #ffc107, #4caf50); border-radius: 10px; transition: width 0.5s ease; }
.bat-status, .grid-dir { text-align: center; font-size: 0.9em; font-weight: 600; margin: 4px 0 8px; }
.charging { color: #4caf50; } .discharging { color: #ff9800; }
.importing { color: #f44336; } .exporting { color: #4caf50; }
.btn-view { padding: 4px 14px; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; background: transparent; color: #e0e0e0; font-size: 0.85em; font-weight: 600; cursor: pointer; }
.btn-view:hover { background: rgba(255,255,255,0.1); }
.chart-view { background: #16213e; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
.chart-container { width: 100%; height: 350px; position: relative; }
.chart-container canvas { width: 100%; height: 100%; }
.chart-legend { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; margin-top: 8px; font-size: 0.85em; }
.legend-item { font-weight: 600; }`;

const JS = `var ws, reconnectTimer;
function connect() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws');
    ws.onopen = function() { console.log('WS connected'); };
    ws.onmessage = function(e) { try { updateDashboard(JSON.parse(e.data)); } catch(x) {} };
    ws.onclose = function() { clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connect, 3000); };
    ws.onerror = function() { ws.close(); };
}
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function formatTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }
function formatDateTime(d) { return pad2(d.getDate()) + '.' + pad2(d.getMonth()+1) + '.' + d.getFullYear() + ' ' + formatTime(d); }
function updateClock() { document.getElementById('clock').textContent = formatDateTime(new Date()); }
setInterval(updateClock, 1000); updateClock();
function updateDashboard(d) {
    var espSt = document.getElementById('esp-status');
    if (d.esp_connected) { espSt.textContent = 'ESP Online'; espSt.className = 'status online'; }
    else { espSt.textContent = 'ESP Offline'; espSt.className = 'status offline'; }
    var st = document.getElementById('status');
    if (d.online) { st.textContent = 'Inverter Online'; st.className = 'status online'; }
    else { st.textContent = 'Inverter Offline'; st.className = 'status offline'; }
    if (d.timestamp) { document.getElementById('last-update').textContent = 'Last data: ' + formatDateTime(new Date(d.timestamp)); }
    if (!d.esp_connected) return;
    document.getElementById('pv1-v').textContent = (d.pv1_v||0).toFixed(1);
    document.getElementById('pv1-a').textContent = (d.pv1_a||0).toFixed(1);
    document.getElementById('pv1-w').textContent = d.pv1_w||0;
    document.getElementById('pv2-v').textContent = (d.pv2_v||0).toFixed(1);
    document.getElementById('pv2-a').textContent = (d.pv2_a||0).toFixed(1);
    document.getElementById('pv2-w').textContent = d.pv2_w||0;
    document.getElementById('pv-total').textContent = (d.pv1_w||0) + (d.pv2_w||0);
    document.getElementById('today-kwh').textContent = (d.today_kwh||0).toFixed(1);
    document.getElementById('total-kwh').textContent = d.total_kwh||0;
    document.getElementById('bat-v').textContent = (d.bat_v||0).toFixed(1);
    document.getElementById('bat-a').textContent = (d.bat_a||0).toFixed(1);
    document.getElementById('bat-t').textContent = (d.bat_t||0).toFixed(1);
    document.getElementById('bat-soc').textContent = d.bat_soc||0;
    document.getElementById('bat-soh').textContent = d.bat_soh||0;
    document.getElementById('bat-w').textContent = Math.abs(d.bat_w||0);
    document.getElementById('soc-fill').style.width = (d.bat_soc||0) + '%';
    var bs = document.getElementById('bat-status');
    if (d.bat_w < 0) { bs.textContent = 'Charging'; bs.className = 'bat-status charging'; }
    else if (d.bat_w > 0) { bs.textContent = 'Discharging'; bs.className = 'bat-status discharging'; }
    else { bs.textContent = 'Idle'; bs.className = 'bat-status'; }
    document.getElementById('grid-v').textContent = (d.grid_v||0).toFixed(1);
    document.getElementById('grid-a').textContent = (d.grid_a||0).toFixed(1);
    document.getElementById('grid-hz').textContent = (d.grid_hz||0).toFixed(2);
    document.getElementById('grid-w').textContent = Math.abs(d.grid_w||0);
    var gs = document.getElementById('grid-status');
    if (d.grid_w < 0) { gs.textContent = 'Importing from grid'; gs.className = 'grid-dir importing'; }
    else if (d.grid_w > 0) { gs.textContent = 'Exporting to grid'; gs.className = 'grid-dir exporting'; }
    else { gs.textContent = '--'; gs.className = 'grid-dir'; }
    document.getElementById('load-w').textContent = d.load_w||0;
    document.getElementById('backup-w').textContent = d.backup_w||0;
    document.getElementById('inv-t').textContent = (d.inv_t||0).toFixed(1);
}
var showChart = false;
function toggleView() {
    showChart = !showChart;
    document.getElementById('data-view').style.display = showChart ? 'none' : 'grid';
    document.getElementById('chart-view').style.display = showChart ? 'block' : 'none';
    document.getElementById('btn-view').textContent = showChart ? 'Data' : 'Chart';
    if (showChart) loadHistory();
}
function loadHistory() { fetch('/api/history').then(function(r){return r.json();}).then(function(d){drawChart(d);}).catch(function(){}); }
function drawChart(data) {
    var canvas = document.getElementById('chart-canvas');
    var container = canvas.parentElement;
    canvas.width = container.clientWidth * (window.devicePixelRatio||1);
    canvas.height = container.clientHeight * (window.devicePixelRatio||1);
    canvas.style.width = container.clientWidth + 'px';
    canvas.style.height = container.clientHeight + 'px';
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var pad = {top:20,right:20,bottom:30,left:50};
    var plotW = W-pad.left-pad.right, plotH = H-pad.top-pad.bottom;
    ctx.clearRect(0,0,W,H);
    if (!data||data.length===0) { ctx.fillStyle='#666'; ctx.font='14px sans-serif'; ctx.textAlign='center'; ctx.fillText('No history data yet',W/2,H/2); return; }
    var maxPower = 100;
    for (var i=0;i<data.length;i++) { var d=data[i]; var m=Math.max(Math.abs(d[1]),Math.abs(d[2]),Math.abs(d[4]),Math.abs(d[5])); if(m>maxPower)maxPower=m; }
    maxPower = Math.ceil(maxPower/500)*500; if(maxPower<500)maxPower=500;
    var zeroY = pad.top+plotH/2, dpr = window.devicePixelRatio||1;
    ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=1;
    for(var s=0;s<=5;s++) { var y=pad.top+plotH-(s/5)*plotH; ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(pad.left+plotW,y);ctx.stroke(); ctx.fillStyle='#666';ctx.font=(10*dpr)+'px sans-serif';ctx.textAlign='right'; ctx.fillText(Math.round(-maxPower+(s/5)*maxPower*2)+'W',pad.left-5,y+4); }
    ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.beginPath();ctx.moveTo(pad.left,zeroY);ctx.lineTo(pad.left+plotW,zeroY);ctx.stroke();
    ctx.fillStyle='#666';ctx.textAlign='center';
    for(var t=0;t<data.length;t+=Math.max(1,Math.floor(data.length/6))){var x=pad.left+(t/(data.length-1))*plotW;var mins=data[t][0];ctx.fillText(Math.floor(mins/60)+':'+('0'+(mins%60)).slice(-2),x,H-5);}
    function drawLine(color,idx){ctx.strokeStyle=color;ctx.lineWidth=2*dpr;ctx.beginPath();for(var i=0;i<data.length;i++){var x=pad.left+(i/Math.max(data.length-1,1))*plotW;var y=zeroY-(data[i][idx]/maxPower)*(plotH/2);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}
    ctx.strokeStyle='#9c27b0';ctx.lineWidth=1.5*dpr;ctx.setLineDash([5,3]);ctx.beginPath();
    for(var i=0;i<data.length;i++){var x=pad.left+(i/Math.max(data.length-1,1))*plotW;var y=pad.top+plotH-(data[i][3]/100)*plotH;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
    ctx.stroke();ctx.setLineDash([]);
    drawLine('#ffc107',1);drawLine('#2196f3',2);drawLine('#f44336',4);drawLine('#4caf50',5);
}
setInterval(function(){if(showChart)loadHistory();},60000);
connect();`;

const HTML = `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Solis Monitor (Remote)</title>
<style>${CSS}</style>
</head>
<body>
<header>
<h1>Solis Monitor</h1>
<div class="header-right">
<button id="btn-view" class="btn-view" onclick="toggleView()">Chart</button>
<span id="esp-status" class="status offline">ESP Offline</span>
<span id="status" class="status offline">Inverter Offline</span>
</div>
</header>
<div class="time-bar">
<span id="clock"></span>
<span id="last-update" class="last-update"></span>
</div>
<div id="chart-view" class="chart-view" style="display:none">
<div class="chart-container"><canvas id="chart-canvas"></canvas></div>
<div class="chart-legend">
<span class="legend-item" style="color:#ffc107">-- PV Power</span>
<span class="legend-item" style="color:#2196f3">-- Battery</span>
<span class="legend-item" style="color:#f44336">-- Grid</span>
<span class="legend-item" style="color:#4caf50">-- Load</span>
<span class="legend-item" style="color:#9c27b0">-- SOC %</span>
</div>
</div>
<div id="data-view" class="grid">
<div class="card solar">
<h2>Solar Panels</h2>
<div class="total-power"><span id="pv-total" class="big-value">0</span><span class="unit">W</span></div>
<div class="pv-strings">
<div class="pv-string"><h3>PV1</h3>
<div class="row"><span class="label">Voltage:</span><span id="pv1-v">0</span> V</div>
<div class="row"><span class="label">Current:</span><span id="pv1-a">0</span> A</div>
<div class="row"><span class="label">Power:</span><span id="pv1-w">0</span> W</div>
</div>
<div class="pv-string"><h3>PV2</h3>
<div class="row"><span class="label">Voltage:</span><span id="pv2-v">0</span> V</div>
<div class="row"><span class="label">Current:</span><span id="pv2-a">0</span> A</div>
<div class="row"><span class="label">Power:</span><span id="pv2-w">0</span> W</div>
</div>
</div>
<div class="row"><span class="label">Today:</span><span id="today-kwh">0</span> kWh</div>
<div class="row"><span class="label">Total:</span><span id="total-kwh">0</span> kWh</div>
</div>
<div class="card battery">
<h2>Battery</h2>
<div class="soc-container">
<div class="soc-bar"><div id="soc-fill" class="soc-fill" style="width:0%"></div></div>
<span id="bat-soc" class="big-value">0</span><span class="unit">%</span>
</div>
<div id="bat-status" class="bat-status">--</div>
<div class="row"><span class="label">Power:</span><span id="bat-w">0</span> W</div>
<div class="row"><span class="label">Voltage:</span><span id="bat-v">0</span> V</div>
<div class="row"><span class="label">Current:</span><span id="bat-a">0</span> A</div>
<div class="row"><span class="label">Temp:</span><span id="bat-t">0</span> &deg;C</div>
<div class="row"><span class="label">SOH:</span><span id="bat-soh">0</span> %</div>
</div>
<div class="card grid-card">
<h2>Grid</h2>
<div class="total-power"><span id="grid-w" class="big-value">0</span><span class="unit">W</span></div>
<div id="grid-status" class="grid-dir">--</div>
<div class="row"><span class="label">Voltage:</span><span id="grid-v">0</span> V</div>
<div class="row"><span class="label">Current:</span><span id="grid-a">0</span> A</div>
<div class="row"><span class="label">Frequency:</span><span id="grid-hz">0</span> Hz</div>
</div>
<div class="card load">
<h2>House Load</h2>
<div class="total-power"><span id="load-w" class="big-value">0</span><span class="unit">W</span></div>
<div class="row"><span class="label">Backup load:</span><span id="backup-w">0</span> W</div>
<div class="row"><span class="label">Inverter temp:</span><span id="inv-t">0</span> &deg;C</div>
</div>
</div>
<script>${JS}</script>
</body>
</html>`;

// --- Server ---
Deno.serve({ port: parseInt(Deno.env.get("PORT") || "8000") }, (req) => {
    const url = new URL(req.url);

    // ESP32 sends data via HTTP POST
    if (url.pathname === "/esp" && req.method === "POST") {
        return req.text().then((body) => {
            try {
                latestData = JSON.parse(body);
                latestData.esp_connected = true;
                latestData.timestamp = Date.now();
                espConnected = true;
                lastEspTime = Date.now();
                checkDayReset();
                addToHistory(latestData);
                broadcast(JSON.stringify(latestData));
                return new Response("ok", { status: 200 });
            } catch (e) {
                console.error("Bad ESP data:", e);
                return new Response("bad data", { status: 400 });
            }
        });
    }

    // WebSocket for browsers
    if (url.pathname === "/ws") {
        const { socket, response } = Deno.upgradeWebSocket(req);
        socket.onopen = () => {
            browsers.add(socket);
            checkEspTimeout();
            console.log("Browser connected, total:", browsers.size);
            if (latestData && espConnected) {
                socket.send(JSON.stringify(latestData));
            } else {
                socket.send(JSON.stringify({ esp_connected: false, online: false }));
            }
        };
        socket.onclose = () => {
            browsers.delete(socket);
            console.log("Browser disconnected, total:", browsers.size);
        };
        return response;
    }

    // REST: latest data
    if (url.pathname === "/api/data") {
        checkEspTimeout();
        return new Response(
            JSON.stringify(latestData || { online: false, esp_connected: false }),
            { headers: { "content-type": "application/json" } },
        );
    }

    // REST: history
    if (url.pathname === "/api/history") {
        return new Response(JSON.stringify(history),
            { headers: { "content-type": "application/json" } });
    }

    // Health
    if (url.pathname === "/health") {
        return new Response(
            JSON.stringify({ ok: true, esp: espConnected, browsers: browsers.size, history_points: history.length }),
            { headers: { "content-type": "application/json" } });
    }

    // Serve HTML for root and any unknown path
    if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(HTML, { headers: { "content-type": "text/html" } });
    }

    return new Response("Not found", { status: 404 });
});

console.log("Solis Relay running");
