// Background Service Worker
(function() {
  'use strict';

  console.log('Arbitrage Bot Background Service Worker Started');

  // Listen for extension installation
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      console.log('Arbitrage Bot installed successfully');
      
      // Set default settings
      chrome.storage.local.set({
        volume: 1,
        threshold: 5,
        useDemo: true,
        logs: []
      });
      
      // Open welcome page or instructions
      // chrome.tabs.create({
      //   url: ''
      // });
    } else if (details.reason === 'update') {
      console.log('Arbitrage Bot updated');
    }
  });

  // Message handler
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    
    // Get FarazGold tab
    if (message.type === 'GET_FARAZGOLD_TAB') {
      getFarazGoldTab(message.useDemo).then(tab => {
        sendResponse({ success: true, tab: tab });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }
    
    // Execute trade command
    else if (message.type === 'EXECUTE_TRADE') {
      executeTrade(message).then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }
    
    // Forward log messages to popup
    else if (message.type === 'LOG') {
      // Add timestamp here to ensure consistency between storage and popup
      if (!message.time) {
        const now = new Date();
        message.time = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
      }
      
      saveLog(message);
      forwardToPopup(message);
      sendResponse({ received: true });
    }
    
    // Forward status updates to popup
    else if (message.type === 'STATUS_UPDATE') {
      forwardToPopup(message);
      sendResponse({ received: true });
    }
    
    // Handle monitoring stopped
    else if (message.type === 'MONITORING_STOPPED') {
      saveLog({ message: 'System stopped automatically after trade execution', level: 'warning' });
      broadcastStopMonitoring();
      forwardToPopup(message);
      sendResponse({ received: true });
    }
    
    return true;
  });

  // Save log to storage with queue to prevent race conditions
  let logQueue = Promise.resolve();
  
  function saveLog(logData) {
    const time = logData.time || (function() {
      const now = new Date();
      return now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    })();
    
    const newLog = {
      time: time,
      message: logData.message,
      type: logData.level || 'info'
    };
    
    // Chain promises to process logs sequentially
    logQueue = logQueue.then(async () => {
      try {
        const result = await chrome.storage.local.get(['logs']);
        const logs = result.logs || [];
        
        // Add to beginning
        logs.unshift(newLog);
        
        // Keep only last 50 logs
        if (logs.length > 50) {
          logs.length = 50; // Trim array
        }
        
        await chrome.storage.local.set({ logs: logs });
      } catch (error) {
        console.error('Error saving log:', error);
      }
    });
  }

  // Broadcast stop monitoring to all tabs
  async function broadcastStopMonitoring() {
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'STOP_MONITORING' }).catch(() => {});
      }
    });
  }

  // Get FarazGold tab (demo or real)
  async function getFarazGoldTab(useDemo = true) {
    const tabs = await chrome.tabs.query({});
    
    const targetUrl = useDemo 
      ? 'demo.farazgold.com/room'
      : 'farazgold.com/room';
    
    const tab = tabs.find(t => t.url && t.url.includes(targetUrl));
    
    if (!tab) {
      throw new Error(`FarazGold tab not found. Please open https://${targetUrl}`);
    }
    
    return tab;
  }

  // Execute trade on FarazGold tab
  async function executeTrade(params) {
    try {
      const { action, price, volume, useDemo, volumeEnabled, stopLossOffset, stopLossEnabled, threshold } = params;
      
      // Find FarazGold tab
      const tab = await getFarazGoldTab(useDemo);
      
      // Send execute command to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'EXECUTE_TRADE',
        action: action,
        price: price,
        volume: volume,
        volumeEnabled: volumeEnabled,
        stopLossOffset: stopLossOffset,
        stopLossEnabled: stopLossEnabled,
        threshold: threshold,
        useDemo: useDemo
      });
      
      return response;
    } catch (error) {
      console.error('Trade execution error:', error);
      return { success: false, error: error.message };
    }
  }

  // Forward message to popup if it's open
  async function forwardToPopup(message) {
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      // Popup is not open, ignore
    }
  }

  // Keep service worker alive
  let keepAliveInterval = null;
  
  function startKeepAlive() {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
    }
    
    keepAliveInterval = setInterval(() => {
      chrome.storage.local.get(['keepAlive'], () => {
        // Just a dummy operation to keep service worker alive
      });
    }, 20000); // Every 20 seconds
  }

  // Start keep alive
  startKeepAlive();

  // Handle service worker activation
  self.addEventListener('activate', (event) => {
    console.log('Service Worker activated');
    startKeepAlive();
  });

  // Handle service worker messages from self
  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'KEEP_ALIVE') {
      // Respond to keep alive
      event.ports[0].postMessage({ success: true });
    }
  });

})();
