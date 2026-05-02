// server.js - Pastikan ada kod ini
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

// 🔴 PENTING: Render require PORT dari environment variable
const PORT = process.env.PORT || 3000;

// Pastikan bind ke 0.0.0.0 (Render requirement)
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 OBS Mobile Studio running on port ${PORT}`);
});
