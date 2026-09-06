require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const WhatsAppService = require('./services/whatsappService');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Initialize WhatsApp service
const whatsappService = new WhatsAppService();

// API routes
app.use('/api', apiRoutes(whatsappService));

// Home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
async function startServer() {
    try {
        // Initialize WhatsApp
        await whatsappService.initialize();

        // Set up event handlers
        whatsappService.on('qr', (qr) => {
            console.log('📱 QR Code generated');
        });

        whatsappService.on('ready', (sock) => {
            console.log('✅ WhatsApp is ready');
        });

        whatsappService.on('message', async (msg, sock) => {
            console.log('💬 New message:', msg);
            
            // Auto-reply logic
            try {
                const from = msg.key.remoteJid;
                const messageText = msg.message?.conversation || 
                                   msg.message?.extendedTextMessage?.text || 
                                   '';
                
                // Handle auto-replies
                if (messageText.toLowerCase() === 'ping') {
                    await sock.sendMessage(from, { text: 'Pong! 🏓' });
                } else if (messageText.toLowerCase() === 'help') {
                    await sock.sendMessage(from, { 
                        text: 'Available commands:\n- ping: Get pong\n- help: Show this message\n- status: Check bot status'
                    });
                } else if (messageText.toLowerCase() === 'status') {
                    await sock.sendMessage(from, { 
                        text: `Bot is running!\nConnected: ${whatsappService.isConnected}\nSession: ${whatsappService.connectionStatus}`
                    });
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });

        whatsappService.on('call', async (call, sock) => {
            console.log('📞 Call from:', call.from);
            
            // Auto-reply to calls
            try {
                await sock.sendMessage(call.from, { 
                    text: '📞 I am currently unavailable for calls. Please send a message instead.' 
                });
            } catch (error) {
                console.error('Error handling call:', error);
            }
        });

        whatsappService.on('connectionUpdate', (update) => {
            console.log('🔄 Connection update:', update);
        });

        // Start Express server
        app.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
            console.log(`🌐 Web interface: http://localhost:${port}`);
            console.log(`📱 QR API: http://localhost:${port}/api/qr`);
            console.log(`📊 Status API: http://localhost:${port}/api/status`);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
async function shutdown() {
    console.log('\n🛑 Shutting down gracefully...');
    await whatsappService.disconnect();
    await whatsappService.sessionStore.disconnect();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
    shutdown();
});

startServer();