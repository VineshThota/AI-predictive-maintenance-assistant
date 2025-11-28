const express = require('express');
const router = express.Router();
const { Equipment, SensorReading, MaintenanceRecord } = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');

// Get all equipment
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, status, location, type } = req.query;
    const offset = (page - 1) * limit;
    
    const whereClause = {};
    if (status) whereClause.status = status;
    if (location) whereClause.location = { [Op.iLike]: `%${location}%` };
    if (type) whereClause.type = type;
    
    const equipment = await Equipment.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: SensorReading,
          as: 'latestReading',
          limit: 1,
          order: [['timestamp', 'DESC']]
        }
      ],
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      equipment: equipment.rows,
      pagination: {
        total: equipment.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(equipment.count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching equipment:', error);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

// Get equipment by ID
router.get('/:id', async (req, res) => {
  try {
    const equipment = await Equipment.findByPk(req.params.id, {
      include: [
        {
          model: SensorReading,
          as: 'sensorReadings',
          limit: 100,
          order: [['timestamp', 'DESC']]
        },
        {
          model: MaintenanceRecord,
          as: 'maintenanceRecords',
          limit: 10,
          order: [['scheduledDate', 'DESC']]
        }
      ]
    });
    
    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    
    res.json(equipment);
  } catch (error) {
    console.error('Error fetching equipment:', error);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});

// Get equipment health status
router.get('/:id/health', async (req, res) => {
  try {
    const equipment = await Equipment.findByPk(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    
    // Get latest sensor readings
    const latestReadings = await SensorReading.findAll({
      where: { equipmentId: req.params.id },
      order: [['timestamp', 'DESC']],
      limit: 10
    });
    
    // Calculate health score based on sensor readings
    const healthScore = calculateHealthScore(latestReadings, equipment);
    
    // Get maintenance history
    const maintenanceHistory = await MaintenanceRecord.findAll({
      where: { 
        equipmentId: req.params.id,
        completedDate: { [Op.not]: null }
      },
      order: [['completedDate', 'DESC']],
      limit: 5
    });
    
    // Calculate time since last maintenance
    const lastMaintenance = maintenanceHistory[0];
    const daysSinceLastMaintenance = lastMaintenance 
      ? moment().diff(moment(lastMaintenance.completedDate), 'days')
      : null;
    
    res.json({
      equipmentId: equipment.id,
      name: equipment.name,
      status: equipment.status,
      healthScore,
      lastMaintenance: lastMaintenance ? {
        date: lastMaintenance.completedDate,
        type: lastMaintenance.type,
        daysSince: daysSinceLastMaintenance
      } : null,
      latestReadings: latestReadings.slice(0, 5),
      alerts: generateAlerts(latestReadings, equipment),
      recommendations: generateRecommendations(healthScore, daysSinceLastMaintenance)
    });
  } catch (error) {
    console.error('Error fetching equipment health:', error);
    res.status(500).json({ error: 'Failed to fetch equipment health' });
  }
});

// Get equipment predictions
router.get('/:id/predictions', async (req, res) => {
  try {
    const equipment = await Equipment.findByPk(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    
    // Get historical sensor data for prediction
    const historicalData = await SensorReading.findAll({
      where: {
        equipmentId: req.params.id,
        timestamp: {
          [Op.gte]: moment().subtract(30, 'days').toDate()
        }
      },
      order: [['timestamp', 'ASC']]
    });
    
    // Generate predictions using ML model (simplified for demo)
    const predictions = await generatePredictions(historicalData, equipment);
    
    res.json({
      equipmentId: equipment.id,
      predictions: {
        failureProbability: predictions.failureProbability,
        remainingUsefulLife: predictions.remainingUsefulLife,
        nextMaintenanceDate: predictions.nextMaintenanceDate,
        riskLevel: predictions.riskLevel,
        confidence: predictions.confidence
      },
      factors: predictions.factors,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating predictions:', error);
    res.status(500).json({ error: 'Failed to generate predictions' });
  }
});

// Create new equipment
router.post('/', async (req, res) => {
  try {
    const equipment = await Equipment.create(req.body);
    res.status(201).json(equipment);
  } catch (error) {
    console.error('Error creating equipment:', error);
    res.status(400).json({ error: 'Failed to create equipment' });
  }
});

// Update equipment
router.put('/:id', async (req, res) => {
  try {
    const equipment = await Equipment.findByPk(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    
    await equipment.update(req.body);
    res.json(equipment);
  } catch (error) {
    console.error('Error updating equipment:', error);
    res.status(400).json({ error: 'Failed to update equipment' });
  }
});

// Delete equipment
router.delete('/:id', async (req, res) => {
  try {
    const equipment = await Equipment.findByPk(req.params.id);
    
    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    
    await equipment.destroy();
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting equipment:', error);
    res.status(500).json({ error: 'Failed to delete equipment' });
  }
});

// Helper functions
function calculateHealthScore(readings, equipment) {
  if (!readings || readings.length === 0) return 50; // Default score
  
  let score = 100;
  const latest = readings[0];
  
  // Check temperature
  if (latest.temperature > equipment.maxTemperature) {
    score -= 20;
  } else if (latest.temperature > equipment.maxTemperature * 0.9) {
    score -= 10;
  }
  
  // Check vibration
  if (latest.vibration > equipment.maxVibration) {
    score -= 25;
  } else if (latest.vibration > equipment.maxVibration * 0.8) {
    score -= 10;
  }
  
  // Check pressure
  if (latest.pressure > equipment.maxPressure || latest.pressure < equipment.minPressure) {
    score -= 15;
  }
  
  return Math.max(0, Math.min(100, score));
}

function generateAlerts(readings, equipment) {
  const alerts = [];
  
  if (!readings || readings.length === 0) return alerts;
  
  const latest = readings[0];
  
  if (latest.temperature > equipment.maxTemperature) {
    alerts.push({
      type: 'critical',
      message: 'Temperature exceeds maximum threshold',
      value: latest.temperature,
      threshold: equipment.maxTemperature
    });
  }
  
  if (latest.vibration > equipment.maxVibration) {
    alerts.push({
      type: 'warning',
      message: 'Vibration levels are high',
      value: latest.vibration,
      threshold: equipment.maxVibration
    });
  }
  
  return alerts;
}

function generateRecommendations(healthScore, daysSinceLastMaintenance) {
  const recommendations = [];
  
  if (healthScore < 30) {
    recommendations.push({
      priority: 'high',
      action: 'Schedule immediate inspection',
      reason: 'Equipment health score is critically low'
    });
  } else if (healthScore < 60) {
    recommendations.push({
      priority: 'medium',
      action: 'Schedule preventive maintenance',
      reason: 'Equipment health score indicates potential issues'
    });
  }
  
  if (daysSinceLastMaintenance && daysSinceLastMaintenance > 90) {
    recommendations.push({
      priority: 'medium',
      action: 'Schedule routine maintenance',
      reason: `${daysSinceLastMaintenance} days since last maintenance`
    });
  }
  
  return recommendations;
}

async function generatePredictions(historicalData, equipment) {
  // Simplified prediction logic (in production, this would use ML models)
  const avgTemperature = historicalData.reduce((sum, reading) => sum + reading.temperature, 0) / historicalData.length;
  const avgVibration = historicalData.reduce((sum, reading) => sum + reading.vibration, 0) / historicalData.length;
  
  const tempRisk = avgTemperature / equipment.maxTemperature;
  const vibrationRisk = avgVibration / equipment.maxVibration;
  
  const failureProbability = Math.min(100, (tempRisk + vibrationRisk) * 50);
  
  let riskLevel = 'low';
  if (failureProbability > 70) riskLevel = 'high';
  else if (failureProbability > 40) riskLevel = 'medium';
  
  const remainingUsefulLife = Math.max(1, 365 - (failureProbability * 3.65));
  const nextMaintenanceDate = moment().add(Math.floor(remainingUsefulLife * 0.8), 'days').toDate();
  
  return {
    failureProbability: Math.round(failureProbability),
    remainingUsefulLife: Math.round(remainingUsefulLife),
    nextMaintenanceDate,
    riskLevel,
    confidence: 85,
    factors: [
      { name: 'Temperature Trend', impact: tempRisk * 100, trend: 'increasing' },
      { name: 'Vibration Pattern', impact: vibrationRisk * 100, trend: 'stable' }
    ]
  };
}

module.exports = router;