const mqtt = require('mqtt');
const { SensorReading, Equipment } = require('../models');
require('dotenv').config();

class MQTTService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
    this.username = process.env.MQTT_USERNAME;
    this.password = process.env.MQTT_PASSWORD;
    this.topics = [
      'sensors/+/temperature',
      'sensors/+/vibration',
      'sensors/+/pressure',
      'sensors/+/humidity',
      'sensors/+/electrical',
      'sensors/+/performance'
    ];
  }

  connect() {
    try {
      const options = {
        clientId: `predictive-maintenance-${Math.random().toString(16).substr(2, 8)}`,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 1000,
      };

      if (this.username && this.password) {
        options.username = this.username;
        options.password = this.password;
      }

      this.client = mqtt.connect(this.brokerUrl, options);

      this.client.on('connect', () => {
        console.log('✅ MQTT Client connected to broker');
        this.isConnected = true;
        this.subscribeToTopics();
      });

      this.client.on('message', (topic, message) => {
        this.handleMessage(topic, message);
      });

      this.client.on('error', (error) => {
        console.error('❌ MQTT Connection error:', error);
        this.isConnected = false;
      });

      this.client.on('close', () => {
        console.log('🔌 MQTT Connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnect', () => {
        console.log('🔄 MQTT Reconnecting...');
      });

    } catch (error) {
      console.error('❌ Failed to connect to MQTT broker:', error);
    }
  }

  subscribeToTopics() {
    this.topics.forEach(topic => {
      this.client.subscribe(topic, (err) => {
        if (err) {
          console.error(`❌ Failed to subscribe to ${topic}:`, err);
        } else {
          console.log(`📡 Subscribed to ${topic}`);
        }
      });
    });
  }

  async handleMessage(topic, message) {
    try {
      const data = JSON.parse(message.toString());
      const topicParts = topic.split('/');
      const equipmentId = topicParts[1];
      const sensorType = topicParts[2];

      console.log(`📊 Received ${sensorType} data for equipment ${equipmentId}:`, data);

      // Verify equipment exists
      const equipment = await Equipment.findByPk(equipmentId);
      if (!equipment) {
        console.warn(`⚠️ Equipment ${equipmentId} not found, skipping sensor data`);
        return;
      }

      // Process sensor data based on type
      const sensorReading = await this.processSensorData(equipmentId, sensorType, data);
      
      if (sensorReading) {
        // Emit real-time update via WebSocket (if available)
        this.emitRealTimeUpdate(equipmentId, sensorReading);
        
        // Check for alerts
        await this.checkForAlerts(equipment, sensorReading);
      }

    } catch (error) {
      console.error('❌ Error processing MQTT message:', error);
    }
  }

  async processSensorData(equipmentId, sensorType, data) {
    try {
      // Find or create sensor reading for this timestamp
      const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
      
      let sensorReading = await SensorReading.findOne({
        where: {
          equipmentId,
          timestamp: {
            [require('sequelize').Op.gte]: new Date(timestamp.getTime() - 5000), // 5 second window
            [require('sequelize').Op.lte]: new Date(timestamp.getTime() + 5000)
          }
        }
      });

      const updateData = { equipmentId, timestamp };

      // Map sensor type to database fields
      switch (sensorType) {
        case 'temperature':
          updateData.temperature = data.value || data.temperature;
          break;
        case 'vibration':
          updateData.vibration = data.value || data.vibration;
          break;
        case 'pressure':
          updateData.pressure = data.value || data.pressure;
          break;
        case 'humidity':
          updateData.humidity = data.value || data.humidity;
          break;
        case 'electrical':
          updateData.electricalCurrent = data.current;
          updateData.voltage = data.voltage;
          updateData.powerConsumption = data.power;
          break;
        case 'performance':
          updateData.rpm = data.rpm;
          updateData.additionalMetrics = data.metrics || {};
          break;
        default:
          console.warn(`⚠️ Unknown sensor type: ${sensorType}`);
          return null;
      }

      if (sensorReading) {
        // Update existing reading
        await sensorReading.update(updateData);
      } else {
        // Create new reading
        sensorReading = await SensorReading.create(updateData);
      }

      return sensorReading;

    } catch (error) {
      console.error('❌ Error processing sensor data:', error);
      return null;
    }
  }

  async checkForAlerts(equipment, sensorReading) {
    const { Alert } = require('../models');
    const alerts = [];

    // Temperature alerts
    if (sensorReading.temperature && sensorReading.temperature > equipment.maxTemperature) {
      alerts.push({
        equipmentId: equipment.id,
        type: 'critical',
        title: 'High Temperature Alert',
        message: `Temperature (${sensorReading.temperature}°C) exceeds maximum threshold (${equipment.maxTemperature}°C)`,
        metadata: {
          sensorType: 'temperature',
          value: sensorReading.temperature,
          threshold: equipment.maxTemperature,
          readingId: sensorReading.id
        }
      });
    }

    // Vibration alerts
    if (sensorReading.vibration && sensorReading.vibration > equipment.maxVibration) {
      alerts.push({
        equipmentId: equipment.id,
        type: 'warning',
        title: 'High Vibration Alert',
        message: `Vibration (${sensorReading.vibration}) exceeds maximum threshold (${equipment.maxVibration})`,
        metadata: {
          sensorType: 'vibration',
          value: sensorReading.vibration,
          threshold: equipment.maxVibration,
          readingId: sensorReading.id
        }
      });
    }

    // Pressure alerts
    if (sensorReading.pressure) {
      if (sensorReading.pressure > equipment.maxPressure || sensorReading.pressure < equipment.minPressure) {
        alerts.push({
          equipmentId: equipment.id,
          type: 'warning',
          title: 'Pressure Out of Range',
          message: `Pressure (${sensorReading.pressure}) is outside normal range (${equipment.minPressure}-${equipment.maxPressure})`,
          metadata: {
            sensorType: 'pressure',
            value: sensorReading.pressure,
            minThreshold: equipment.minPressure,
            maxThreshold: equipment.maxPressure,
            readingId: sensorReading.id
          }
        });
      }
    }

    // Create alerts in database
    for (const alertData of alerts) {
      try {
        // Check if similar alert already exists and is active
        const existingAlert = await Alert.findOne({
          where: {
            equipmentId: alertData.equipmentId,
            type: alertData.type,
            title: alertData.title,
            status: 'active'
          }
        });

        if (!existingAlert) {
          await Alert.create(alertData);
          console.log(`🚨 Alert created: ${alertData.title} for equipment ${equipment.name}`);
          
          // Emit alert via WebSocket
          this.emitAlert(alertData);
        }
      } catch (error) {
        console.error('❌ Error creating alert:', error);
      }
    }
  }

  emitRealTimeUpdate(equipmentId, sensorReading) {
    // This would integrate with WebSocket server
    // For now, just log the update
    console.log(`📡 Real-time update for equipment ${equipmentId}:`, {
      timestamp: sensorReading.timestamp,
      temperature: sensorReading.temperature,
      vibration: sensorReading.vibration,
      pressure: sensorReading.pressure
    });
  }

  emitAlert(alertData) {
    // This would integrate with WebSocket server to send alerts to connected clients
    console.log(`🚨 Alert emitted:`, alertData);
  }

  publish(topic, message) {
    if (this.isConnected && this.client) {
      this.client.publish(topic, JSON.stringify(message), (err) => {
        if (err) {
          console.error(`❌ Failed to publish to ${topic}:`, err);
        } else {
          console.log(`📤 Published to ${topic}:`, message);
        }
      });
    } else {
      console.warn('⚠️ MQTT client not connected, cannot publish message');
    }
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      this.isConnected = false;
      console.log('🔌 MQTT Client disconnected');
    }
  }
}

module.exports = new MQTTService();