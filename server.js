const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Serve static dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Latest data from ESP32
let latestData = null;
let espConnected = false;
let lastUpdateTime = 0;

// REST endpoint for latest data (fallback)
app.get('/api/data', (req, res) => {
    res.json(latestData || { online: false, esp_connected: false });
});

// Health check for Render
app.get('/health', (req, res) => {
    res.json({ ok: true, esp: espConnected });
});

// WebSocket server
const wss = new WebSocketServer({ server });

const browsers = new Set();

wss.on('connection', (ws, req) => {
    const isEsp = req.url === '/esp';

    if (isEsp) {
        // ESP32 connection
        espConnected = true;
        console.log('ESP32 connected');

        ws.on('message', (msg) => {
            try {
                latestData = JSON.parse(msg);
                latestData.esp_connected = true;
                lastUpdateTime = Date.now();

                // Relay to all browsers
                const relay = JSON.stringify(latestData);
                for (const browser of browsers) {
                    if (browser.readyState === 1) {
                        browser.send(relay);
                    }
                }
            } catch (e) {
                console.error('Bad ESP data:', e.message);
            }
        });

        ws.on('close', () => {
            espConnected = false;
            console.log('ESP32 disconnected');
            // Notify browsers
            const msg = JSON.stringify({ esp_connected: false, online: false });
            for (const browser of browsers) {
                if (browser.readyState === 1) browser.send(msg);
            }
        });

    } else {
        // Browser connection
        browsers.add(ws);
        console.log('Browser connected, total:', browsers.size);

        // Send latest data immediately
        if (latestData) {
            ws.send(JSON.stringify(latestData));
        } else {
            ws.send(JSON.stringify({ esp_connected: false, online: false }));
        }

        ws.on('close', () => {
            browsers.delete(ws);
            console.log('Browser disconnected, total:', browsers.size);
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Solis Relay running on port ${PORT}`);
});
