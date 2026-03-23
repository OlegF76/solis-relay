var ws;
var reconnectTimer;

function connect() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws');

    ws.onopen = function() {
        console.log('WebSocket connected');
    };

    ws.onmessage = function(event) {
        try {
            var d = JSON.parse(event.data);
            updateDashboard(d);
        } catch(e) {}
    };

    ws.onclose = function() {
        console.log('WebSocket disconnected, reconnecting...');
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = function() {
        ws.close();
    };
}

function updateDashboard(d) {
    // ESP status
    var espSt = document.getElementById('esp-status');
    if (d.esp_connected) {
        espSt.textContent = 'ESP Online';
        espSt.className = 'status online';
    } else {
        espSt.textContent = 'ESP Offline';
        espSt.className = 'status offline';
    }

    // Inverter status
    var st = document.getElementById('status');
    if (d.online) {
        st.textContent = 'Inverter Online';
        st.className = 'status online';
    } else {
        st.textContent = 'Inverter Offline';
        st.className = 'status offline';
    }

    if (!d.esp_connected) return;

    // PV
    document.getElementById('pv1-v').textContent = (d.pv1_v || 0).toFixed(1);
    document.getElementById('pv1-a').textContent = (d.pv1_a || 0).toFixed(1);
    document.getElementById('pv1-w').textContent = d.pv1_w || 0;
    document.getElementById('pv2-v').textContent = (d.pv2_v || 0).toFixed(1);
    document.getElementById('pv2-a').textContent = (d.pv2_a || 0).toFixed(1);
    document.getElementById('pv2-w').textContent = d.pv2_w || 0;
    document.getElementById('pv-total').textContent = (d.pv1_w || 0) + (d.pv2_w || 0);
    document.getElementById('today-kwh').textContent = (d.today_kwh || 0).toFixed(1);
    document.getElementById('total-kwh').textContent = d.total_kwh || 0;

    // Battery
    document.getElementById('bat-v').textContent = (d.bat_v || 0).toFixed(1);
    document.getElementById('bat-a').textContent = (d.bat_a || 0).toFixed(1);
    document.getElementById('bat-t').textContent = (d.bat_t || 0).toFixed(1);
    document.getElementById('bat-soc').textContent = d.bat_soc || 0;
    document.getElementById('bat-soh').textContent = d.bat_soh || 0;
    document.getElementById('bat-w').textContent = Math.abs(d.bat_w || 0);
    document.getElementById('soc-fill').style.width = (d.bat_soc || 0) + '%';

    var batStatus = document.getElementById('bat-status');
    if (d.bat_w < 0) {
        batStatus.textContent = 'Charging';
        batStatus.className = 'bat-status charging';
    } else if (d.bat_w > 0) {
        batStatus.textContent = 'Discharging';
        batStatus.className = 'bat-status discharging';
    } else {
        batStatus.textContent = 'Idle';
        batStatus.className = 'bat-status';
    }

    // Grid
    document.getElementById('grid-v').textContent = (d.grid_v || 0).toFixed(1);
    document.getElementById('grid-a').textContent = (d.grid_a || 0).toFixed(1);
    document.getElementById('grid-hz').textContent = (d.grid_hz || 0).toFixed(2);
    document.getElementById('grid-w').textContent = Math.abs(d.grid_w || 0);

    var gridStatus = document.getElementById('grid-status');
    if (d.grid_w < 0) {
        gridStatus.textContent = 'Importing from grid';
        gridStatus.className = 'grid-dir importing';
    } else if (d.grid_w > 0) {
        gridStatus.textContent = 'Exporting to grid';
        gridStatus.className = 'grid-dir exporting';
    } else {
        gridStatus.textContent = '--';
        gridStatus.className = 'grid-dir';
    }

    // Load
    document.getElementById('load-w').textContent = d.load_w || 0;
    document.getElementById('backup-w').textContent = d.backup_w || 0;
    document.getElementById('inv-t').textContent = (d.inv_t || 0).toFixed(1);
}

// ============================================================
// View toggle
// ============================================================
var showChart = false;

function toggleView() {
    showChart = !showChart;
    document.getElementById('data-view').style.display = showChart ? 'none' : 'grid';
    document.getElementById('chart-view').style.display = showChart ? 'block' : 'none';
    document.getElementById('btn-view').textContent = showChart ? 'Data' : 'Chart';
    if (showChart) loadHistory();
}

function loadHistory() {
    fetch('/api/history')
        .then(function(r) { return r.json(); })
        .then(function(data) { drawChart(data); })
        .catch(function() {});
}

function drawChart(data) {
    var canvas = document.getElementById('chart-canvas');
    var container = canvas.parentElement;
    canvas.width = container.clientWidth * (window.devicePixelRatio || 1);
    canvas.height = container.clientHeight * (window.devicePixelRatio || 1);
    canvas.style.width = container.clientWidth + 'px';
    canvas.style.height = container.clientHeight + 'px';

    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var pad = { top: 20, right: 20, bottom: 30, left: 50 };
    var plotW = W - pad.left - pad.right;
    var plotH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    if (!data || data.length === 0) {
        ctx.fillStyle = '#666';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No history data yet', W / 2, H / 2);
        return;
    }

    var maxPower = 100;
    for (var i = 0; i < data.length; i++) {
        var d = data[i];
        var m = Math.max(Math.abs(d[1]), Math.abs(d[2]), Math.abs(d[4]), Math.abs(d[5]));
        if (m > maxPower) maxPower = m;
    }
    maxPower = Math.ceil(maxPower / 500) * 500;
    if (maxPower < 500) maxPower = 500;

    var zeroY = pad.top + plotH / 2;
    var dpr = window.devicePixelRatio || 1;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (var s = 0; s <= 5; s++) {
        var y = pad.top + plotH - (s / 5) * plotH;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + plotW, y); ctx.stroke();
        ctx.fillStyle = '#666';
        ctx.font = (10 * dpr) + 'px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(-maxPower + (s / 5) * maxPower * 2) + 'W', pad.left - 5, y + 4);
    }

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(pad.left + plotW, zeroY); ctx.stroke();

    // Time labels
    ctx.fillStyle = '#666'; ctx.textAlign = 'center';
    for (var t = 0; t < data.length; t += Math.max(1, Math.floor(data.length / 6))) {
        var x = pad.left + (t / (data.length - 1)) * plotW;
        var mins = data[t][0];
        ctx.fillText(Math.floor(mins / 60) + ':' + ('0' + (mins % 60)).slice(-2), x, H - 5);
    }

    function drawLine(color, idx) {
        ctx.strokeStyle = color; ctx.lineWidth = 2 * dpr; ctx.beginPath();
        for (var i = 0; i < data.length; i++) {
            var x = pad.left + (i / Math.max(data.length - 1, 1)) * plotW;
            var y = zeroY - (data[i][idx] / maxPower) * (plotH / 2);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // SOC
    ctx.strokeStyle = '#9c27b0'; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([5, 3]); ctx.beginPath();
    for (var i = 0; i < data.length; i++) {
        var x = pad.left + (i / Math.max(data.length - 1, 1)) * plotW;
        var y = pad.top + plotH - (data[i][3] / 100) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);

    drawLine('#ffc107', 1); drawLine('#2196f3', 2);
    drawLine('#f44336', 4); drawLine('#4caf50', 5);
}

setInterval(function() { if (showChart) loadHistory(); }, 60000);

// Start connection
connect();
