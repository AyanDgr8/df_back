// src/controllers/schedule.js

import connectDB from '../db/index.js';  

// Function to get reminders based on upcoming call times
export const getReminders = async (req, res) => {
    let connection;
    try {
        const pool = await connectDB();
        connection = await pool.getConnection();

        // Check if user exists in request
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const username = req.user.username;

        // Get user's role and team
        const [userInfo] = await connection.execute(`
            SELECT u.role_id, r.role_name, u.team_id, u.id as user_id
            FROM users u
            JOIN roles r ON r.id = u.role_id
            WHERE u.username = ?
        `, [username]);

        if (!userInfo.length) {
            return res.status(404).json({ message: 'User not found' });
        }

        const role = userInfo[0].role_name;
        const teamId = userInfo[0].team_id;

        let sql;
        const params = [];

        // Build query based on role
        const baseFields = `
            c.*, u.team_id,
            TIMESTAMPDIFF(MINUTE, NOW(), c.scheduled_at) as minutes_until_call
        `;

        // Define time thresholds for reminders (15 mins, 5 mins, 1 min)
        const timeCondition = `
            c.scheduled_at IS NOT NULL
            AND c.scheduled_at > NOW()
            AND (
                TIMESTAMPDIFF(MINUTE, NOW(), c.scheduled_at) <= 15
                OR TIMESTAMPDIFF(MINUTE, NOW(), c.scheduled_at) <= 5
                OR TIMESTAMPDIFF(MINUTE, NOW(), c.scheduled_at) <= 1
            )
        `;

        if (role === 'super_admin' || role === 'it_admin' || role === 'business_head') {
            // Can see all reminders
            sql = `
                SELECT ${baseFields}
                FROM customers c
                LEFT JOIN users u ON u.username = c.agent_name
                WHERE ${timeCondition}
                ORDER BY c.scheduled_at ASC
            `;
        } else if (role === 'team_leader') {
            // Can see team's reminders
            sql = `
                SELECT ${baseFields}
                FROM customers c
                JOIN users u ON u.username = c.agent_name
                WHERE u.team_id = ?
                AND ${timeCondition}
                ORDER BY c.scheduled_at ASC
            `;
            params.push(teamId);
        } else {
            // Regular user - can only see their own reminders
            sql = `
                SELECT ${baseFields}
                FROM customers c
                JOIN users u ON u.username = c.agent_name
                WHERE c.agent_name = ?
                AND ${timeCondition}
                ORDER BY c.scheduled_at ASC
            `;
            params.push(username);
        }

        const [rows] = await connection.execute(sql, params);

        // Process reminders to add priority based on time
        const processedRows = rows.map(row => {
            const minutesUntil = row.minutes_until_call;
            let priority;

            if (minutesUntil <= 1) {
                priority = 'high';
            } else if (minutesUntil <= 5) {
                priority = 'high';
            } else if (minutesUntil <= 15) {
                priority = 'medium';
            } else {
                priority = 'low';
            }

            return {
                ...row,
                priority
            };
        });

        res.status(200).json(processedRows);
    } catch (error) {
        console.error('Error fetching reminders:', error);
        res.status(500).json({ message: 'Failed to fetch reminders', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// Function to get all reminders for a user
export const getAllReminders = async (req, res) => {
    let connection;
    try {
        const pool = await connectDB();
        connection = await pool.getConnection();

        // Check if user exists in request
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const username = req.user.username;

        // Get user's role and team
        const [userInfo] = await connection.execute(`
            SELECT u.role_id, r.role_name, u.team_id, u.id as user_id, t.team_name
            FROM users u
            JOIN roles r ON r.id = u.role_id
            LEFT JOIN teams t ON t.id = u.team_id
            WHERE u.username = ?
        `, [username]);

        if (!userInfo.length) {
            return res.status(404).json({ message: 'User not found' });
        }

        const role = userInfo[0].role_name;
        const teamId = userInfo[0].team_id;

        let sql;
        const params = [];

        // Build query based on role
        const baseFields = `
            c.*,
            u.team_id,
            t.team_name,
            TIMESTAMPDIFF(MINUTE, NOW(), c.scheduled_at) as minutes_until_call
        `;

        // Define time thresholds for reminders
        const timeCondition = `
            c.scheduled_at IS NOT NULL
            AND c.scheduled_at > NOW()
        `;

        if (role === 'super_admin' || role === 'it_admin' || role === 'business_head') {
            // Can see all reminders
            sql = `
                SELECT ${baseFields}
                FROM customers c
                LEFT JOIN users u ON u.username = c.agent_name
                LEFT JOIN teams t ON t.id = u.team_id
                WHERE ${timeCondition}
                ORDER BY c.scheduled_at ASC
            `;
        } else if (role === 'team_leader') {
            // Can see team's reminders
            sql = `
                SELECT ${baseFields}
                FROM customers c
                JOIN users u ON u.username = c.agent_name
                LEFT JOIN teams t ON t.id = u.team_id
                WHERE u.team_id = ?
                AND ${timeCondition}
                ORDER BY c.scheduled_at ASC
            `;
            params.push(teamId);
        } else {
            // Regular user - can only see their own reminders
            sql = `
                SELECT ${baseFields}
                FROM customers c
                LEFT JOIN users u ON u.username = c.agent_name
                LEFT JOIN teams t ON t.id = u.team_id
                WHERE c.agent_name = ?
                AND ${timeCondition}
                ORDER BY c.scheduled_at ASC
            `;
            params.push(username);
        }

        const [rows] = await connection.execute(sql, params);

        // Process reminders to categorize by time threshold
        const processedRows = rows.map(row => {
            const minutesUntil = row.minutes_until_call;
            let reminderType;
            let priority;

            if (minutesUntil <= 1) {
                reminderType = '1_minute';
                priority = 'critical';
            } else if (minutesUntil <= 5) {
                reminderType = '5_minutes';
                priority = 'high';
            } else if (minutesUntil <= 15) {
                reminderType = '15_minutes';
                priority = 'medium';
            } else {
                reminderType = 'upcoming';
                priority = 'low';
            }

            return {
                ...row,
                reminderType,
                priority
            };
        });

        res.status(200).json(processedRows);
    } catch (error) {
        console.error('Error fetching all reminders:', error);
        res.status(500).json({ message: 'Failed to fetch all reminders', error: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};
