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
    const status = whatsappService.getStatus();
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        whatsapp: status
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
        console.log('🚀 Starting WhatsApp Listener...');
        console.log('📦 Environment:', process.env.NODE_ENV || 'development');
        
        // Initialize WhatsApp with a delay to ensure database connection
        setTimeout(async () => {
            try {
                await whatsappService.initialize();
            } catch (error) {
                console.error('❌ WhatsApp initialization error:', error.message);
            }
        }, 2000);

        // Set up event handlers
        whatsappService.on('qr', (qr) => {
            console.log('📱 QR Code generated - Scan with WhatsApp');
        });

        whatsappService.on('ready', (sock) => {
            console.log('✅ WhatsApp is ready and connected!');
        });

        whatsappService.on('message', async (msg, sock) => {
            console.log('💬 New message from:', msg.key.remoteJid);
            
            try {
                const from = msg.key.remoteJid;
                const messageText = msg.message?.conversation || 
                                   msg.message?.extendedTextMessage?.text || 
                                   '';
                
                // Auto-reply logic
                if (messageText.toLowerCase() === 'ping') {
                    await sock.sendMessage(from, { text: 'Pong! 🏓' });
                    console.log('✅ Auto-replied pong to:', from);
                } else if (messageText.toLowerCase() === 'help') {
                    await sock.sendMessage(from, { 
                        text: '🤖 Available commands:\n\n• ping - Get pong response\n• help - Show this message\n• status - Check bot status\n• info - Get bot information'
                    });
                } else if (messageText.toLowerCase() === 'status') {
                    const status = whatsappService.getStatus();
                    await sock.sendMessage(from, { 
                        text: `📊 Bot Status:\n• Connected: ${status.isConnected}\n• Status: ${status.status}\n• Uptime: ${Math.floor(process.uptime())}s`
                    });
                } else if (messageText.toLowerCase() === 'info') {
                    await sock.sendMessage(from, {
                        text: '🤖 WhatsApp Listener Bot\nVersion: 1.0.0\nMade with ❤️ using Baileys'
                    });
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });

        whatsappService.on('call', async (call, sock) => {
            console.log('📞 Call from:', call.from);
            
            try {
                await sock.sendMessage(call.from, { 
                    text: '📞 Sorry, I am currently unavailable for calls. Please send a message instead. Thank you!'
                });
                console.log('✅ Auto-replied to call from:', call.from);
            } catch (error) {
                console.error('Error handling call:', error);
            }
        });

        whatsappService.on('connectionUpdate', (update) => {
            console.log('🔄 Connection update:', update);
        });

        // Start Express server
        const server = app.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
            console.log(`🌐 Web interface: http://localhost:${port}`);
            console.log(`📱 QR API: http://localhost:${port}/api/qr`);
            console.log(`📊 Status API: http://localhost:${port}/api/status`);
            console.log(`❤️ Health check: http://localhost:${port}/health`);
        });

        // Handle server errors
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`❌ Port ${port} is already in use`);
                process.exit(1);
            }
            console.error('❌ Server error:', error);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
async function shutdown() {
    console.log('\n🛑 Shutting down gracefully...');
    try {
        await whatsappService.disconnect();
        await whatsappService.sessionStore.disconnect();
    } catch (error) {
        console.error('Error during shutdown:', error);
    }
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
    shutdown();
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
});

startServer();