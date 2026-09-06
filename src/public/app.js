const API_BASE = window.location.origin;
let statusCheckInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    refreshStatus();
    statusCheckInterval = setInterval(refreshStatus, 10000);
    addLog('system', 'Welcome to WhatsApp Listener!');
});

// Connect WhatsApp
async function connectWhatsApp() {
    try {
        addLog('system', '🔄 Connecting to WhatsApp...');
        const response = await fetch(`${API_BASE}/api/connect`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            addLog('success', '✅ Connection initiated! Please scan QR code.');
            refreshStatus();
        } else {
            addLog('error', '❌ Connection failed: ' + data.error);
        }
    } catch (error) {
        addLog('error', '❌ Error connecting: ' + error.message);
    }
}

// Disconnect WhatsApp
async function disconnectWhatsApp() {
    try {
        addLog('system', '🔄 Disconnecting from WhatsApp...');
        const response = await fetch(`${API_BASE}/api/disconnect`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            addLog('success', '✅ Disconnected successfully');
            refreshStatus();
        } else {
            addLog('error', '❌ Disconnect failed: ' + data.error);
        }
    } catch (error) {
        addLog('error', '❌ Error disconnecting: ' + error.message);
    }
}

// Refresh status
async function refreshStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/status`);
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
    badge.textContent = status.status.charAt(0).toUpperCase() + status.status.slice(1);
    badge.classList.add(status.status);
    
    statusText.textContent = status.status;

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
        qrDisplay.innerHTML = `<img src="${status.qrCode}" alt="QR Code"/>`;
        addLog('system', '📱 New QR code generated');
    } else {
        qrContainer.style.display = 'none';
    }

    // Update buttons
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');

    if (status.status === 'connected') {
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
            addLog('error', '❌ Failed to send message: ' + data.error);
        }
    } catch (error) {
        addLog('error', '❌ Error sending message: ' + error.message);
    }
}

// Send broadcast
async function sendBroadcast() {
    const numbers = document.getElementById('broadcastNumbers').value
        .split(',')
        .map(n => n.trim())
        .filter(n => n);
    
    const message = document.getElementById('broadcastMessage').value.trim();

    if (!numbers.length || !message) {
        alert('Please fill in all fields');
        return;
    }

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
            document.getElementById('broadcastMessage').value = '';
            document.getElementById('broadcastNumbers').value = '';
        } else {
            addLog('error', '❌ Broadcast failed: ' + data.error);
        }
    } catch (error) {
        addLog('error', '❌ Error sending broadcast: ' + error.message);
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

// Refresh QR
function refreshQR() {
    refreshStatus();
    addLog('system', '🔄 Refreshing QR code...');
}

// Add event listeners for Enter key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        if (e.target.id === 'phoneNumber' || e.target.id === 'messageContent') {
            sendMessage();
        }
    }
});