// src/routes/teamRoutes.js

import express from 'express';
import { createTeam, getAllTeams } from '../controllers/teams.js';
import { createUser, getAllUsers } from '../controllers/users.js';
import { authenticateToken } from '../middlewares/auth.js';

const router = express.Router();

// Team routes
router.post('/players/teams', authenticateToken, createTeam);
router.get('/players/teams', authenticateToken, getAllTeams);

// User management routes
router.post('/players/users', authenticateToken, createUser);
router.get('/players/users', authenticateToken, getAllUsers);

export default router;
