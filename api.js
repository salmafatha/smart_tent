// api.js - Smart Tent API Connection
class SmartTentAPI {
    constructor() {
        this.baseURL = 'https://smart-tent.onrender.com';
        this.apiEndpoint = '/api/sensors';
        this.lastData = null;
        this.isConnected = false;
        
        // Auto-refresh settings
        this.refreshInterval = 30000; // 30 seconds
        this.intervalId = null;
        
        console.log('🏕️ Smart Tent API initialized');
        console.log(`📡 Endpoint: ${this.baseURL}${this.apiEndpoint}`);
    }
    
    async fetchLatestData() {
        try {
            console.log('📡 Fetching latest sensor data...');
            
            // Try to get latest data (you might need to implement this endpoint)
            const response = await fetch(`${this.baseURL}${this.apiEndpoint}/latest`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.lastData = data;
                this.isConnected = true;
                console.log('✅ Data received:', data);
                return data;
            } else {
                console.warn(`⚠️ API returned ${response.status}`);
                this.isConnected = false;
                return null;
            }
            
        } catch (error) {
            console.error('❌ Failed to fetch data:', error);
            this.isConnected = false;
            return null;
        }
    }
    
    async sendTestData() {
        const testData = {
            timestamp: new Date().toISOString(),
            temperature: Math.round((Math.random() * 15 + 20) * 10) / 10,
            humidity: Math.round((Math.random() * 40 + 40) * 10) / 10,
            gas_level: Math.round(Math.random() * 0.05 * 1000) / 1000,
            movement_detected: Math.random() > 0.8,
            device_id: 'web_test',
            location: 'Kala Sghira, Sousse'
        };
        
        try {
            console.log('📤 Sending test data:', testData);
            
            const response = await fetch(`${this.baseURL}${this.apiEndpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(testData)
            });
            
            if (response.ok) {
                console.log('✅ Test data sent successfully');
                // Update display immediately
                this.updateDisplay(testData);
                return true;
            } else {
                console.error('❌ Failed to send test data:', response.status);
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error sending test data:', error);
            return false;
        }
    }
    
    updateDisplay(data) {
        if (!data) {
            console.log('No data to display');
            return;
        }
        
        console.log('🔄 Updating display with:', data);
        
        // Update temperature
        const tempElement = document.querySelector('[data-sensor="temperature"]');
        if (tempElement) {
            tempElement.textContent = data.temperature ? `${data.temperature}°C` : '--°C';
        }
        
        // Update humidity
        const humidityElement = document.querySelector('[data-sensor="humidity"]');
        if (humidityElement) {
            humidityElement.textContent = data.humidity ? `${data.humidity}%` : '--%';
        }
        
        // Update gas
        const gasElement = document.querySelector('[data-sensor="gas"]');
        if (gasElement) {
            const gasValue = data.gas_level ? Math.round(data.gas_level * 1000) : 0;
            gasElement.textContent = gasValue ? `${gasValue} ppm` : '-- ppm';
        }
        
        // Update movement
        const movementElement = document.querySelector('[data-sensor="movement"]');
        if (movementElement) {
            movementElement.textContent = data.movement_detected ? 'Détecté' : 'Aucun';
        }
        
        // Try alternative selectors if data-sensor doesn't work
        this.updateByClass(data);
        
        // Update connection status
        this.updateConnectionStatus(true);
        
        // Update last update time
        const timestamp = new Date(data.timestamp || new Date());
        const timeString = timestamp.toLocaleTimeString('fr-FR');
        const timeElements = document.querySelectorAll('.last-update, #last-update, .timestamp');
        timeElements.forEach(el => {
            el.textContent = `Dernière mise à jour: ${timeString}`;
        });
    }
    
    updateByClass(data) {
        // Alternative update method using common class names
        const updates = [
            { selector: '.temperature, #temperature', value: data.temperature ? `${data.temperature}` : '--' },
            { selector: '.humidity, #humidity', value: data.humidity ? `${data.humidity}` : '--' },
            { selector: '.gas, #gas, .gas-level', value: data.gas_level ? Math.round(data.gas_level * 1000) : '--' },
            { selector: '.movement, #movement', value: data.movement_detected ? 'Détecté' : 'Aucun' }
        ];
        
        updates.forEach(update => {
            const elements = document.querySelectorAll(update.selector);
            elements.forEach(el => {
                if (el) el.textContent = update.value;
            });
        });
    }
    
    updateConnectionStatus(connected) {
        console.log(`🔗 Connection status: ${connected ? 'Connected' : 'Disconnected'}`);
        
        // Update status indicators
        const statusElements = document.querySelectorAll('.status, .connection-status, #status');
        statusElements.forEach(el => {
            if (el) {
                el.textContent = connected ? 'Connecté' : 'Déconnecté';
                el.className = connected ? 'status connected' : 'status disconnected';
            }
        });
        
        // Update status dots
        const statusDots = document.querySelectorAll('.status-dot, .connection-dot');
        statusDots.forEach(dot => {
            if (dot) {
                dot.style.backgroundColor = connected ? '#4CAF50' : '#F44336';
            }
        });
    }
    
    startAutoRefresh() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        console.log(`🔄 Starting auto-refresh every ${this.refreshInterval/1000} seconds`);
        
        this.intervalId = setInterval(async () => {
            const data = await this.fetchLatestData();
            if (data) {
                this.updateDisplay(data);
            }
        }, this.refreshInterval);
    }
    
    stopAutoRefresh() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('⏸️ Auto-refresh stopped');
        }
    }
    
    async initialize() {
        console.log('🚀 Initializing Smart Tent API...');
        
        // Try to fetch initial data
        const data = await this.fetchLatestData();
        if (data) {
            this.updateDisplay(data);
        } else {
            console.log('No initial data available, sending test data...');
            await this.sendTestData();
        }
        
        // Start auto-refresh
        this.startAutoRefresh();
        
        console.log('✅ Smart Tent API initialized successfully');
    }
}

// Global API instance
let smartTentAPI;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 Page loaded, initializing Smart Tent API...');
    
    smartTentAPI = new SmartTentAPI();
    smartTentAPI.initialize();
    
    // Add manual refresh button handler
    const refreshButtons = document.querySelectorAll('.refresh, #refresh, [onclick*="refresh"]');
    refreshButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            console.log('🔄 Manual refresh triggered');
            const data = await smartTentAPI.fetchLatestData();
            if (data) {
                smartTentAPI.updateDisplay(data);
            }
        });
    });
    
    // Add test data button handler
    const testButtons = document.querySelectorAll('.test, #test');
    testButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            console.log('🧪 Test data triggered');
            smartTentAPI.sendTestData();
        });
    });
});

// Global functions for backward compatibility
function refreshData() {
    if (smartTentAPI) {
        smartTentAPI.fetchLatestData().then(data => {
            if (data) smartTentAPI.updateDisplay(data);
        });
    }
}

function sendTestData() {
    if (smartTentAPI) {
        smartTentAPI.sendTestData();
    }
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartTentAPI;
}
