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

// Start connection
connect();
