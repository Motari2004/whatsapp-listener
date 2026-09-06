const makeWASocket = require('@whiskeysockets/baileys').default;
const QRCode = require('qrcode-terminal');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const SessionStore = require('../database/sessionStore');

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.sessionStore = new SessionStore();
    this.isConnected = false;
    this.qrCode = null;
    this.sessionData = null;
    this.connectionStatus = 'disconnected';
    this.isInitializing = false;
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
      // Prevent multiple initializations
      if (this.isInitializing) {
        console.log('⚠️ Already initializing...');
        return this.sock;
      }
      
      this.isInitializing = true;
      console.log('🔄 Initializing WhatsApp...');
      
      await this.sessionStore.connect();
      const savedSession = await this.sessionStore.loadSession();
      
      console.log('📂 Loading session...');
      
      const logger = pino({ level: 'silent' });
      
      // Create socket with proper authentication
      const auth = savedSession ? {
        creds: savedSession.creds || {},
        keys: savedSession.keys || {}
      } : undefined;
      
      this.sock = makeWASocket({
        logger: logger,
        printQRInTerminal: true,
        auth: auth,
        browser: ['WhatsApp Listener', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000
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
        
        // Emit QR event
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
        console.log('✅ WhatsApp Connected Successfully');
        
        // Save session after successful connection
        try {
          const authState = this.sock.authState;
          await this.sessionStore.saveSession({
            creds: authState.creds,
            keys: authState.keys
          });
          console.log('💾 Session saved to database');
        } catch (error) {
          console.error('❌ Failed to save session:', error);
        }
        
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
        console.log('⚠️ Connection closed');
        
        const shouldReconnect = (lastDisconnect?.error instanceof Boom) && 
          lastDisconnect.error.output.statusCode !== 401;
        
        if (shouldReconnect) {
          console.log('🔄 Attempting to reconnect in 5 seconds...');
          this.connectionStatus = 'reconnecting';
          
          if (this.events.onConnectionUpdate) {
            this.events.onConnectionUpdate({
              status: 'reconnecting'
            });
          }
          
          setTimeout(() => {
            this.initialize();
          }, 5000);
        } else {
          console.log('❌ Permanent disconnection. Please restart.');
          this.connectionStatus = 'permanent_disconnect';
          
          if (this.events.onConnectionUpdate) {
            this.events.onConnectionUpdate({
              status: 'permanent_disconnect'
            });
          }
        }
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg.key.fromMe) {
        if (this.events.onMessage) {
          await this.events.onMessage(msg, this.sock);
        }
      }
    });

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
      
      // Ensure JID format
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

  async sendPresenceUpdate(jid, presence) {
    try {
      if (!this.isConnected || !this.sock) {
        throw new Error('Not connected to WhatsApp');
      }
      
      await this.sock.sendPresenceUpdate(presence, jid);
      return true;
    } catch (error) {
      console.error('❌ Failed to send presence update:', error);
      return false;
    }
  }

  async readMessage(jid, messageId) {
    try {
      if (!this.isConnected || !this.sock) {
        throw new Error('Not connected to WhatsApp');
      }
      
      await this.sock.readMessages([
        { remoteJid: jid, id: messageId }
      ]);
      return true;
    } catch (error) {
      console.error('❌ Failed to read message:', error);
      return false;
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      status: this.connectionStatus,
      qrCode: this.qrCode,
      sessionExists: !!this.sessionData,
      timestamp: new Date().toISOString()
    };
  }

  async disconnect() {
    try {
      if (this.sock) {
        await this.sock.end();
      }
      this.isConnected = false;
      this.connectionStatus = 'disconnected';
      this.qrCode = null;
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