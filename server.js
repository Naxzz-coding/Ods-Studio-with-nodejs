const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
const multer = require('multer');
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

// ============ MULTER CONFIGURATION (FILE UPLOAD) ============
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    fileFilter: (req, file, cb) => {
        const allowed = ['video/mp4', 'image/jpeg', 'image/png', 'image/jpg'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only MP4, JPEG, PNG allowed.'));
        }
    }
});

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

// GET project data
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

// POST upload file (video/image) - 🔴 ENDPOINT YANG ANDA PERLUKAN!
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log(`File uploaded: ${req.file.originalname}, size: ${req.file.size}`);
    res.json({
        success: true,
        file: {
            id: Date.now(),
            name: req.file.originalname,
            filename: req.file.filename,
            path: `/uploads/${req.file.filename}`,
            type: req.file.mimetype,
            size: req.file.size
        }
    });
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

// Root endpoint - serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ WEBSOCKET ============
wss.on('connection', (ws) => {
    console.log('📱 Client connected via WebSocket');
    
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
    console.log(`📡 API Ready:`);
    console.log(`   - GET  /api/project`);
    console.log(`   - POST /api/project`);
    console.log(`   - POST /api/upload    (upload video/image)`);
    console.log(`   - GET  /api/status`);
    console.log(`🔌 WebSocket Ready`);
    console.log(`\n✅ Copy URL ini ke handphone anda!\n`);
});
