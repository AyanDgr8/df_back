// src/controllers/roles/createSuperAdmin.js

import bcrypt from 'bcrypt';
import connectDB from '../../db/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const createSuperAdmin = async () => {
    // Super admin credentials
    const username = 'Ayan Khan';
    const email = 'ayandgr5@gmail.com';
    const plainPassword = 'Ayan1012';
    
    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        
        // Get database connection from the pool
        const pool = connectDB();
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Check if username or email already exists
            const [existingUser] = await connection.query(
                'SELECT * FROM users WHERE email = ? OR username = ?',
                [email, username]
            );

            if (existingUser.length > 0) {
                await connection.rollback();
                const message = existingUser[0].email === email ? 'Email already exists' : 'Username already exists';
                console.error(`Error: ${message}`);
                return;
            }

            // Get super_admin role id
            const [roleRows] = await connection.query(
                'SELECT id FROM roles WHERE role_name = ?',
                ['super_admin']
            );

            if (roleRows.length === 0) {
                throw new Error('super_admin role not found');
            }

            // Insert or update the Super Admin user
            await connection.query(
                `INSERT INTO users (username, email, password, role_id)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 password = ?, role_id = ?`,
                [username, email, hashedPassword, roleRows[0].id, hashedPassword, roleRows[0].id]
            );

            await connection.commit();
            console.log('Super Admin created/updated successfully!');

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Error creating Super Admin:', error);
    }
};

// Run the function
createSuperAdmin();

