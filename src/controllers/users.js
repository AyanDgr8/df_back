// src/controllers/users.js

import connectDB from '../db/index.js';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';

// Create a new user
export const createUser = async (req, res) => {
    console.log('Received user creation request:', req.body);

    const {
        username,
        email,
        team_id,
        role_type, // 'user' or 'team_leader'
        permissions
    } = req.body;

    // Validate required fields
    if (!username || !email || !role_type) {
        console.log('Missing fields:', { username, email, role_type });
        return res.status(400).json({ 
            error: 'Missing required fields: username, email, and role_type are required',
            received: { username, email, role_type }
        });
    }

    // Validate team_id based on role_type
    if (role_type !== 'business_head' && !team_id) {
        console.log('Team ID required for non-business_head roles');
        return res.status(400).json({ 
            error: 'Team ID is required for user and team_leader roles',
            received: { role_type, team_id }
        });
    }

    // For business_head, team_id should be null
    if (role_type === 'business_head' && team_id) {
        console.log('Team ID should not be provided for business_head role');
        return res.status(400).json({ 
            error: 'Business head should not be assigned to any team',
            received: { role_type, team_id }
        });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate role type
    if (!['user', 'team_leader', 'business_head'].includes(role_type)) {
        return res.status(400).json({ error: 'Invalid role type. Must be either "user", "team_leader", or "business_head"' });
    }

    try {
        const pool = connectDB();
        const conn = await pool.getConnection();

        try {
            await conn.beginTransaction();

            // Check if user already exists
            const [existingUser] = await conn.query(
                'SELECT * FROM users WHERE email = ? OR username = ?',
                [email, username]
            );

            if (existingUser.length > 0) {
                await conn.rollback();
                const message = existingUser[0].email === email ? 'Email already exists' : 'Username already exists';
                return res.status(400).json({ error: message });
            }

            // Get role id
            const [roleResult] = await conn.query(
                'SELECT id FROM roles WHERE role_name = ?',
                [role_type]
            );

            if (roleResult.length === 0) {
                await conn.rollback();
                return res.status(400).json({ error: 'Invalid role type' });
            }

            // Use default password '12345678'
            const defaultPassword = '12345678';
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);

            // Create user
            const [userResult] = await conn.query(
                'INSERT INTO users (username, email, password, team_id, role_id) VALUES (?, ?, ?, ?, ?)',
                [username, email, hashedPassword, role_type === 'business_head' ? null : team_id, roleResult[0].id]
            );

            // Handle permissions
            if (permissions) {
                const userId = userResult.insertId;
                
                // First delete any existing permissions for this user
                await conn.query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
                
                // Get all permission IDs
                const [permissionRows] = await conn.query('SELECT id, permission_name FROM permissions');
                
                // Insert each permission individually to better handle errors
                for (const [permName, value] of Object.entries(permissions)) {
                    const permission = permissionRows.find(p => p.permission_name === permName);
                    if (permission) {
                        await conn.query(
                            'INSERT INTO user_permissions (user_id, permission_id, value) VALUES (?, ?, ?)',
                            [userId, permission.id, value ? 1 : 0]
                        );
                    }
                }
            }

            // Send welcome email
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Welcome to Digital Flow',
                html: `
                    <h2>Welcome ${username}!</h2>
                    <p>Your account has been created successfully.</p>
                    <p>You can now login to your account using your email and the default password: <strong>12345678</strong></p>
                    <p>Please change your password after your first login.</p>
                    <a href="${process.env.FRONTEND_URL}/login" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Login Now</a>
                    <p>Best regards,<br>Digital Flow Team</p>
                `
            };

            await transporter.sendMail(mailOptions);
            await conn.commit();

            res.status(201).json({
                message: 'User created successfully. Welcome email has been sent.',
                user_id: userResult.insertId
            });

        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }

    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get all users with their teams and permissions
export const getAllUsers = async (req, res) => {
    const pool = connectDB();
    let connection;
    try {
        connection = await pool.getConnection();

        // Base query to get user information
        let query = `
            SELECT u.id, u.username, u.email, u.team_id, t.team_name,
                   r.role_name as role, r.id as role_id,
                   GROUP_CONCAT(DISTINCT p.permission_name) as permissions
            FROM users u
            LEFT JOIN teams t ON u.team_id = t.id
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN user_permissions up ON u.id = up.user_id
            LEFT JOIN permissions p ON up.permission_id = p.id AND up.value = true
        `;

        const params = [];

        // Add role-based filters
        if (req.user.role === 'team_leader') {
            // Team leaders can only see their team members
            query += ' WHERE u.team_id = ? AND r.role_name = "user"';
            params.push(req.user.team_id);
        } else if (!['super_admin', 'it_admin', 'business_head'].includes(req.user.role)) {
            // Regular users can't see any other users
            return res.status(403).json({ error: 'Access denied' });
        }

        // Group by and order
        query += ' GROUP BY u.id ORDER BY u.created_at DESC';

        // Execute query
        const [users] = await connection.query(query, params);

        // Format permissions as array for each user
        const formattedUsers = users.map(user => ({
            ...user,
            permissions: user.permissions ? user.permissions.split(',') : []
        }));

        res.json({
            success: true,
            data: formattedUsers
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// Get team members for a specific team
export const getTeamMembers = async (req, res) => {
    const pool = connectDB();
    let connection;
    try {
        connection = await pool.getConnection();

        // Verify the requester has access to this team
        if (req.user.role === 'team_leader' && req.user.team_id !== parseInt(req.params.teamId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get team members
        const [users] = await connection.query(`
            SELECT u.id, u.username, u.email, u.team_id, t.team_name,
                   r.role_name as role, r.id as role_id,
                   GROUP_CONCAT(DISTINCT p.permission_name) as permissions
            FROM users u
            LEFT JOIN teams t ON u.team_id = t.id
            LEFT JOIN roles r ON u.role_id = r.id
            LEFT JOIN user_permissions up ON u.id = up.user_id
            LEFT JOIN permissions p ON up.permission_id = p.id AND up.value = true
            WHERE u.team_id = ? AND r.role_name = 'user'
            GROUP BY u.id
            ORDER BY u.created_at DESC
        `, [req.params.teamId]);

        // Format permissions as array for each user
        const formattedUsers = users.map(user => ({
            ...user,
            permissions: user.permissions ? user.permissions.split(',') : []
        }));

        res.json({
            success: true,
            data: formattedUsers
        });
    } catch (error) {
        console.error('Error fetching team members:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};
