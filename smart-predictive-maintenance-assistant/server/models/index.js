const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

// Equipment Model
const Equipment = sequelize.define('Equipment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  location: {
    type: DataTypes.STRING,
    allowNull: false
  },
  manufacturer: {
    type: DataTypes.STRING
  },
  model: {
    type: DataTypes.STRING
  },
  serialNumber: {
    type: DataTypes.STRING,
    unique: true
  },
  installationDate: {
    type: DataTypes.DATE
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'maintenance', 'retired'),
    defaultValue: 'active'
  },
  maxTemperature: {
    type: DataTypes.FLOAT,
    defaultValue: 80.0
  },
  maxVibration: {
    type: DataTypes.FLOAT,
    defaultValue: 10.0
  },
  maxPressure: {
    type: DataTypes.FLOAT,
    defaultValue: 100.0
  },
  minPressure: {
    type: DataTypes.FLOAT,
    defaultValue: 10.0
  },
  description: {
    type: DataTypes.TEXT
  },
  specifications: {
    type: DataTypes.JSONB
  }
});

// SensorReading Model
const SensorReading = sequelize.define('SensorReading', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  equipmentId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Equipment,
      key: 'id'
    }
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  temperature: {
    type: DataTypes.FLOAT
  },
  vibration: {
    type: DataTypes.FLOAT
  },
  pressure: {
    type: DataTypes.FLOAT
  },
  humidity: {
    type: DataTypes.FLOAT
  },
  electricalCurrent: {
    type: DataTypes.FLOAT
  },
  voltage: {
    type: DataTypes.FLOAT
  },
  rpm: {
    type: DataTypes.FLOAT
  },
  powerConsumption: {
    type: DataTypes.FLOAT
  },
  additionalMetrics: {
    type: DataTypes.JSONB
  }
});

// MaintenanceRecord Model
const MaintenanceRecord = sequelize.define('MaintenanceRecord', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  equipmentId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Equipment,
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM('preventive', 'corrective', 'predictive', 'emergency'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'in_progress', 'completed', 'cancelled'),
    defaultValue: 'scheduled'
  },
  scheduledDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  completedDate: {
    type: DataTypes.DATE
  },
  technician: {
    type: DataTypes.STRING
  },
  description: {
    type: DataTypes.TEXT
  },
  workPerformed: {
    type: DataTypes.TEXT
  },
  partsUsed: {
    type: DataTypes.JSONB
  },
  cost: {
    type: DataTypes.DECIMAL(10, 2)
  },
  downtime: {
    type: DataTypes.INTEGER // in minutes
  },
  notes: {
    type: DataTypes.TEXT
  }
});

// Alert Model
const Alert = sequelize.define('Alert', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  equipmentId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Equipment,
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM('critical', 'warning', 'info'),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'acknowledged', 'resolved'),
    defaultValue: 'active'
  },
  acknowledgedBy: {
    type: DataTypes.STRING
  },
  acknowledgedAt: {
    type: DataTypes.DATE
  },
  resolvedAt: {
    type: DataTypes.DATE
  },
  metadata: {
    type: DataTypes.JSONB
  }
});

// Prediction Model
const Prediction = sequelize.define('Prediction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  equipmentId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Equipment,
      key: 'id'
    }
  },
  predictionType: {
    type: DataTypes.ENUM('failure', 'maintenance', 'performance'),
    allowNull: false
  },
  probability: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  confidence: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  timeHorizon: {
    type: DataTypes.INTEGER // days
  },
  riskLevel: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    allowNull: false
  },
  factors: {
    type: DataTypes.JSONB
  },
  recommendations: {
    type: DataTypes.JSONB
  },
  modelVersion: {
    type: DataTypes.STRING
  },
  generatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

// Define associations
Equipment.hasMany(SensorReading, { foreignKey: 'equipmentId', as: 'sensorReadings' });
SensorReading.belongsTo(Equipment, { foreignKey: 'equipmentId', as: 'equipment' });

Equipment.hasMany(MaintenanceRecord, { foreignKey: 'equipmentId', as: 'maintenanceRecords' });
MaintenanceRecord.belongsTo(Equipment, { foreignKey: 'equipmentId', as: 'equipment' });

Equipment.hasMany(Alert, { foreignKey: 'equipmentId', as: 'alerts' });
Alert.belongsTo(Equipment, { foreignKey: 'equipmentId', as: 'equipment' });

Equipment.hasMany(Prediction, { foreignKey: 'equipmentId', as: 'predictions' });
Prediction.belongsTo(Equipment, { foreignKey: 'equipmentId', as: 'equipment' });

// Add indexes for better performance
SensorReading.addIndex(['equipmentId', 'timestamp']);
MaintenanceRecord.addIndex(['equipmentId', 'scheduledDate']);
Alert.addIndex(['equipmentId', 'status']);
Prediction.addIndex(['equipmentId', 'generatedAt']);

module.exports = {
  sequelize,
  Equipment,
  SensorReading,
  MaintenanceRecord,
  Alert,
  Prediction
};