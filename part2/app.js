const express = require('express');
const path = require('path');
require('dotenv').config();
const session = require('express-session'); // add to exam page

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '/public')));
// add this snippet to exam page
app.use(session({
  secret: process.env.SESSION_SECRET || 'devSecret123',
  resave: false,
  saveUninitialized: false
}));

// Routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

// Export the app instead of listening here
module.exports = app;