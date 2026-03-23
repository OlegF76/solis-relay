// Solis Relay Server for Deno Deploy
// ESP32 connects to /esp (WebSocket), browsers connect to /ws

let latestData: any = null;
let espConnected = false;
let espSocket: WebSocket | null = null;
const browsers = new Set<WebSocket>();

// History: store peak data per minute from ESP32
// Each entry: [minute, pv, bat, soc, grid, load]
const history: number[][] = [];
const MAX_HISTORY = 1440; // 24h
let historyMinute = 0;
let lastHistoryTime = 0;

function addToHistory(d: any) {
    const now = Date.now();
    // Record once per minute
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

// Reset history at midnight (approximate)
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

// Read static files from public/
const staticFiles: Record<string, { content: string; type: string }> = {};

async function loadStatic(name: string, type: string) {
    try {
        staticFiles["/" + name] = {
            content: await Deno.readTextFile("./public/" + name),
            type,
        };
    } catch {
        console.warn("Static file not found: " + name);
    }
}

await loadStatic("index.html", "text/html");
await loadStatic("style.css", "text/css");
await loadStatic("app.js", "application/javascript");
staticFiles["/"] = staticFiles["/index.html"];

Deno.serve({ port: parseInt(Deno.env.get("PORT") || "8000") }, (req) => {
    const url = new URL(req.url);

    // WebSocket upgrade for ESP32
    if (url.pathname === "/esp") {
        const { socket, response } = Deno.upgradeWebSocket(req);

        socket.onopen = () => {
            espConnected = true;
            espSocket = socket;
            console.log("ESP32 connected");
        };

        socket.onmessage = (event) => {
            try {
                latestData = JSON.parse(event.data);
                latestData.esp_connected = true;
                latestData.timestamp = Date.now();

                // Add to history
                checkDayReset();
                addToHistory(latestData);

                const relay = JSON.stringify(latestData);
                for (const browser of browsers) {
                    if (browser.readyState === WebSocket.OPEN) {
                        browser.send(relay);
                    }
                }
            } catch (e) {
                console.error("Bad ESP data:", e);
            }
        };

        socket.onclose = () => {
            espConnected = false;
            espSocket = null;
            console.log("ESP32 disconnected");
            const msg = JSON.stringify({ esp_connected: false, online: false });
            for (const browser of browsers) {
                if (browser.readyState === WebSocket.OPEN) browser.send(msg);
            }
        };

        return response;
    }

    // WebSocket upgrade for browsers
    if (url.pathname === "/ws") {
        const { socket, response } = Deno.upgradeWebSocket(req);

        socket.onopen = () => {
            browsers.add(socket);
            console.log("Browser connected, total:", browsers.size);
            if (latestData) {
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
        return new Response(
            JSON.stringify(latestData || { online: false, esp_connected: false }),
            { headers: { "content-type": "application/json" } },
        );
    }

    // REST: history for charts
    if (url.pathname === "/api/history") {
        return new Response(
            JSON.stringify(history),
            { headers: { "content-type": "application/json" } },
        );
    }

    // Health check
    if (url.pathname === "/health") {
        return new Response(
            JSON.stringify({ ok: true, esp: espConnected, history_points: history.length }),
            { headers: { "content-type": "application/json" } },
        );
    }

    // Static files
    const file = staticFiles[url.pathname];
    if (file) {
        return new Response(file.content, {
            headers: { "content-type": file.type },
        });
    }

    // 404
    return new Response("Not found", { status: 404 });
});

console.log("Solis Relay running");
