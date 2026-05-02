const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
const multer = require('multer');
const WebSocket = require('ws');
const http = require('http');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Pastikan folder wujud
fs.ensureDirSync('./uploads');
fs.ensureDirSync('./temp');

// ============ MULTER (FILE UPLOAD) ============
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        const allowed = ['video/mp4', 'image/jpeg', 'image/png', 'image/jpg'];
        cb(null, allowed.includes(file.mimetype));
    }
});

// ============ DATA STORE ============
let currentProject = {
    scenes: [],
    currentSceneId: null,
    settings: {
        rtmpUrl: 'rtmp://ssh101.bozztv.com/live',
        streamKey: '',
        bitrate: 2500,
        fps: 30
    }
};

function initProject() {
    if (currentProject.scenes.length === 0) {
        const sceneId = Date.now();
        currentProject.scenes.push({
            id: sceneId,
            name: 'Scene 1',
            sources: []
        });
        currentProject.currentSceneId = sceneId;

        // Contoh source teks
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

// ---------- Project ----------
app.get('/api/project', (req, res) => {
    res.json(currentProject);
});

app.post('/api/project', (req, res) => {
    currentProject = req.body;
    res.json({ success: true });
});

// ---------- Scene ----------
app.post('/api/scene', (req, res) => {
    const { name } = req.body;
    const newScene = {
        id: Date.now(),
        name: name || `Scene ${currentProject.scenes.length + 1}`,
        sources: []
    };
    currentProject.scenes.push(newScene);
    res.json(newScene);
});

app.delete('/api/scene/:id', (req, res) => {
    const id = parseInt(req.params.id);
    if (currentProject.scenes.length === 1) {
        return res.status(400).json({ error: 'Cannot delete last scene' });
    }
    currentProject.scenes = currentProject.scenes.filter(s => s.id !== id);
    if (currentProject.currentSceneId === id) {
        currentProject.currentSceneId = currentProject.scenes[0]?.id || null;
    }
    res.json({ success: true });
});

// ---------- Source ----------
app.post('/api/source', (req, res) => {
    const { sceneId, source } = req.body;
    const scene = currentProject.scenes.find(s => s.id === sceneId);
    if (!scene) return res.status(404).json({ error: 'Scene not found' });
    const newSource = { id: Date.now(), ...source };
    scene.sources.push(newSource);
    res.json(newSource);
});

app.put('/api/source/:id', (req, res) => {
    const sourceId = parseInt(req.params.id);
    for (const scene of currentProject.scenes) {
        const src = scene.sources.find(s => s.id === sourceId);
        if (src) {
            Object.assign(src, req.body);
            return res.json(src);
        }
    }
    res.status(404).json({ error: 'Source not found' });
});

app.delete('/api/source/:id', (req, res) => {
    const sourceId = parseInt(req.params.id);
    for (const scene of currentProject.scenes) {
        const idx = scene.sources.findIndex(s => s.id === sourceId);
        if (idx !== -1) {
            scene.sources.splice(idx, 1);
            return res.json({ success: true });
        }
    }
    res.status(404).json({ error: 'Source not found' });
});

// ---------- Upload ----------
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
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

// ---------- Streaming (FFmpeg) ----------
let activeFFmpeg = null;

app.post('/api/stream/start', (req, res) => {
    const { rtmpUrl, streamKey, videoPath } = req.body;
    if (!rtmpUrl) return res.status(400).json({ error: 'RTMP URL diperlukan' });

    // Hentikan stream lama jika ada
    if (activeFFmpeg) {
        activeFFmpeg.kill('SIGINT');
        activeFFmpeg = null;
    }

    // Tentukan video yang akan di-stream
    let targetVideo = videoPath;
    if (!targetVideo) {
        const uploads = fs.readdirSync('./uploads').filter(f => f.endsWith('.mp4'));
        if (uploads.length === 0) return res.status(404).json({ error: 'Tiada video MP4 untuk di-stream' });
        targetVideo = `/uploads/${uploads[0]}`;
    }
    const fullPath = path.join(__dirname, targetVideo);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File video tidak ditemui' });

    const fullRtmp = streamKey ? `${rtmpUrl}/${streamKey}` : rtmpUrl;
    console.log(`🚀 Streaming ke: ${fullRtmp}`);

    const ffmpeg = spawn('ffmpeg', [
        '-re', '-i', fullPath,
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-b:v', `${currentProject.settings.bitrate || 2500}k`,
        '-maxrate', `${currentProject.settings.bitrate || 2500}k`,
        '-bufsize', '5000k',
        '-pix_fmt', 'yuv420p', '-g', '50',
        '-c:a', 'aac', '-b:a', '160k', '-ar', '44100',
        '-f', 'flv', fullRtmp
    ]);

    ffmpeg.stderr.on('data', data => console.log(`FFmpeg: ${data}`));
    ffmpeg.on('close', code => {
        console.log(`FFmpeg berhenti dengan kod ${code}`);
        activeFFmpeg = null;
    });

    activeFFmpeg = ffmpeg;
    res.json({ success: true, message: 'Stream bermula' });
});

app.post('/api/stream/stop', (req, res) => {
    if (activeFFmpeg) {
        activeFFmpeg.kill('SIGINT');
        activeFFmpeg = null;
        return res.json({ success: true, message: 'Stream dihentikan' });
    }
    res.status(404).json({ error: 'Tiada stream aktif' });
});

app.get('/api/stream/status', (req, res) => {
    res.json({ streaming: activeFFmpeg !== null });
});

// ---------- Utility ----------
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: Date.now(),
        scenes: currentProject.scenes.length,
        version: '1.0.0'
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ WEBSOCKET ============
wss.on('connection', (ws) => {
    console.log('📱 WebSocket client connected');
    ws.send(JSON.stringify({ type: 'init', project: currentProject }));

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.type === 'updateProject') {
                currentProject = data.project;
                // Broadcast to all clients
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'projectUpdated', project: currentProject }));
                    }
                });
            }
        } catch (e) { console.error('WebSocket error:', e); }
    });

    ws.on('close', () => console.log('📱 Client disconnected'));
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 OBS Mobile Studio Server running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`📡 API ready: /api/project, /api/upload, /api/stream/start`);
    console.log(`🔌 WebSocket ready\n`);
});
