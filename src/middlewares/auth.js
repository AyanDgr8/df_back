// src/middlewares/auth.js

import jwt from 'jsonwebtoken';
import dotenv from "dotenv";

dotenv.config();  // Load environment variables

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(403).json({ message: "Access denied. No token provided." });
    }

    // Validate token format
    if (typeof token !== 'string' || !/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(token)) {
        return res.status(401).json({ message: "Invalid token format." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Decoded token:', decoded);

        if (!decoded.userId || !decoded.role) {
            console.error('Invalid token payload:', decoded);
            return res.status(401).json({ 
                success: false,
                message: "Invalid token payload" 
            });
        }

        req.user = {
            userId: decoded.userId,
            username: decoded.username,
            email: decoded.email,
            role: decoded.role,
            team_id: decoded.team_id ? parseInt(decoded.team_id) : null,
            permissions: decoded.permissions || []
        };

        console.log('Set request user:', req.user);
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ message: "Invalid token." });
    }
    
};

export const checkUploadAccess = (req, res, next) => {
    if (req.user.role !== 'super_admin' && req.user.role !== 'it_admin') {
        return res.status(403).json({ message: "Access denied. Insufficient permissions." });
    }
    next();
};
