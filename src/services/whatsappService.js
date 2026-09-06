const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode-terminal');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const SessionStore = require('../database/sessionStore');
const fs = require('fs');
const path = require('path');

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.sessionStore = new SessionStore();
    this.isConnected = false;
    this.qrCode = null;
    this.connectionStatus = 'disconnected';
    this.isInitializing = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.authDir = path.join(__dirname, '../../auth_info');
    this.events = {
      onQR: null,
      onReady: null,
      onMessage: null,
      onCall: null,
      onConnectionUpdate: null
    };
  }

  async initialize() {
    try {
      if (this.isInitializing) {
        console.log('⚠️ Already initializing...');
        return this.sock;
      }
      
      this.isInitializing = true;
      console.log('🔄 Initializing WhatsApp...');
      
      await this.sessionStore.connect();
      
      // Create auth directory if it doesn't exist
      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }
      
      // Load saved session from database and save to file
      const savedSession = await this.sessionStore.loadSession();
      if (savedSession) {
        console.log('📂 Loading session from database...');
        // Write session to file for useMultiFileAuthState
        const credsPath = path.join(this.authDir, 'creds.json');
        const keysPath = path.join(this.authDir, 'keys.json');
        
        if (savedSession.creds) {
          fs.writeFileSync(credsPath, JSON.stringify(savedSession.creds, null, 2));
        }
        if (savedSession.keys) {
          fs.writeFileSync(keysPath, JSON.stringify(savedSession.keys, null, 2));
        }
      }
      
      // Use multi file auth state
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      
      const logger = pino({ level: 'silent' });
      
      this.sock = makeWASocket({
        logger: logger,
        printQRInTerminal: true,
        auth: state,
        browser: ['WhatsApp Listener', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 10000
      });

      // Save creds when updated
      this.sock.ev.on('creds.update', saveCreds);

      // Also save to database when creds update
      this.sock.ev.on('creds.update', async () => {
        try {
          const currentState = this.sock.authState;
          await this.sessionStore.saveSession({
            creds: currentState.creds,
            keys: currentState.keys
          });
          console.log('💾 Session saved to database');
        } catch (error) {
          console.error('❌ Failed to save session:', error);
        }
      });

      this.setupEventListeners();
      this.isInitializing = false;
      
      console.log('✅ WhatsApp socket created');
      return this.sock;
    } catch (error) {
      this.isInitializing = false;
      console.error('❌ Failed to initialize WhatsApp:', error);
      throw error;
    }
  }

  setupEventListeners() {
    if (!this.sock) return;

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCode = qr;
        this.connectionStatus = 'qr_required';
        console.log('📱 Scan QR Code:');
        QRCode.generate(qr, { small: true });
        
        if (this.events.onQR) {
          this.events.onQR(qr);
        }
        
        if (this.events.onConnectionUpdate) {
          this.events.onConnectionUpdate({
            status: 'qr_required',
            qr: qr
          });
        }
      }

      if (connection === 'open') {
        this.isConnected = true;
        this.connectionStatus = 'connected';
        this.qrCode = null;
        this.reconnectAttempts = 0;
        console.log('✅ WhatsApp Connected Successfully');
        
        if (this.events.onReady) {
          this.events.onReady(this.sock);
        }
        
        if (this.events.onConnectionUpdate) {
          this.events.onConnectionUpdate({
            status: 'connected'
          });
        }
      }

      if (connection === 'close') {
        this.isConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`⚠️ Connection closed. Status code: ${statusCode}`);
        
        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(5000 * this.reconnectAttempts, 30000);
          console.log(`🔄 Reconnecting attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay/1000}s...`);
          
          this.connectionStatus = 'reconnecting';
          
          if (this.events.onConnectionUpdate) {
            this.events.onConnectionUpdate({
              status: 'reconnecting',
              attempts: this.reconnectAttempts
            });
          }
          
          setTimeout(() => {
            this.initialize();
          }, delay);
        } else {
          console.log('❌ Permanent disconnection.');
          this.connectionStatus = 'disconnected';
          this.qrCode = null;
          
          if (statusCode === DisconnectReason.loggedOut) {
            console.log('📱 Logged out. Please scan QR code again.');
            // Clean up auth files
            if (fs.existsSync(this.authDir)) {
              fs.rmSync(this.authDir, { recursive: true, force: true });
            }
            await this.sessionStore.deleteSession();
          }
          
          if (this.events.onConnectionUpdate) {
            this.events.onConnectionUpdate({
              status: 'disconnected',
              reason: statusCode
            });
          }
        }
      }
    });

    // Handle messages
    this.sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key.fromMe && this.events.onMessage) {
          await this.events.onMessage(msg, this.sock);
        }
      }
    });

    // Handle calls
    this.sock.ev.on('call', async (calls) => {
      for (const call of calls) {
        console.log('📞 Incoming call from:', call.from);
        if (this.events.onCall) {
          await this.events.onCall(call, this.sock);
        }
      }
    });
  }

  on(event, callback) {
    switch(event) {
      case 'qr':
        this.events.onQR = callback;
        break;
      case 'ready':
        this.events.onReady = callback;
        break;
      case 'message':
        this.events.onMessage = callback;
        break;
      case 'call':
        this.events.onCall = callback;
        break;
      case 'connectionUpdate':
        this.events.onConnectionUpdate = callback;
        break;
      default:
        console.error('❌ Unknown event:', event);
    }
  }

  async sendMessage(jid, content) {
    try {
      if (!this.isConnected || !this.sock) {
        throw new Error('Not connected to WhatsApp');
      }
      
      if (!jid.includes('@')) {
        jid = `${jid}@s.whatsapp.net`;
      }
      
      const result = await this.sock.sendMessage(jid, content);
      console.log('✅ Message sent to:', jid);
      return result;
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      status: this.connectionStatus,
      qrCode: this.qrCode,
      sessionExists: fs.existsSync(path.join(this.authDir, 'creds.json')),
      reconnectAttempts: this.reconnectAttempts,
      timestamp: new Date().toISOString()
    };
  }

  async disconnect() {
    try {
      if (this.sock) {
        await this.sock.end();
        this.sock = null;
      }
      this.isConnected = false;
      this.connectionStatus = 'disconnected';
      this.qrCode = null;
      this.reconnectAttempts = 0;
      console.log('🔌 Disconnected from WhatsApp');
    } catch (error) {
      console.error('❌ Error disconnecting:', error);
    }
  }

  getSocket() {
    return this.sock;
  }
}

module.exports = WhatsAppService;