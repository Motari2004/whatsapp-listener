const API_BASE = window.location.origin;
let statusCheckInterval = null;
let qrCheckInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    refreshStatus();
    statusCheckInterval = setInterval(refreshStatus, 3000); // Check every 3 seconds
    addLog('system', 'Welcome to WhatsApp Listener!');
});

// Connect WhatsApp
async function connectWhatsApp() {
    const connectBtn = document.getElementById('connectBtn');
    connectBtn.disabled = true;
    connectBtn.textContent = '⏳ Connecting...';
    
    try {
        addLog('system', '🔄 Connecting to WhatsApp...');
        
        const response = await fetch(`${API_BASE}/api/connect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Server error: ${response.status} - ${text}`);
        }
        
        const data = await response.json();
        console.log('Connect response:', data);
        
        if (data.success) {
            addLog('success', '✅ Connection initiated! Looking for QR code...');
            
            // Start checking for QR code
            if (qrCheckInterval) clearInterval(qrCheckInterval);
            qrCheckInterval = setInterval(checkForQR, 2000);
            
            // Check immediately
            setTimeout(checkForQR, 500);
            refreshStatus();
        } else {
            addLog('error', '❌ Connection failed: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Connect error:', error);
        addLog('error', '❌ Error connecting: ' + error.message);
    } finally {
        connectBtn.disabled = false;
        connectBtn.textContent = '🔗 Connect WhatsApp';
    }
}

// Check for QR code
async function checkForQR() {
    try {
        const response = await fetch(`${API_BASE}/api/qr`);
        const data = await response.json();
        
        console.log('QR Check response:', data);
        
        if (data.success && data.status === 'qr_required' && data.qrCode) {
            displayQRCode(data.qrCode);
            addLog('system', '📱 QR Code found! Scan with WhatsApp');
            if (qrCheckInterval) {
                clearInterval(qrCheckInterval);
                qrCheckInterval = null;
            }
        } else if (data.success && data.status === 'connected') {
            addLog('success', '✅ WhatsApp is connected!');
            if (qrCheckInterval) {
                clearInterval(qrCheckInterval);
                qrCheckInterval = null;
            }
            refreshStatus();
        }
    } catch (error) {
        console.error('Error checking QR:', error);
    }
}

// Disconnect WhatsApp
async function disconnectWhatsApp() {
    try {
        addLog('system', '🔄 Disconnecting from WhatsApp...');
        const response = await fetch(`${API_BASE}/api/disconnect`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            addLog('success', '✅ Disconnected successfully');
            document.getElementById('qrCodeDisplay').innerHTML = '';
            document.getElementById('qrContainer').style.display = 'none';
            if (qrCheckInterval) {
                clearInterval(qrCheckInterval);
                qrCheckInterval = null;
            }
            refreshStatus();
        } else {
            addLog('error', '❌ Disconnect failed: ' + data.error);
        }
    } catch (error) {
        addLog('error', '❌ Error disconnecting: ' + error.message);
    }
}

// Display QR Code
function displayQRCode(qrCode) {
    const qrContainer = document.getElementById('qrContainer');
    const qrDisplay = document.getElementById('qrCodeDisplay');
    
    qrContainer.style.display = 'block';
    
    // If it's a base64 image or data URL
    if (qrCode.startsWith('data:image') || qrCode.startsWith('http')) {
        qrDisplay.innerHTML = `<img src="${qrCode}" alt="QR Code" style="max-width: 250px; height: auto; border: 2px solid #e2e8f0; border-radius: 8px;"/>`;
    } else {
        // Use QR Server API
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrCode)}`;
        qrDisplay.innerHTML = `
            <img src="${qrUrl}" alt="QR Code" style="max-width: 250px; height: auto; border: 2px solid #e2e8f0; border-radius: 8px;"/>
            <br/>
            <small style="color: #666; margin-top: 10px; display: block;">Scan this QR code with WhatsApp</small>
        `;
    }
    
    addLog('system', '📱 QR Code displayed');
}

// Refresh status
async function refreshStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/status`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        updateUI(data);
    } catch (error) {
        console.error('Error refreshing status:', error);
    }
}

// Update UI based on status
function updateUI(status) {
    // Update status badge
    const badge = document.getElementById('statusBadge');
    const statusText = document.getElementById('connectionStatus');
    
    badge.className = 'status-badge';
    let statusLabel = status.status || 'unknown';
    badge.textContent = statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);
    badge.classList.add(statusLabel);
    
    statusText.textContent = statusLabel;

    // Update session status
    document.getElementById('sessionStatus').textContent = 
        status.sessionExists ? 'Active' : 'No session';

    // Update timestamp
    document.getElementById('lastUpdate').textContent = 
        status.timestamp ? new Date(status.timestamp).toLocaleTimeString() : '-';

    // Show/hide QR code
    const qrContainer = document.getElementById('qrContainer');
    const qrDisplay = document.getElementById('qrCodeDisplay');

    if (status.status === 'qr_required' && status.qrCode) {
        qrContainer.style.display = 'block';
        displayQRCode(status.qrCode);
    } else if (status.status === 'connected') {
        qrContainer.style.display = 'none';
        if (qrCheckInterval) {
            clearInterval(qrCheckInterval);
            qrCheckInterval = null;
        }
    } else {
        // Don't hide QR if it's already showing
        if (qrContainer.style.display !== 'block') {
            qrContainer.style.display = 'none';
        }
    }

    // Update buttons
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');

    if (status.isConnected) {
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        addLog('success', '✅ WhatsApp is connected');
    } else if (status.status === 'qr_required') {
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
    } else {
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
    }
}

// Send message
async function sendMessage() {
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    const messageType = document.getElementById('messageType').value;
    const messageContent = document.getElementById('messageContent').value.trim();

    if (!phoneNumber || !messageContent) {
        alert('Please fill in all fields');
        return;
    }

    const sendBtn = event.target;
    sendBtn.disabled = true;
    sendBtn.textContent = '⏳ Sending...';

    try {
        const response = await fetch(`${API_BASE}/api/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: phoneNumber,
                message: messageContent,
                type: messageType
            })
        });

        const data = await response.json();
        
        if (data.success) {
            addLog('success', `📤 Message sent to ${phoneNumber}`);
            document.getElementById('messageContent').value = '';
        } else {
            addLog('error', '❌ Failed to send message: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        addLog('error', '❌ Error sending message: ' + error.message);
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = '📤 Send Message';
    }
}

// Send broadcast
async function sendBroadcast() {
    const numbersInput = document.getElementById('broadcastNumbers');
    const messageInput = document.getElementById('broadcastMessage');
    
    const numbers = numbersInput.value
        .split(',')
        .map(n => n.trim())
        .filter(n => n);
    
    const message = messageInput.value.trim();

    if (!numbers.length || !message) {
        alert('Please fill in all fields');
        return;
    }

    const sendBtn = event.target;
    sendBtn.disabled = true;
    sendBtn.textContent = '⏳ Sending...';

    try {
        const response = await fetch(`${API_BASE}/api/broadcast`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                numbers: numbers,
                message: message
            })
        });

        const data = await response.json();
        
        if (data.success) {
            addLog('success', `📢 Broadcast sent to ${data.results.length} recipients`);
            messageInput.value = '';
            numbersInput.value = '';
        } else {
            addLog('error', '❌ Broadcast failed: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        addLog('error', '❌ Error sending broadcast: ' + error.message);
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = '📢 Send Broadcast';
    }
}

// Add log entry
function addLog(type, message) {
    const container = document.getElementById('logsContainer');
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;

    // Keep only last 100 logs
    while (container.children.length > 100) {
        container.removeChild(container.firstChild);
    }
}

// Manual QR refresh
function refreshQR() {
    addLog('system', '🔄 Refreshing QR code...');
    checkForQR();
}

// Add event listeners for Enter key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        if (e.target.id === 'phoneNumber' || e.target.id === 'messageContent') {
            sendMessage();
        }
    }
});

// Clear QR check interval on page unload
window.addEventListener('beforeunload', () => {
    if (qrCheckInterval) {
        clearInterval(qrCheckInterval);
    }
});