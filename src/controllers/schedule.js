// src/controllers/schedule.js

import connectDB from '../db/index.js';  

// Function to get reminders based on upcoming call times
export const getReminders = async (req, res) => {
    let connection;
    try {
        const pool = await connectDB(); // Get the connection pool
        connection = await pool.getConnection(); // Get a connection from the pool

        // Check if user exists in request
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const now = new Date();
        
        const sql = `
            SELECT *
            FROM customers 
            WHERE scheduled_at IS NOT NULL
            AND scheduled_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 1 MINUTE)
            AND agent_name = ?
        `;

        const [rows] = await connection.execute(sql, [req.user.username]);

        const reminders = rows.map(row => {
            const timeDiff = new Date(row.scheduled_at) - now;
            let message = '';

            if (timeDiff <= 60 * 60 * 1000 && timeDiff > 5 * 60 * 1000) {
                message = `Call is scheduled for ${row.scheduled_at} - Reminder: 1 hour before`;
            } else if (timeDiff <= 5 * 60 * 1000 && timeDiff > 60 * 1000) {
                message = `Call is scheduled for ${row.scheduled_at} - Reminder: 5 minutes before`;
            } else if (timeDiff <= 60 * 1000) {
                message = `Call is scheduled for ${row.scheduled_at} - Reminder: 1 minute before`;
            }

            return {
                ...row, // Include all fields from the database
                message // Add the message field
            };
        });

        res.status(200).json(reminders);
    } catch (error) {
        console.error('Error fetching reminders:', error);
        res.status(500).json({ message: 'Failed to fetch reminders', error: error.message });
    } finally {
        if (connection) {
            connection.release(); // Ensure the connection is released back to the pool
        }
    }
};

// Function to get all reminders with specific fields
export const getAllReminders = async (req, res) => {
    let connection;
    try {
        const pool = await connectDB(); // Get the connection pool
        connection = await pool.getConnection(); // Get a connection from the pool

        // Check if user exists in request
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const sql = `
            SELECT *
            FROM customers
            WHERE agent_name = ?
            ORDER BY last_updated DESC
        `;

        const [rows] = await connection.execute(sql, [req.user.username]);

        const allReminders = rows.map(row => ({
            ...row // Include all fields from the database
        }));

        res.status(200).json(allReminders);
    } catch (error) {
        console.error('Error fetching all reminders:', error);
        res.status(500).json({ message: 'Failed to fetch all reminders', error: error.message });
    } finally {
        if (connection) {
            connection.release(); // Ensure the connection is released back to the pool
        }
    }
};