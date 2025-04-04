// src/controllers/createMIS.js

import bcrypt from 'bcrypt';
import connectDB from '../db/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const createMIS = async () => {
    // Replace these with your desired values
    const username = 'King Khan';
    const email = 'king@multycomm.com';
    const plainPassword = '12345678';
    
    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        
        // Get database connection from the pool
        const connection = await connectDB();

        // Ensure Team 007 exists
        await connection.query(
            `INSERT INTO departments (name) 
             SELECT 'Team 007' 
             WHERE NOT EXISTS (SELECT * FROM departments WHERE name = 'Team 007')`
        );

        // Get Team 007 department_id
        const [deptRows] = await connection.query(
            'SELECT id FROM departments WHERE name = ?',
            ['Team 007']
        );
        
        // Insert the Super_Admin user
        await connection.query(
            `INSERT INTO users (username, email, password, department_id, status, role)
             VALUES (?, ?, ?, ?, 'active', 'MIS')`,
            [username, email, hashedPassword, deptRows[0].id]
        );

        console.log('MIS created successfully!');
    } catch (error) {
        console.error('Error creating MIS:', error);
    }
};

// Run the function
createMIS();