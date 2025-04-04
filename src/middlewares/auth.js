// src/middlewares/auth.js

import jwt from 'jsonwebtoken';
import dotenv from "dotenv";

dotenv.config();  // Load environment variables

export const authenticateToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(403).json({ message: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // console.log('Decoded token:', decoded);  // Log decoded token to inspect the payload
        req.user = {
            userId: decoded.userId,
            username: decoded.username,
            email: decoded.email,
            role: decoded.role,
            department_id: decoded.department_id ? parseInt(decoded.department_id) : null,
        };
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ message: "Invalid token." });
    }
    
};

export const checkUploadAccess = (req, res, next) => {
    if (req.user.role !== 'Super_Admin' && req.user.role !== 'MIS') {
        return res.status(403).json({ message: "Access denied. Insufficient permissions." });
    }
    next();
};
