var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require('mysql2/promise');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

let db;

(async () => {
  try {
    // Connect to MySQL without specifying a database
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '' // Set your MySQL root password
    });

    // Create the database if it doesn't exist
    await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
    await connection.end();

    // Now connect to the created database
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'DogWalkService'
    });

    // Create a table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS Users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('owner', 'walker') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS Dogs (
        dog_id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        size ENUM('small', 'medium', 'large') NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES Users(user_id)
        )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkRequests (
        request_id INT AUTO_INCREMENT PRIMARY KEY,
        dog_id INT NOT NULL,
        requested_time DATETIME NOT NULL,
        duration_minutes INT NOT NULL,
        location VARCHAR(255) NOT NULL,
        status ENUM('open', 'accepted', 'completed', 'cancelled') DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
        )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkApplications (
        application_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        walker_id INT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
        FOREIGN KEY (walker_id) REFERENCES Users(user_id),
        CONSTRAINT unique_application UNIQUE (request_id, walker_id)
        )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkRatings (
        rating_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        walker_id INT NOT NULL,
        owner_id INT NOT NULL,
        rating INT CHECK (rating BETWEEN 1 AND 5),
        comments TEXT,
        rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
        FOREIGN KEY (walker_id) REFERENCES Users(user_id),
        FOREIGN KEY (owner_id) REFERENCES Users(user_id),
        CONSTRAINT unique_rating_per_walk UNIQUE (request_id)
        )
    `);

    // Insert data if table is empty
    const [rows] = await db.execute('SELECT COUNT(*) AS count FROM Users');
    if (rows[0].count === 0) {
      await db.execute(`
        INSERT INTO Users (username, email, password_hash, role) VALUES
            ('alice123', 'alice@example.com', 'hashed123', 'owner'),
            ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
            ('carol123', 'carol@example.com', 'hashed789', 'owner'),
            ('sarahwalker', 'sarah@example.com', 'hashed111', 'walker'),
            ('george123', 'george@example.com', 'hashed321', 'owner')
      `);
      await db.execute(`
        INSERT INTO Dogs (owner_id, name, size) VALUES
            (1, 'Max', 'medium'),
            (3, 'Bella', 'small'),
            (3, 'Jacob', 'large'),
            (5, 'Milo', 'medium'),
            (5, 'Edward', 'medium')
      `);
      await db.execute(`
        INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status) VALUES
            (1, '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
            (2, '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
            (3, '2025-06-10 10:00:00', 45, 'Forks Trail', 'cancelled'),
            (4, '2025-06-09 08:30:00', 30, 'Central Park', 'completed'),
            (5, '2025-06-11 17:00:00', 60, 'Gardens', 'open'),
            (1, '2025-06-09 08:00:00', 30, 'Parklands', 'completed')
      `);
      await db.execute(`
        INSERT INTO WalkApplications (request_id, walker_id, status) VALUES
            (6, 2, 'accepted')
            (1, 2, 'pending'),
            (2, 4, 'accepted'),
            (3, 4, 'rejected'),
            (4, 2, 'accepted'),
            (5, 4, 'pending')
      `);
      await db.execute(`
        INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments) VALUES
            (6, 2, 1, 5, 'Great walk!'),
            (4, 2, 5, 5, 'Excellent walk! Very punctual and friendly')
      `);
    }
  } catch (err) {
    console.error('Error setting up database. Ensure Mysql is running: service mysql start', err);
  }
})();

// route to list all dogs
app.get('/api/dogs', async (req, res) => {
  try {
    const [dogs] = await db.execute(`
        SELECT d.name AS dog_name, d.size, u.username AS owner_username
        FROM Dogs d
        JOIN Users u on d.owner_id = u.user_id
        `);
    res.json(dogs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

// route to return all open walk requests
app.get('/api/walkrequests/open', async (req, res) => {
    try {
        const [requests] = await db.execute(`
            SELECT r.request_id, d.name AS dog_name, r.requested_time, r.duration_minutes, r.location, u.username AS owner_username
            FROM WalkRequests r
            JOIN Dogs d ON r.dog_id = d.dog_id
            JOIN Users u ON d.owner_id = u.user_id
            WHERE r.status = 'open'
            `);
        res.json(requests);
    } catch {
        res.status(500).json({ error: 'Failed to fetch walk requests' });
    }
});

// route to return walker summary
app.get('/api/walkers/summary', async (req, res) => {
    try {
        const [summary] = await db.execute(`
            SELECT u.username AS walker_username,
            COUNT(wr.rating_id) AS total_ratings,
            ROUND(AVG(wr.rating), 1) AS average_rating,
            (
                SELECT COUNT(*) FROM WalkRequests r
                JOIN WalkApplications a ON r.request_id = a.request_id
                WHERE a.walker_id = u.user_id AND r.status = 'completed'
            ) AS completed_walks
            FROM Users u
            LEFT JOIN WalkRatings wr ON u.user_id = wr.walker_id
            WHERE u.role = 'walker'
            GROUP BY u.user_id
            `);
        res.json(summary);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch walker summary' });
    }
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

module.exports = app;
