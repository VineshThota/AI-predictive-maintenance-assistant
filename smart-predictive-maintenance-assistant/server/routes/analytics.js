const express = require('express');
const router = express.Router();
const { Equipment, SensorReading, MaintenanceRecord, Alert } = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');

// Get dashboard analytics
router.get('/dashboard', async (req, res) => {
  try {
    const { timeRange = '7d' } = req.query;
    const startDate = getStartDate(timeRange);

    // Equipment overview
    const equipmentStats = await Equipment.findAll({
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', '*'), 'count']
      ],
      group: ['status']
    });

    // Active alerts
    const activeAlerts = await Alert.count({
      where: { status: 'active' }
    });

    // Critical alerts
    const criticalAlerts = await Alert.count({
      where: { 
        status: 'active',
        type: 'critical'
      }
    });

    // Maintenance activities in time range
    const maintenanceActivities = await MaintenanceRecord.count({
      where: {
        scheduledDate: {
          [Op.gte]: startDate
        }
      }
    });

    // Equipment health distribution
    const equipmentList = await Equipment.findAll({
      include: [{
        model: SensorReading,
        as: 'sensorReadings',
        limit: 1,
        order: [['timestamp', 'DESC']]
      }]
    });

    const healthDistribution = {
      excellent: 0, // 80-100
      good: 0,      // 60-79
      fair: 0,      // 40-59
      poor: 0       // 0-39
    };

    equipmentList.forEach(equipment => {
      const healthScore = calculateHealthScore(equipment.sensorReadings, equipment);
      if (healthScore >= 80) healthDistribution.excellent++;
      else if (healthScore >= 60) healthDistribution.good++;
      else if (healthScore >= 40) healthDistribution.fair++;
      else healthDistribution.poor++;
    });

    // Recent sensor readings trend
    const sensorTrends = await SensorReading.findAll({
      where: {
        timestamp: {
          [Op.gte]: moment().subtract(24, 'hours').toDate()
        }
      },
      attributes: [
        [require('sequelize').fn('DATE_TRUNC', 'hour', require('sequelize').col('timestamp')), 'hour'],
        [require('sequelize').fn('AVG', require('sequelize').col('temperature')), 'avgTemperature'],
        [require('sequelize').fn('AVG', require('sequelize').col('vibration')), 'avgVibration'],
        [require('sequelize').fn('AVG', require('sequelize').col('pressure')), 'avgPressure']
      ],
      group: [require('sequelize').fn('DATE_TRUNC', 'hour', require('sequelize').col('timestamp'))],
      order: [[require('sequelize').fn('DATE_TRUNC', 'hour', require('sequelize').col('timestamp')), 'ASC']]
    });

    res.json({
      overview: {
        totalEquipment: equipmentList.length,
        activeAlerts,
        criticalAlerts,
        maintenanceActivities
      },
      equipmentStats: equipmentStats.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.dataValues.count);
        return acc;
      }, {}),
      healthDistribution,
      sensorTrends: sensorTrends.map(trend => ({
        hour: trend.dataValues.hour,
        avgTemperature: parseFloat(trend.dataValues.avgTemperature || 0),
        avgVibration: parseFloat(trend.dataValues.avgVibration || 0),
        avgPressure: parseFloat(trend.dataValues.avgPressure || 0)
      })),
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard analytics' });
  }
});

// Get equipment performance trends
router.get('/trends', async (req, res) => {
  try {
    const { equipmentId, timeRange = '30d', metric = 'all' } = req.query;
    const startDate = getStartDate(timeRange);

    const whereClause = {
      timestamp: {
        [Op.gte]: startDate
      }
    };

    if (equipmentId) {
      whereClause.equipmentId = equipmentId;
    }

    const trends = await SensorReading.findAll({
      where: whereClause,
      attributes: [
        'equipmentId',
        [require('sequelize').fn('DATE_TRUNC', 'day', require('sequelize').col('timestamp')), 'date'],
        [require('sequelize').fn('AVG', require('sequelize').col('temperature')), 'avgTemperature'],
        [require('sequelize').fn('MAX', require('sequelize').col('temperature')), 'maxTemperature'],
        [require('sequelize').fn('AVG', require('sequelize').col('vibration')), 'avgVibration'],
        [require('sequelize').fn('MAX', require('sequelize').col('vibration')), 'maxVibration'],
        [require('sequelize').fn('AVG', require('sequelize').col('pressure')), 'avgPressure'],
        [require('sequelize').fn('COUNT', '*'), 'readingCount']
      ],
      group: [
        'equipmentId',
        require('sequelize').fn('DATE_TRUNC', 'day', require('sequelize').col('timestamp'))
      ],
      order: [
        ['equipmentId', 'ASC'],
        [require('sequelize').fn('DATE_TRUNC', 'day', require('sequelize').col('timestamp')), 'ASC']
      ],
      include: [{
        model: Equipment,
        as: 'equipment',
        attributes: ['name', 'type', 'location']
      }]
    });

    res.json({
      trends: trends.map(trend => ({
        equipmentId: trend.equipmentId,
        equipmentName: trend.equipment?.name,
        date: trend.dataValues.date,
        avgTemperature: parseFloat(trend.dataValues.avgTemperature || 0),
        maxTemperature: parseFloat(trend.dataValues.maxTemperature || 0),
        avgVibration: parseFloat(trend.dataValues.avgVibration || 0),
        maxVibration: parseFloat(trend.dataValues.maxVibration || 0),
        avgPressure: parseFloat(trend.dataValues.avgPressure || 0),
        readingCount: parseInt(trend.dataValues.readingCount)
      })),
      timeRange,
      metric,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// Get maintenance cost analysis
router.get('/costs', async (req, res) => {
  try {
    const { timeRange = '12m', groupBy = 'month' } = req.query;
    const startDate = getStartDate(timeRange);

    // Maintenance costs by type
    const costsByType = await MaintenanceRecord.findAll({
      where: {
        completedDate: {
          [Op.gte]: startDate,
          [Op.not]: null
        },
        cost: {
          [Op.not]: null
        }
      },
      attributes: [
        'type',
        [require('sequelize').fn('SUM', require('sequelize').col('cost')), 'totalCost'],
        [require('sequelize').fn('COUNT', '*'), 'count'],
        [require('sequelize').fn('AVG', require('sequelize').col('cost')), 'avgCost']
      ],
      group: ['type']
    });

    // Costs over time
    const dateFormat = groupBy === 'month' ? 'month' : 'week';
    const costsOverTime = await MaintenanceRecord.findAll({
      where: {
        completedDate: {
          [Op.gte]: startDate,
          [Op.not]: null
        },
        cost: {
          [Op.not]: null
        }
      },
      attributes: [
        [require('sequelize').fn('DATE_TRUNC', dateFormat, require('sequelize').col('completed_date')), 'period'],
        [require('sequelize').fn('SUM', require('sequelize').col('cost')), 'totalCost'],
        [require('sequelize').fn('COUNT', '*'), 'count']
      ],
      group: [require('sequelize').fn('DATE_TRUNC', dateFormat, require('sequelize').col('completed_date'))],
      order: [[require('sequelize').fn('DATE_TRUNC', dateFormat, require('sequelize').col('completed_date')), 'ASC']]
    });

    // Equipment with highest maintenance costs
    const equipmentCosts = await MaintenanceRecord.findAll({
      where: {
        completedDate: {
          [Op.gte]: startDate,
          [Op.not]: null
        },
        cost: {
          [Op.not]: null
        }
      },
      attributes: [
        'equipmentId',
        [require('sequelize').fn('SUM', require('sequelize').col('cost')), 'totalCost'],
        [require('sequelize').fn('COUNT', '*'), 'maintenanceCount']
      ],
      group: ['equipmentId'],
      order: [[require('sequelize').fn('SUM', require('sequelize').col('cost')), 'DESC']],
      limit: 10,
      include: [{
        model: Equipment,
        as: 'equipment',
        attributes: ['name', 'type', 'location']
      }]
    });

    res.json({
      costsByType: costsByType.map(cost => ({
        type: cost.type,
        totalCost: parseFloat(cost.dataValues.totalCost || 0),
        count: parseInt(cost.dataValues.count),
        avgCost: parseFloat(cost.dataValues.avgCost || 0)
      })),
      costsOverTime: costsOverTime.map(cost => ({
        period: cost.dataValues.period,
        totalCost: parseFloat(cost.dataValues.totalCost || 0),
        count: parseInt(cost.dataValues.count)
      })),
      topEquipmentCosts: equipmentCosts.map(cost => ({
        equipmentId: cost.equipmentId,
        equipmentName: cost.equipment?.name,
        equipmentType: cost.equipment?.type,
        location: cost.equipment?.location,
        totalCost: parseFloat(cost.dataValues.totalCost || 0),
        maintenanceCount: parseInt(cost.dataValues.maintenanceCount)
      })),
      timeRange,
      groupBy,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching cost analysis:', error);
    res.status(500).json({ error: 'Failed to fetch cost analysis' });
  }
});

// Helper functions
function getStartDate(timeRange) {
  const now = moment();
  switch (timeRange) {
    case '1d': return now.subtract(1, 'day').toDate();
    case '7d': return now.subtract(7, 'days').toDate();
    case '30d': return now.subtract(30, 'days').toDate();
    case '3m': return now.subtract(3, 'months').toDate();
    case '6m': return now.subtract(6, 'months').toDate();
    case '12m': return now.subtract(12, 'months').toDate();
    default: return now.subtract(7, 'days').toDate();
  }
}

function calculateHealthScore(readings, equipment) {
  if (!readings || readings.length === 0) return 50;
  
  let score = 100;
  const latest = readings[0];
  
  if (latest.temperature > equipment.maxTemperature) {
    score -= 20;
  } else if (latest.temperature > equipment.maxTemperature * 0.9) {
    score -= 10;
  }
  
  if (latest.vibration > equipment.maxVibration) {
    score -= 25;
  } else if (latest.vibration > equipment.maxVibration * 0.8) {
    score -= 10;
  }
  
  if (latest.pressure > equipment.maxPressure || latest.pressure < equipment.minPressure) {
    score -= 15;
  }
  
  return Math.max(0, Math.min(100, score));
}

module.exports = router;