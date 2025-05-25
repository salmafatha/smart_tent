// api.js - Complete Smart Tent API Integration
class SmartTentAPI {
  constructor() {
    // Simple configuration - you can change these easily
    this.config = {
      // Use simple local network name or IP
      baseUrl: 'https://7cbc-196-179-23-222.ngrok-free.app',
      tentId: 'tente_v01',
      updateInterval: 2000,  // 2 seconds for real-time
      retryAttempts: 3,
      timeout: 8000         // 8 seconds for 4G
    };
    
    this.cache = new Map();
    this.isOnline = navigator.onLine;
    this.listeners = new Map();
    
    // Initialize connection monitoring
    this.initConnectionMonitoring();
  }

  /**
   * CONNECTION MONITORING
   * Tracks online/offline status and connection quality
   */
  initConnectionMonitoring() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyListeners('connection', { online: true });
      console.log('🟢 Back online - syncing data...');
      this.syncOfflineData();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyListeners('connection', { online: false });
      console.log('🔴 Gone offline - using cached data');
    });
  }

  /**
   * SMART HTTP REQUEST with 4G optimization
   * - Automatic retries with exponential backoff
   * - Timeout handling for slow 4G
   * - Offline caching
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    // If offline, try to return cached data
    if (!this.isOnline && options.method !== 'POST') {
      const cached = this.getFromCache(endpoint);
      if (cached) {
        console.log(`📦 Using cached data for ${endpoint}`);
        return cached;
      }
      throw new Error('No internet connection and no cached data available');
    }

    const requestOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      ...options
    };

    // Retry logic for unreliable 4G connections
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        console.log(`🌐 API Request: ${endpoint} (Attempt ${attempt})`);
        
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        
        const response = await fetch(url, {
          ...requestOptions,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Cache successful responses (except POST requests)
        if (requestOptions.method === 'GET') {
          this.setCache(endpoint, data);
        }
        
        console.log(`✅ API Success: ${endpoint}`);
        return data;
        
      } catch (error) {
        console.warn(`⚠️ Attempt ${attempt} failed for ${endpoint}:`, error.message);
        
        // If this was the last attempt, try cache or throw error
        if (attempt === this.config.retryAttempts) {
          if (requestOptions.method === 'GET') {
            const cached = this.getFromCache(endpoint);
            if (cached) {
              console.log(`📦 Using cached data after ${this.config.retryAttempts} failed attempts`);
              return cached;
            }
          }
          throw new Error(`API request failed after ${this.config.retryAttempts} attempts: ${error.message}`);
        }
        
        // Wait before retry (exponential backoff: 1s, 2s, 4s...)
        await this.delay(1000 * Math.pow(2, attempt - 1));
      }
    }
  }

  /**
   * GET ALL REAL-TIME SENSOR DATA
   * Main function to get complete tent status
   */
  async getAllSensorData() {
    try {
      const data = await this.makeRequest('/api/realtime');
      
      // Transform backend data to frontend format
      const transformedData = this.transformSensorData(data);
      
      // Notify all listeners about new data
      this.notifyListeners('sensorData', transformedData);
      
      return transformedData;
    } catch (error) {
      console.error('❌ Failed to get sensor data:', error);
      
      // Try to get last cached data
      const cached = this.getFromCache('/api/realtime');
      if (cached) {
        return this.transformSensorData(cached);
      }
      
      // If no cache, return empty data structure
      return this.getEmptyDataStructure();
    }
  }

  /**
   * TRANSFORM BACKEND DATA to frontend format
   * Converts your MongoDB structure to easy-to-use frontend format
   */
  transformSensorData(backendData) {
    if (!backendData || !backendData.success) {
      return this.getEmptyDataStructure();
    }

    const { sensor_data, gps_data, esp32_data } = backendData;

    return {
      timestamp: new Date().toISOString(),
      
      // Interior conditions from Raspberry Pi
      interior: {
        temperature: sensor_data?.temperature || 0,
        humidity: sensor_data?.humidity || 0,
        motion: sensor_data?.motion_interior || false,
        gasLevel: sensor_data?.gas_detection || 0,
        gasSafe: (sensor_data?.gas_detection || 0) < 300,
        luminosity: sensor_data?.luminosity || 0
      },
      
      // Exterior conditions (mix of Pi sensors and ESP32)
      exterior: {
        temperature: sensor_data?.temperature_exterior || sensor_data?.temperature || 0,
        humidity: sensor_data?.humidity_exterior || sensor_data?.humidity || 0,
        motion: sensor_data?.motion_exterior || false,
        windSpeed: this.getESP32SensorValue(esp32_data, 'wind_speed') || 0,
        windDirection: this.getESP32SensorValue(esp32_data, 'wind_direction') || 0
      },
      
      // System & connectivity
      system: {
        signal4G: sensor_data?.signal_4g || this.estimateSignalStrength(),
        batteryLevel: sensor_data?.battery_level || 100,
        deviceTemperature: sensor_data?.device_temperature || 35,
        uptime: sensor_data?.uptime || '00:00:00'
      },
      
      // GPS data
      gps: {
        latitude: gps_data?.latitude || 0,
        longitude: gps_data?.longitude || 0,
        altitude: gps_data?.altitude || 0,
        accuracy: gps_data?.accuracy || 0,
        timestamp: gps_data?.timestamp || new Date().toISOString()
      },
      
      // ESP32 devices status
      esp32Devices: this.transformESP32Data(esp32_data),
      
      // Camera data from ESP32
      camera: {
        hasImage: this.hasESP32Camera(esp32_data),
        imageData: this.getESP32CameraData(esp32_data),
        motionDetected: this.getESP32MotionDetection(esp32_data),
        lastUpdate: new Date().toISOString()
      }
    };
  }

  /**
   * GET HISTORICAL DATA for charts
   */
  async getHistoricalData(sensorType, hours = 24) {
    try {
      const endpoint = `/api/history?id=${this.config.tentId}&sensor=${sensorType}&hours=${hours}`;
      const data = await this.makeRequest(endpoint);
      
      return this.transformHistoricalData(data, sensorType);
    } catch (error) {
      console.error(`❌ Failed to get ${sensorType} history:`, error);
      return this.generateMockHistoryData(sensorType, hours);
    }
  }

  /**
   * GET RECENT ALERTS
   */
  async getAlerts(hours = 24) {
    try {
      const endpoint = `/api/alerts?id=${this.config.tentId}&hours=${hours}`;
      const data = await this.makeRequest(endpoint);
      
      return this.transformAlertsData(data);
    } catch (error) {
      console.error('❌ Failed to get alerts:', error);
      return [];
    }
  }

  /**
   * GET DASHBOARD SUMMARY
   */
  async getDashboardData() {
    try {
      const data = await this.makeRequest('/api/dashboard');
      return this.transformDashboardData(data);
    } catch (error) {
      console.error('❌ Failed to get dashboard data:', error);
      return this.getEmptyDashboardData();
    }
  }

  /**
   * SEND COMMAND to Raspberry Pi or ESP32
   */
  async sendCommand(deviceType, command, parameters = {}) {
    try {
      const data = await this.makeRequest('/api/command', {
        method: 'POST',
        body: JSON.stringify({
          raspberry_id: this.config.tentId,
          device_type: deviceType, // 'raspberry' or 'esp32'
          command: command,
          parameters: parameters,
          timestamp: new Date().toISOString()
        })
      });
      
      console.log(`✅ Command sent successfully: ${command}`);
      return data;
    } catch (error) {
      console.error(`❌ Failed to send command ${command}:`, error);
      throw error;
    }
  }

  /**
   * GET WEATHER DATA from WeatherAPI.com
   * Uses GPS coordinates to fetch local weather
   */
  async getWeatherData(tentId) {
    try {
      // Get GPS coordinates first
      const sensorData = await this.getAllSensorData();
      const { latitude, longitude } = sensorData.gps;
      
      if (!latitude || !longitude) {
        console.warn('No GPS coordinates, using mock weather data');
        return this.getMockWeatherData();
      }
      
      // WeatherAPI.com with your API key
      const weatherAPI = `https://api.weatherapi.com/v1/current.json?key=be080c4d1b5d4930813195518252405&q=${latitude},${longitude}&lang=fr`;
      
      console.log('🌤️ Fetching weather data...');
      
      const response = await fetch(weatherAPI);
      
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }
      
      const weatherData = await response.json();
      
      const processedWeather = {
        temperature: Math.round(weatherData.current.temp_c),
        description: weatherData.current.condition.text,
        humidity: weatherData.current.humidity,
        pressure: weatherData.current.pressure_mb,
        windSpeed: Math.round(weatherData.current.wind_kph),
        windDirection: weatherData.current.wind_degree,
        icon: weatherData.current.condition.icon,
        location: weatherData.location.name,
        country: weatherData.location.country,
        lastUpdated: weatherData.current.last_updated,
        feelsLike: Math.round(weatherData.current.feelslike_c)
      };
      
      // Cache weather data
      this.setCache('/weather', processedWeather);
      
      console.log('✅ Weather data retrieved:', processedWeather);
      return processedWeather;
      
    } catch (error) {
      console.error('❌ Failed to get weather data:', error);
      
      // Try cached weather data
      const cached = this.getFromCache('/weather');
      if (cached) {
        console.log('📦 Using cached weather data');
        return cached;
      }
      
      // Fallback to mock data
      return this.getMockWeatherData();
    }
  }

  getMockWeatherData() {
    return {
      temperature: 24,
      description: 'Ensoleillé',
      humidity: 65,
      pressure: 1013,
      windSpeed: 12,
      windDirection: 180,
      icon: '//cdn.weatherapi.com/weather/64x64/day/116.png',
      location: 'Camping',
      country: 'Tunisia',
      lastUpdated: new Date().toISOString(),
      feelsLike: 26
    };
  }
  /**
   * HELPER FUNCTIONS for data transformation
   */
  getESP32SensorValue(esp32Data, sensorType) {
    if (!esp32Data) return null;
    
    for (const deviceId in esp32Data) {
      const device = esp32Data[deviceId];
      if (device.sensors) {
        const sensor = device.sensors.find(s => s.type === sensorType);
        if (sensor) return sensor.value;
      }
    }
    return null;
  }

  transformESP32Data(esp32Data) {
    if (!esp32Data) return [];
    
    return Object.values(esp32Data).map(device => ({
      id: device.device_id,
      name: device.name,
      batteryLevel: device.battery_level || 0,
      status: device.status || 'unknown',
      signalStrength: device.signal_strength || 0,
      lastSeen: device.last_seen || new Date().toISOString(),
      sensors: device.sensors || []
    }));
  }

  hasESP32Camera(esp32Data) {
    return this.getESP32SensorValue(esp32Data, 'camera') !== null;
  }

  getESP32CameraData(esp32Data) {
    return this.getESP32SensorValue(esp32Data, 'camera')?.image_data || null;
  }

  getESP32MotionDetection(esp32Data) {
    return this.getESP32SensorValue(esp32Data, 'camera')?.motion_detected || false;
  }

  estimateSignalStrength() {
    // Estimate 4G signal based on API response time
    const now = Date.now();
    const responseTime = now - (this.lastRequestTime || now);
    
    if (responseTime < 1000) return 4; // Excellent
    if (responseTime < 3000) return 3; // Good
    if (responseTime < 6000) return 2; // Fair
    return 1; // Poor
  }

  /**
   * CACHE MANAGEMENT for offline functionality
   */
  setCache(key, data) {
    this.cache.set(key, {
      data: data,
      timestamp: Date.now(),
      ttl: 300000 // 5 minutes
    });
    
    // Also save to localStorage for persistence
    try {
      localStorage.setItem(`smarttent_cache_${key}`, JSON.stringify({
        data: data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  }

  getFromCache(key) {
    // Try memory cache first
    const memCache = this.cache.get(key);
    if (memCache && (Date.now() - memCache.timestamp) < memCache.ttl) {
      return memCache.data;
    }
    
    // Try localStorage
    try {
      const stored = localStorage.getItem(`smarttent_cache_${key}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Return cached data even if old (better than nothing when offline)
        return parsed.data;
      }
    } catch (error) {
      console.warn('Failed to read from localStorage:', error);
    }
    
    return null;
  }

  /**
   * EVENT LISTENERS for real-time updates
   */
  addEventListener(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  removeEventListener(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  notifyListeners(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * UTILITY FUNCTIONS
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getEmptyDataStructure() {
    return {
      timestamp: new Date().toISOString(),
      interior: { temperature: 0, humidity: 0, motion: false, gasLevel: 0, gasSafe: true, luminosity: 0 },
      exterior: { temperature: 0, humidity: 0, motion: false, windSpeed: 0, windDirection: 0 },
      system: { signal4G: 0, batteryLevel: 0, deviceTemperature: 35, uptime: '00:00:00' },
      gps: { latitude: 0, longitude: 0, altitude: 0, accuracy: 0, timestamp: new Date().toISOString() },
      esp32Devices: [],
      camera: { hasImage: false, imageData: null, motionDetected: false, lastUpdate: new Date().toISOString() }
    };
  }

  /**
   * START AUTOMATIC DATA UPDATES
   */
  startAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.updateInterval = setInterval(async () => {
      try {
        await this.getAllSensorData();
      } catch (error) {
        console.warn('Auto-update failed:', error);
      }
    }, this.config.updateInterval);
    
    console.log(`🔄 Auto-update started (every ${this.config.updateInterval}ms)`);
  }

  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('⏹️ Auto-update stopped');
    }
  }
}

// Create global API instance
const smartTentAPI = new SmartTentAPI();

// Make it available globally for easy debugging
window.smartTentAPI = smartTentAPI;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = smartTentAPI;
}

console.log('🚀 Smart Tent API initialized');
