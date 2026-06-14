// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const testBtn = document.getElementById('testBtn');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const volumeInput = document.getElementById('volumeInput');
const volumeEnabled = document.getElementById('volumeEnabled');
const priceThreshold = document.getElementById('priceThreshold');
const priceOffset = document.getElementById('priceOffset');
const stopLossOffset = document.getElementById('stopLossOffset');
const stopLossEnabled = document.getElementById('stopLossEnabled');
const enableBuy = document.getElementById('enableBuy');
const enableSell = document.getElementById('enableSell');
const useDemoMode = document.getElementById('useDemoMode');
const developerMode = document.getElementById('developerMode');
const settingsSection = document.getElementById('settingsSection');
const controlsSection = document.getElementById('controlsSection');
const logsSection = document.getElementById('logsSection');
const headerEl = document.getElementById('header');
const footerEl = document.getElementById('footer');
const systemStatus = document.getElementById('systemStatus');
const logsContainer = document.getElementById('logsContainer');

// Monitor elements - Removed by user request
/*
const currentPriceEl = document.getElementById('currentPrice');
const previousPriceEl = document.getElementById('previousPrice');
const priceDiffEl = document.getElementById('priceDiff');
const thresholdStatusEl = document.getElementById('thresholdStatus');
const systemActiveEl = document.getElementById('systemActive');
const autoTradingEl = document.getElementById('autoTrading');
const openPositionsEl = document.getElementById('openPositions');
const openOrdersEl = document.getElementById('openOrders');
const lastUpdateEl = document.getElementById('lastUpdate');
*/

// State
let isMonitoring = false;
let updateInterval = null;
const _logDedup = new Map();

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadLogs();
  updateUI();
  startStatusUpdates();
  appendLogToUI('System initialized successfully', 'info');
});

// Load settings from storage
function loadSettings() {
  chrome.storage.local.get(['volume', 'volumeEnabled', 'threshold', 'priceOffset', 'stopLossOffset', 'stopLossEnabled', 'enableBuy', 'enableSell', 'useDemo', 'developerMode'], (result) => {
    if (result.volume) volumeInput.value = result.volume;
    if (result.volumeEnabled !== undefined) {
      volumeEnabled.checked = result.volumeEnabled;
      volumeInput.disabled = !result.volumeEnabled;
    }
    if (result.threshold) priceThreshold.value = result.threshold;
    if (result.priceOffset !== undefined) priceOffset.value = result.priceOffset;
    if (result.stopLossOffset !== undefined) stopLossOffset.value = result.stopLossOffset;
    if (result.stopLossEnabled !== undefined) {
      stopLossEnabled.checked = result.stopLossEnabled;
      stopLossOffset.disabled = !result.stopLossEnabled;
    }
    if (result.enableBuy !== undefined) enableBuy.checked = result.enableBuy;
    if (result.enableSell !== undefined) enableSell.checked = result.enableSell;
    if (result.useDemo !== undefined) useDemoMode.checked = result.useDemo;
    if (result.developerMode !== undefined) developerMode.checked = result.developerMode;
    applyDeveloperMode();
  });
}

// Save settings to storage
function saveSettings() {
  const settings = {
    volume: parseInt(volumeInput.value) || 1,
    volumeEnabled: !!volumeEnabled.checked,
    threshold: parseInt(priceThreshold.value) || 5,
    priceOffset: parseInt(priceOffset.value) || 0,
    stopLossOffset: (function() {
      const v = parseInt(stopLossOffset.value);
      return Number.isNaN(v) ? 2 : v;
    })(),
    stopLossEnabled: !!stopLossEnabled.checked,
    enableBuy: !!enableBuy.checked,
    enableSell: !!enableSell.checked,
    useDemo: useDemoMode.checked,
    developerMode: developerMode.checked
  };
  
  chrome.storage.local.set(settings, () => {
    logToSystem(`Settings saved: Volume=${settings.volume} (Enabled=${settings.volumeEnabled}), Threshold=${settings.threshold}, SL Offset=${settings.stopLossOffset}, Buy=${settings.enableBuy}, Sell=${settings.enableSell}, Demo=${settings.useDemo}`, 'info');
  });
  
  // Send settings to content script
  sendMessageToTabs({ type: 'UPDATE_SETTINGS', settings });
}

// Start monitoring
startBtn.addEventListener('click', async () => {
  saveSettings();
  
  if (!enableBuy.checked && !enableSell.checked) {
    logToSystem('❌ Please enable at least one trade type (Buy or Sell) before starting.', 'error');
    return;
  }

  const settings = {
    volume: parseInt(volumeInput.value) || 1,
    volumeEnabled: !!volumeEnabled.checked,
    threshold: parseInt(priceThreshold.value) || 5,
    priceOffset: parseInt(priceOffset.value) || 0,
    stopLossOffset: (function() {
      const v = parseInt(stopLossOffset.value);
      return Number.isNaN(v) ? 2 : v;
    })(),
    stopLossEnabled: !!stopLossEnabled.checked,
    enableBuy: !!enableBuy.checked,
    enableSell: !!enableSell.checked,
    useDemo: useDemoMode.checked,
    developerMode: developerMode.checked
  };
  
  const tabs = await chrome.tabs.query({});
  const rateGoldTab = tabs.find(t => t.url && t.url.includes('setinrate.com/room'));
  const farazDemoTab = tabs.find(t => t.url && t.url.includes('demo.farazgold.com/room'));
  const farazRealTab = tabs.find(t => t.url && t.url.includes('farazgold.com/room'));
  const intendedDemo = settings.useDemo;
  const farazTargetTab = intendedDemo ? farazDemoTab : farazRealTab;
  
  if (!rateGoldTab) {
    logToSystem('❌ تب RateGold پیدا نشد. لطفاً https://setinrate.com/room را باز کنید.', 'error');
    return;
  }
  
  if (!farazTargetTab) {
    if (intendedDemo) {
      logToSystem('❌ حالت Demo فعال است اما تب Demo باز نیست. لطفاً https://demo.farazgold.com/room را باز کنید.', 'error');
    } else {
      logToSystem('❌ حالت Demo غیرفعال است اما تب واقعی باز نیست. لطفاً https://farazgold.com/room را باز کنید.', 'error');
    }
    return;
  }
  
  logToSystem('🚀 Starting monitoring system...', 'info');
  
  const result = await sendMessageToTabs({ 
    type: 'START_MONITORING', 
    settings 
  });
  
  if (result && result.success) {
    isMonitoring = true;
    updateUI();
    logToSystem('✅ Monitoring started successfully', 'success');
  } else {
    logToSystem('❌ Failed to start monitoring. Make sure both tabs are open.', 'error');
  }
});

// Stop monitoring
stopBtn.addEventListener('click', async () => {
  logToSystem('⏸️ Stopping monitoring system...', 'warning');
  
  await sendMessageToTabs({ type: 'STOP_MONITORING' });
  
  isMonitoring = false;
  updateUI();
  logToSystem('✅ Monitoring stopped', 'success');
});

// Test connection
testBtn.addEventListener('click', async () => {
  logToSystem('🧪 Testing connections...', 'info');
  
  const tabs = await chrome.tabs.query({});
  const rateGoldTab = tabs.find(t => t.url && t.url.includes('setinrate.com/room'));
  const farazGoldTab = tabs.find(t => t.url && (
    t.url.includes('farazgold.com/room') || 
    t.url.includes('demo.farazgold.com/room')
  ));
  
  if (!rateGoldTab) {
    logToSystem('❌ RateGold tab not found. Please open https://setinrate.com/room', 'error');
    return;
  }
  
  if (!farazGoldTab) {
    logToSystem('❌ FarazGold tab not found. Please open https://farazgold.com/room or https://demo.farazgold.com/room', 'error');
    return;
  }
  
  logToSystem('✅ RateGold tab found', 'success');
  logToSystem('✅ FarazGold tab found', 'success');
  
  // Test price reading
  try {
    const response = await chrome.tabs.sendMessage(rateGoldTab.id, { 
      type: 'TEST_PRICE_READ' 
    });
    
    if (response && response.success) {
      logToSystem(`✅ Price reading test successful: ${response.price}`, 'success');
    } else {
      logToSystem('⚠️ Could not read price from RateGold', 'warning');
    }
  } catch (error) {
    logToSystem(`⚠️ Price reading test failed: ${error.message}`, 'warning');
  }
  
  // Test FarazGold elements
  try {
    const response = await chrome.tabs.sendMessage(farazGoldTab.id, { 
      type: 'TEST_ELEMENTS' 
    });
    
    if (response && response.success) {
      logToSystem(`✅ FarazGold elements found: ${response.elements.join(', ')}`, 'success');
    } else {
      logToSystem('⚠️ Some FarazGold elements not found', 'warning');
    }
  } catch (error) {
    logToSystem(`⚠️ FarazGold test failed: ${error.message}`, 'warning');
  }
  
  logToSystem('✅ Connection test completed', 'info');
});

// Clear logs
clearLogsBtn.addEventListener('click', () => {
  logsContainer.innerHTML = '';
  chrome.storage.local.set({ logs: [] });
  // logToSystem('Logs cleared', 'info'); // Optional: don't save "logs cleared" to storage immediately after clearing it
  appendLogToUI('Logs cleared', 'info');
});

// Input change listeners
volumeInput.addEventListener('change', saveSettings);
volumeEnabled.addEventListener('change', () => {
  volumeInput.disabled = !volumeEnabled.checked;
  saveSettings();
});
priceThreshold.addEventListener('change', saveSettings);
priceOffset.addEventListener('change', saveSettings);
stopLossOffset.addEventListener('change', saveSettings);
stopLossEnabled.addEventListener('change', () => {
  stopLossOffset.disabled = !stopLossEnabled.checked;
  saveSettings();
});
enableBuy.addEventListener('change', saveSettings);
enableSell.addEventListener('change', saveSettings);
useDemoMode.addEventListener('change', saveSettings);
developerMode.addEventListener('change', () => {
  saveSettings();
  applyDeveloperMode();
});

// Send log to system (Background)
function logToSystem(message, level = 'info') {
  chrome.runtime.sendMessage({
    type: 'LOG',
    message: message,
    level: level
  }).catch(() => {
    // Background might be asleep or unreachable? Unlikely if popup is open.
    // Fallback to local append
    appendLogToUI(message, level);
  });
}

// Add log entry to UI (Display only)
function appendLogToUI(message, type = 'info', timeString = null) {
  const sig = `${type}|${message}`;
  const nowMs = Date.now();
  const last = _logDedup.get(sig);
  // Reduced deduplication window from 300ms to 50ms to prevent missing rapid logs
  if (last && nowMs - last < 50) {
    return;
  }
  _logDedup.set(sig, nowMs);
  
  let time;
  if (timeString) {
    time = timeString;
  } else {
    const now = new Date();
    time = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
  }
  
  const logItem = document.createElement('div');
  logItem.className = `log-item log-${type}`;
  logItem.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-message">${message}</span>
  `;
  
  logsContainer.insertBefore(logItem, logsContainer.firstChild);
  
  // Keep only last 50 logs
  while (logsContainer.children.length > 50) {
    logsContainer.removeChild(logsContainer.lastChild);
  }
}

// Save logs to storage - REMOVED (Handled by Background)
/*
function saveLogs() {
  ...
}
*/

// Load logs from storage
function loadLogs() {
  chrome.storage.local.get(['logs'], (result) => {
    if (result.logs && result.logs.length > 0) {
      logsContainer.innerHTML = '';
      result.logs.forEach(log => {
        const logItem = document.createElement('div');
        const t = (log.type || 'info').trim();
        const normalized = ['info','success','warning','error'].includes(t) ? t : 'info';
        logItem.className = `log-item log-${normalized}`;
        logItem.innerHTML = `
          <span class="log-time">${log.time}</span>
          <span class="log-message">${log.message}</span>
        `;
        logsContainer.appendChild(logItem);
      });
    }
  });
}

// Update UI based on monitoring state
function updateUI() {
  if (isMonitoring) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    systemStatus.classList.add('active');
    systemStatus.querySelector('.status-text').textContent = 'Active';
    // systemActiveEl.textContent = '✅';
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    systemStatus.classList.remove('active');
    systemStatus.querySelector('.status-text').textContent = 'Stopped';
    // systemActiveEl.textContent = '❌';
  }
  applyDeveloperMode();
}

// Start status updates
function startStatusUpdates() {
  updateInterval = setInterval(async () => {
    try {
      const tabs = await chrome.tabs.query({});
      const rateGoldTab = tabs.find(t => t.url && t.url.includes('setinrate.com/room'));
      
      if (rateGoldTab) {
        const response = await chrome.tabs.sendMessage(rateGoldTab.id, { 
          type: 'GET_STATUS' 
        });
        
        if (response) {
          updateMonitorDisplay(response);
        }
      }
    } catch (error) {
      // Tab might be closed or not ready
    }
  }, 500); // Update every 500ms
}

function applyDeveloperMode() {
  const dev = developerMode && developerMode.checked;
  if (dev) {
    if (settingsSection) settingsSection.style.display = 'none';
    if (logsSection) logsSection.style.display = 'none';
    if (headerEl) headerEl.style.display = 'none';
    if (footerEl) footerEl.style.display = 'none';
    if (testBtn) testBtn.style.display = 'none';
    if (controlsSection) controlsSection.style.display = '';
  } else {
    if (settingsSection) settingsSection.style.display = '';
    if (logsSection) logsSection.style.display = '';
    if (headerEl) headerEl.style.display = '';
    if (footerEl) footerEl.style.display = '';
    if (testBtn) testBtn.style.display = '';
  }
}
// Update monitor display - Removed by user request
/*
function updateMonitorDisplay(data) {
  if (data.currentPrice !== undefined) {
    currentPriceEl.textContent = data.currentPrice.toLocaleString();
  }
  
  if (data.previousPrice !== undefined) {
    previousPriceEl.textContent = data.previousPrice.toLocaleString();
  }
  
  if (data.priceDiff !== undefined) {
    priceDiffEl.textContent = data.priceDiff;
    priceDiffEl.style.color = data.priceDiff > 0 ? '#10b981' : data.priceDiff < 0 ? '#ef4444' : '#fff';
  }
  
  if (data.thresholdReached !== undefined) {
    thresholdStatusEl.textContent = data.thresholdReached ? '✅' : '❌';
  }
  
  if (data.isMonitoring !== undefined) {
    isMonitoring = data.isMonitoring;
    updateUI();
  }
  
  if (data.autoTrading !== undefined) {
    autoTradingEl.textContent = data.autoTrading ? '✅' : '❌';
  }
  
  if (data.openPositions !== undefined) {
    openPositionsEl.textContent = data.openPositions;
    openPositionsEl.style.color = data.openPositions > 0 ? '#10b981' : '#fff';
  }
  
  if (data.openOrders !== undefined) {
    openOrdersEl.textContent = data.openOrders;
    openOrdersEl.style.color = data.openOrders > 0 ? '#f59e0b' : '#fff';
  }
  
  lastUpdateEl.textContent = `Time: ${new Date().toLocaleTimeString()}`;
}
*/
function updateMonitorDisplay(data) {
  // Only update core state
  if (data.isMonitoring !== undefined) {
    isMonitoring = data.isMonitoring;
    updateUI();
  }
}

// Send message to all relevant tabs
async function sendMessageToTabs(message) {
  try {
    const tabs = await chrome.tabs.query({});
    const relevantTabs = tabs.filter(t => t.url && (
      t.url.includes('setinrate.com/room') ||
      t.url.includes('farazgold.com/room') ||
      t.url.includes('demo.farazgold.com/room')
    ));
    
    if (relevantTabs.length === 0) {
      return { success: false, error: 'No relevant tabs found' };
    }
    
    const results = await Promise.all(
      relevantTabs.map(tab => 
        chrome.tabs.sendMessage(tab.id, message).catch(() => null)
      )
    );
    
    return results.find(r => r && r.success) || { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LOG') {
    appendLogToUI(message.message, message.level || 'info', message.time);
  } else if (message.type === 'STATUS_UPDATE') {
    updateMonitorDisplay(message.data);
  } else if (message.type === 'MONITORING_STOPPED') {
    isMonitoring = false;
    updateUI();
    sendMessageToTabs({ type: 'STOP_MONITORING' });
    // Log handled by background
  }
  
  sendResponse({ received: true });
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
});
