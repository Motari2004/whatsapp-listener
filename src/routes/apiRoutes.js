const express = require('express');
const router = express.Router();

module.exports = (whatsappService) => {
  // Get QR Code
  router.get('/qr', (req, res) => {
    const status = whatsappService.getStatus();
    
    if (status.status === 'connected') {
      return res.json({
        status: 'connected',
        message: 'WhatsApp is already connected',
        data: status
      });
    }
    
    if (status.status === 'qr_required' && status.qrCode) {
      return res.json({
        status: 'qr_required',
        message: 'Scan QR code to connect',
        qrCode: status.qrCode,
        data: status
      });
    }
    
    res.json({
      status: 'pending',
      message: 'Waiting for QR code to be generated...',
      data: status
    });
  });

  // Get connection status
  router.get('/status', (req, res) => {
    const status = whatsappService.getStatus();
    res.json(status);
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
      res.status(500).json({
        success: false,
        error: error.message
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
      res.status(500).json({
        success: false,
        error: error.message
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
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};