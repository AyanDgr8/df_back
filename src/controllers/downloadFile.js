// src/controllers/downloadFile.js

import connectDB from '../db/index.js';

export const downloadCustomerData = async (req, res) => {
    console.log('Download request received:', req.query);
    const pool = await connectDB();
    const connection = await pool.getConnection();

    try {
        const { startDate, endDate } = req.query;
        console.log('Dates received:', { startDate, endDate });

        if (!startDate || !endDate) {
            console.log('Missing dates');
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        // Get user information
        const userId = req.user?.userId;
        console.log('User ID:', userId);

        const [userResult] = await connection.query(
            'SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?',
            [userId]
        );
        console.log('User result:', userResult[0]);

        if (userResult.length === 0) {
            return res.status(401).json({ message: 'User not found' });
        }

        const user = userResult[0];
        let query = `
            SELECT 
                c.loan_card_no, c.c_name, c.product, c.CRN, c.bank_name,
                c.banker_name, c.agent_name, c.tl_name, c.fl_supervisor,
                c.DPD_vintage, c.POS, c.emi_AMT, c.loan_AMT, c.paid_AMT,
                c.paid_date, c.settl_AMT, c.shots, c.resi_address, c.pincode,
                c.office_address, c.mobile, c.ref_mobile, 
                c.mobile_3, c.mobile_4, c.mobile_5, c.mobile_6, c.mobile_7, c.mobile_8,
                c.calling_code,
                c.calling_feedback, c.field_feedback, c.new_track_no,
                c.field_code, c.C_unique_id, c.date_created, c.last_updated,
                c.scheduled_at
            FROM customers c
            WHERE DATE(c.date_created) BETWEEN DATE(?) AND DATE(?)
        `;

        const params = [startDate, endDate];

        // Apply role-based filters
        if (!['super_admin', 'it_admin', 'business_head'].includes(user.role_name)) {
            if (user.role_name === 'team_leader') {
                // Team leaders can see their team's data
                query += ' AND c.agent_name IN (SELECT username FROM users WHERE team_id = ?)';
                params.push(user.team_id);
            } else {
                // Regular users can only see their own data
                query += ' AND c.agent_name = ?';
                params.push(user.username);
            }
        }

        query += ' ORDER BY c.date_created DESC';
        
        console.log('Final query:', query);
        console.log('Query params:', params);

        const [results] = await connection.query(query, params);
        console.log('Query results count:', results.length);

        res.json({
            success: true,
            data: results,
            query: { startDate, endDate },
            userRole: user.role_name
        });

    } catch (error) {
        console.error('Error downloading data:', error);
        res.status(500).json({ 
            message: 'Error downloading data',
            error: error.message 
        });
    } finally {
        connection.release();
    }
};