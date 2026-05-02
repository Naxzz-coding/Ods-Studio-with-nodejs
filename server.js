const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure directories
fs.ensureDirSync('./uploads');
fs.ensureDirSync('./temp');

// ============ DATA STORE ============
let currentProject = {
    scenes: [],
    currentSceneId: null,
    settings: {
        rtmpUrl: 'rtmp://ssh101.bozztv.com/live',
        streamKey: '',
        bitrate: 1500,
        fps: 30
    }
};

// Initialize default project
function initProject() {
    if (currentProject.scenes.length === 0) {
        currentProject.scenes.push({
            id: Date.now(),
            name: 'Scene 1',
            sources: []
        });
        currentProject.currentSceneId = currentProject.scenes[0].id;
        
        // Add demo text source
        currentProject.scenes[0].sources.push({
            id: Date.now() + 1,
            name: 'Welcome Text',
            type: 'text',
            x: 50,
            y: 200,
            width: 300,
            height: 100,
            opacity: 100,
            visible: true,
            data: {
                text: '🎬 OBS Mobile Studio\nTap to edit!',
                fontSize: 24,
                fontColor: '#00ff88',
                bgColor: 'transparent',
                textAlign: 'center'
            }
        });
    }
}
initProject();

// ============ API ENDPOINTS ============

// GET project data - 🔴 INI YANG ANDA PERLUKAN!
app.get('/api/project', (req, res) => {
    console.log('GET /api/project - Sending project data');
    res.json(currentProject);
});

// POST save project
app.post('/api/project', (req, res) => {
    currentProject = req.body;
    console.log('POST /api/project - Project saved');
    res.json({ success: true });
});

// GET server status
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'online', 
        timestamp: Date.now(),
        scenes: currentProject.scenes.length,
        version: '1.0.0'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ WEBSOCKET ============
wss.on('connection', (ws) => {
    console.log('📱 Client connected via WebSocket');
    
    // Send initial project data
    ws.send(JSON.stringify({
        type: 'init',
        project: currentProject
    }));
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'updateProject') {
                currentProject = data.project;
                // Broadcast to all clients
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'projectUpdated',
                            project: currentProject
                        }));
                    }
                });
            }
        } catch (e) {
            console.error('WebSocket message error:', e);
        }
    });
    
    ws.on('close', () => {
        console.log('📱 Client disconnected');
    });
});

// ============ SERVER START ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 OBS Mobile Studio Server Running!`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`📡 API Ready: /api/project`);
    console.log(`🔌 WebSocket Ready`);
    console.log(`\n✅ Copy URL ini ke handphone anda!\n`);
});
