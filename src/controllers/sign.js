// src/controllers/sign.js

import bcrypt from 'bcrypt'; 
import connectDB from '../db/index.js';  
import jwt from 'jsonwebtoken'; 
import dotenv from "dotenv";
import nodemailer from 'nodemailer';
import crypto from 'crypto';

dotenv.config();  // Load environment variables

// Create nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Register User with department selection and pending approval
export const registerCustomer = async (req, res) => {
    const { username, email, password, department_id } = req.body; 

    try {
        const connection = await connectDB();
        
        // Check if the user already exists
        const [existingUser] = await connection.query('SELECT * FROM users WHERE email = ? OR username = ?', [email, username]);
        if (existingUser.length > 0) {
            return res.status(400).json({ message: 'Username or email already exists' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the new user into the 'users' table with pending status
        const [result] = await connection.query(
            'INSERT INTO users (username, email, password, department_id, status, role) VALUES (?, ?, ?, ?, ?, ?)',
            [username, email, hashedPassword, department_id, 'pending', 'User']
        );

        // Get department admin's email
        const [deptAdmin] = await connection.query(
            'SELECT u.email, u.username FROM users u WHERE u.department_id = ? AND u.role = "Department_Admin"',
            [department_id]
        );

        if (deptAdmin.length > 0) {
            // Generate approval token
            const approvalToken = crypto.randomBytes(32).toString('hex');
            
            // Store approval token
            await connection.query(
                'INSERT INTO approval_tokens (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))',
                [result.insertId, approvalToken]
            );

            // Send email to department admin
            const approvalLink = `${process.env.FRONTEND_URL}/approve-user/${approvalToken}`;
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: deptAdmin[0].email,
                subject: 'New User Registration Approval Required',
                html: `
                    <h2>New User Registration Requires Your Approval</h2>
                    <p>Dear ${deptAdmin[0].username},</p>
                    <p>A new user has registered for your department:</p>
                    <ul>
                        <li>Username: ${username}</li>
                        <li>Email: ${email}</li>
                    </ul>
                    <p>Click the link below to approve or reject this registration:</p>
                    <a href="${approvalLink}" style="display: inline-block; padding: 10px 20px; background-color: #EF6F53; color: white; text-decoration: none; border-radius: 5px;">Review Registration</a>
                    <p>Best regards,<br>FundFloat Team</p>
                `
            };

            await transporter.sendMail(mailOptions);
        } else {
            // No department admin found - notify super admin or handle accordingly
            console.error('No department admin found for department:', department_id);
        }

        // Send success response
        res.status(201).json({ 
            message: 'Registration submitted successfully. Awaiting department admin approval.',
            status: 'pending'
        });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Get departments list
export const getDepartments = async (req, res) => {
    try {
        const connection = await connectDB();
        const [departments] = await connection.query(
            'SELECT id, name FROM departments WHERE name != ? ORDER BY name',
            ['Team 007']
        );
        res.json(departments);
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Handle registration approval/rejection
export const handleRegistrationApproval = async (req, res) => {
    const { token, approved } = req.body;

    try {
        const connection = await connectDB();

        // Get token details and user information
        const [tokenDetails] = await connection.query(
            `SELECT at.user_id, at.expires_at, u.email, u.username, u.department_id,
             (SELECT email FROM users WHERE department_id = u.department_id AND role = 'Department_Admin' LIMIT 1) as admin_email
             FROM approval_tokens at 
             JOIN users u ON at.user_id = u.id 
             WHERE at.token = ? AND at.used = 0`,
            [token]
        );

        if (tokenDetails.length === 0) {
            return res.status(400).json({ message: 'Invalid or expired token' });
        }

        const tokenRecord = tokenDetails[0];

        // Check if token is expired
        if (new Date(tokenRecord.expires_at) < new Date()) {
            return res.status(400).json({ message: 'Approval link has expired' });
        }

        // Add to users_history for both approved and rejected cases
        await connection.query(
            'INSERT INTO users_history (username, email, status, department_admin_email) VALUES (?, ?, ?, ?)',
            [tokenRecord.username, tokenRecord.email, approved ? 'active' : 'reject', tokenRecord.admin_email]
        );

        if (approved) {
            // Update user status to active
            await connection.query(
                'UPDATE users SET status = ? WHERE id = ?',
                ['active', tokenRecord.user_id]
            );
        } else {
            // If rejected, delete from users table
            await connection.query(
                'DELETE FROM users WHERE id = ?',
                [tokenRecord.user_id]
            );
        }

        // Mark token as used
        await connection.query(
            'UPDATE approval_tokens SET used = 1 WHERE token = ?',
            [token]
        );

        // Send email notification to user
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: tokenRecord.email,
            subject: `Registration ${approved ? 'Approved' : 'Rejected'}`,
            html: `
                <h2>Registration ${approved ? 'Approved' : 'Rejected'}</h2>
                <p>Hello ${tokenRecord.username},</p>
                <p>Your registration has been ${approved ? 'approved' : 'rejected'} by the department admin.</p>
                ${approved ? `
                    <p>You can now login to your account using your email and password.</p>
                    <a href="${process.env.FRONTEND_URL}/login" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Login Now</a>
                ` : '<p>Please contact your department administrator if you have any questions.</p>'}
                <p>Best regards,<br>FundFloat Team</p>
            `
        };

        await transporter.sendMail(mailOptions);

        res.json({ 
            message: `Registration ${approved ? 'approved' : 'rejected'} successfully`,
            status: approved ? 'active' : 'rejected'
        });
    } catch (error) {
        console.error('Error handling registration approval:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Login User
export const loginCustomer = async (req, res) => {
    const { email, password } = req.body; 

    try {
        const connection = await connectDB();

        // Check if the user exists with role and status information
        const [users] = await connection.query(`
            SELECT u.id, u.username, u.email, u.role, u.status, u.department_id, d.name as department_name,
                   u.password  
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE u.email = ?
        `, [email]);
        
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = users[0];

        // Check user status
        if (user.status === 'pending') {
            return res.status(403).json({ 
                message: 'Your registration is pending approval. Please wait for the department admin to approve your account.',
                status: 'pending'
            });
        }

        if (user.status === 'rejected') {
            return res.status(403).json({ 
                message: 'Your registration has been rejected. Please contact your department administrator.',
                status: 'rejected'
            });
        }
        
        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid password' });
        }

        // Create JWT token
        const token = jwt.sign(
            { 
                userId: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                department_id: user.department_id
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Send success response with token
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                department_id: user.department_id,
                department_name: user.department_name
            }
        });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Logout User
export const logoutCustomer = async (req, res) => {
    const userId = req.user.userId;  // Assuming you have middleware that attaches user info to req

    try {
        const connection = await connectDB();

        // Update the logout_time for the user's latest login record
        await connection.query(
            'UPDATE login_history SET logout_time = NOW() WHERE user_id = ? AND logout_time IS NULL',
            [userId]
        );

        res.status(200).json({ message: 'User logged out successfully' });
    } catch (error) {
        console.error('Error during logout:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};


// Fetch Current User
export const fetchCurrentUser = async (req, res) => {
    try {
        // Log incoming request user data
        // console.log('Request user data:', req.user);

        const connection = await connectDB();

        // Retrieve the user's information based on their ID
        const [users] = await connection.query(`
            SELECT u.id, u.username, u.email, u.role, u.department_id, d.name as department_name
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE u.id = ?
        `, [req.user.userId]);
        
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = users[0];

        // Log user data from database
        // console.log('User data from database:', {
        //     id: user.id,
        //     username: user.username,
        //     role: user.role,
        //     department_id: user.department_id,
        //     department_name: user.department_name
        // });

        // Send success response with user information
        res.status(200).json({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            department_id: user.department_id ? parseInt(user.department_id) : null,
            department_name: user.department_name
        });
    } catch (error) {
        console.error('Error fetching current user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Forgot Password
export const forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const connection = await connectDB();

        // Check if user exists
        const [users] = await connection.query('SELECT id, email, username FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = users[0];
        
        // Generate a temporary token (this won't be stored in DB)
        const tempToken = crypto.createHash('sha256')
            .update(user.id + user.email + Date.now().toString())
            .digest('hex');

        // Create reset URL
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4000'}/reset-password/${tempToken}`;

        // Send email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset Request',
            html: `
                <h1>Password Reset Request</h1>
                <p>Hello ${user.username},</p>
                <p>You requested a password reset. Click the link below to reset your password:</p>
                <a href="${resetUrl}" style="
                    background-color: #EF6F53;
                    color: white;
                    padding: 10px 20px;
                    text-decoration: none;
                    border-radius: 5px;
                    display: inline-block;
                    margin: 20px 0;
                ">Reset Password</a>
                <p>If you didn't request this, please ignore this email.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'Password reset link has been sent to your email' });

    } catch (error) {
        console.error('Error in forgot password:', error);
        res.status(500).json({ message: 'Failed to send reset email' });
    }
};

// Send OTP (Reset Password Link)
export const sendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        const connection = await connectDB();
        
        // Check if the user exists
        const [users] = await connection.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            return res.status(400).json({ 
                message: 'The email address you entered is not associated with an account.' 
            });
        }

        const user = users[0];

        // Generate token with user ID
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "20m" });
        const resetLink = `${process.env.FRONTEND_URL}/reset-password/${user.id}/${token}`;

        // Mail options
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset Request - FundFloat',
            html: `
                <h2>Password Reset Request</h2>
                <p>Dear ${user.username},</p>
                <p>We received a request to reset your password. Here are your account details:</p>
                <ul>
                    <li>Username: ${user.username}</li>
                    <li>Email: ${email}</li>
                </ul>
                <p>Click the link below to reset your password:</p>
                <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #EF6F53; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
               
                <p>If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
                <p>Best regards,<br>FundFloat Team</p>
            `
        };

        // Send mail using Promise
        await transporter.sendMail(mailOptions);
        return res.status(200).json({ 
            message: 'Password reset link has been sent to your email. Please check your inbox.' 
        });

    } catch (error) {
        console.error('Error sending link:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Reset Password with Token
export const resetPasswordWithToken = async (req, res) => {
    try {
        const { id, token } = req.params;
        const { newPassword } = req.body;

        // Verify token
        jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
            if (err) {
                return res.status(400).json({ message: "Invalid or expired token" });
            }

            // Verify that the token was generated for this user
            if (decoded.userId !== parseInt(id)) {
                return res.status(400).json({ message: "Invalid token for this user" });
            }

            try {
                const connection = await connectDB();
                
                // Hash the new password
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                
                // Update password only - updated_at will be automatically updated
                await connection.query(
                    'UPDATE users SET password = ? WHERE id = ?',
                    [hashedPassword, id]
                );

                res.status(200).json({ message: 'Password reset successful' });
            } catch (error) {
                console.error('Error updating password:', error);
                res.status(500).json({ message: 'Failed to update password' });
            }
        });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Reset Password
export const resetPassword = async (req, res) => {
    const { email, newPassword } = req.body;

    try {
        const connection = await connectDB();

        // Find user by email
        const [users] = await connection.query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(400).json({ message: 'User not found' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await connection.query(
            'UPDATE users SET password = ? WHERE email = ?',
            [hashedPassword, email]
        );

        res.status(200).json({ message: 'Password reset successful' });

    } catch (error) {
        console.error('Error in reset password:', error);
        res.status(500).json({ message: 'Failed to reset password' });
    }
};
