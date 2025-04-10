// src/controllers/teams.js

import connectDB from '../db/index.js';

// Create a new team
export const createTeam = async (req, res) => {
    const { team_name } = req.body;
    const created_by = req.user.userId; // Get userId from auth middleware

    try {
        const pool = connectDB();
        const conn = await pool.getConnection();

        try {
            await conn.beginTransaction();

            // Check if team already exists
            const [existingTeam] = await conn.query(
                'SELECT id FROM teams WHERE team_name = ?',
                [team_name]
            );

            if (existingTeam.length > 0) {
                await conn.rollback();
                return res.status(400).json({ error: 'Team name already exists' });
            }

            // Create new team
            const [result] = await conn.query(
                'INSERT INTO teams (team_name, created_by) VALUES (?, ?)',
                [team_name, created_by]
            );

            await conn.commit();
            res.status(201).json({
                message: 'Team created successfully',
                team_id: result.insertId
            });

        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }

    } catch (error) {
        console.error('Error creating team:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Get all teams
export const getAllTeams = async (req, res) => {
    const pool = connectDB();
    let connection;
    try {
        connection = await pool.getConnection();

        // Get all teams with creator information
        const [teams] = await connection.query(
            'SELECT t.*, u.username as created_by_name FROM teams t JOIN users u ON t.created_by = u.id ORDER BY t.created_at DESC'
        );

        res.json(teams);

    } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};
