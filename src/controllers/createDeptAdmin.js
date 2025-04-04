// src/controllers/createDeptAdmin.js

import bcrypt from 'bcrypt';
import connectDB from '../db/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const createDeptAdmin = async () => {
    // Replace these with your desired values
    const username = 'Aveek Admin';
    const email = 'aveek.admin@fundfloat.com';
    const plainPassword = '12345678';
    const departmentName = 'Team Aveek';
    
    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        
        // Get database connection from the pool
        const connection = await connectDB();

        // Ensure the department exists
        await connection.query(
            `INSERT INTO departments (name) 
             SELECT ? 
             WHERE NOT EXISTS (SELECT * FROM departments WHERE name = ?)`,
            [departmentName, departmentName]
        );

        // Get the department ID
        const [deptRows] = await connection.query(
            'SELECT id FROM departments WHERE name = ?',
            [departmentName]
        );

        // Insert or update the Department_Admin user
        await connection.query(
            `INSERT INTO users (username, email, password, department_id, status, role)
             VALUES (?, ?, ?, ?, 'active', 'Department_Admin')
             ON DUPLICATE KEY UPDATE
             role = 'Department_Admin', 
             department_id = ?`,
            [username, email, hashedPassword, deptRows[0].id, deptRows[0].id]
        );

        console.log('Department Admin created successfully!');
    } catch (error) {
        console.error('Error creating Department Admin:', error);
    }
};

// Run the function
createDeptAdmin();
