const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, './database/healthcare.db');

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());

// Rate limiting
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));

// Routes
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const telemedicineRoutes = require('./routes/telemedicine')(io);

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/telemedicine', telemedicineRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Socket setup
const TelemedicineService = require('./services/telemedicineService');
const telemedicineService = new TelemedicineService(io);
telemedicineService.initialize();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  telemedicineService.handleSignaling(socket);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// DB init
async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) return reject(err);
      console.log('Database initialized');
      resolve();
    });
  });
}

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { app, io };