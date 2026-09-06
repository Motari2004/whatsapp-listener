const express = require('express');
const router = express.Router();

module.exports = (whatsappService) => {
  // Connect WhatsApp
  router.post('/connect', async (req, res) => {
    try {
      console.log('🔄 Connect request received');
      
      // Check if already connected
      const status = whatsappService.getStatus();
      if (status.isConnected) {
        return res.json({
          success: true,
          message: 'Already connected to WhatsApp',
          status: 'connected'
        });
      }

      // Initialize WhatsApp connection
      await whatsappService.initialize();
      
      // Wait a bit for QR to generate
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newStatus = whatsappService.getStatus();
      
      res.json({
        success: true,
        message: 'WhatsApp connection initiated',
        status: newStatus.status,
        qrCode: newStatus.qrCode
      });
    } catch (error) {
      console.error('❌ Connect error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to connect to WhatsApp'
      });
    }
  });

  // Disconnect WhatsApp
  router.post('/disconnect', async (req, res) => {
    try {
      console.log('🔌 Disconnect request received');
      await whatsappService.disconnect();
      res.json({
        success: true,
        message: 'Disconnected successfully'
      });
    } catch (error) {
      console.error('❌ Disconnect error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to disconnect'
      });
    }
  });

  // Get QR Code
  router.get('/qr', (req, res) => {
    try {
      const status = whatsappService.getStatus();
      
      if (status.isConnected) {
        return res.json({
          success: true,
          status: 'connected',
          message: 'WhatsApp is already connected'
        });
      }
      
      if (status.qrCode) {
        return res.json({
          success: true,
          status: 'qr_required',
          qrCode: status.qrCode,
          message: 'Scan QR code to connect'
        });
      }
      
      res.json({
        success: true,
        status: 'pending',
        message: 'Waiting for QR code...'
      });
    } catch (error) {
      console.error('❌ QR error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get connection status
  router.get('/status', (req, res) => {
    try {
      const status = whatsappService.getStatus();
      res.json(status);
    } catch (error) {
      console.error('❌ Status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get all sessions (for debugging)
  router.get('/sessions', async (req, res) => {
    try {
      const sessions = await whatsappService.sessionStore.getAllSessions();
      res.json({
        success: true,
        sessions: sessions
      });
    } catch (error) {
      console.error('❌ Sessions error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Send message
  router.post('/send', async (req, res) => {
    try {
      const { to, message, type = 'text', media_url } = req.body;
      
      if (!to || !message) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: to, message'
        });
      }

      // Check if connected
      const status = whatsappService.getStatus();
      if (!status.isConnected) {
        return res.status(400).json({
          success: false,
          error: 'WhatsApp is not connected. Please connect first.'
        });
      }

      let content;
      switch(type) {
        case 'text':
          content = { text: message };
          break;
        case 'image':
          content = { 
            image: { url: media_url || message },
            caption: message
          };
          break;
        case 'video':
          content = { 
            video: { url: media_url || message },
            caption: message
          };
          break;
        case 'audio':
          content = { 
            audio: { url: media_url || message }
          };
          break;
        default:
          content = { text: message };
      }

      const result = await whatsappService.sendMessage(to, content);
      
      res.json({
        success: true,
        message: 'Message sent successfully',
        data: result
      });
    } catch (error) {
      console.error('❌ Send message error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send message'
      });
    }
  });

  // Send broadcast message
  router.post('/broadcast', async (req, res) => {
    try {
      const { numbers, message } = req.body;
      
      if (!numbers || !message || !Array.isArray(numbers)) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: numbers (array), message'
        });
      }

      // Check if connected
      const status = whatsappService.getStatus();
      if (!status.isConnected) {
        return res.status(400).json({
          success: false,
          error: 'WhatsApp is not connected. Please connect first.'
        });
      }

      const results = [];
      for (const number of numbers) {
        try {
          const result = await whatsappService.sendMessage(number, { text: message });
          results.push({
            number,
            success: true,
            result
          });
        } catch (error) {
          results.push({
            number,
            success: false,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        message: 'Broadcast completed',
        results
      });
    } catch (error) {
      console.error('❌ Broadcast error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send broadcast'
      });
    }
  });

  // Delete session
  router.delete('/session', async (req, res) => {
    try {
      await whatsappService.sessionStore.deleteSession();
      await whatsappService.disconnect();
      res.json({
        success: true,
        message: 'Session deleted successfully'
      });
    } catch (error) {
      console.error('❌ Delete session error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};