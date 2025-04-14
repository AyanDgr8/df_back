// src/controllers/customers.js

import connectDB from '../db/index.js';  

export const searchCustomers = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const connection = await connectDB();
    let sql;
    let params;

    const userRole = req.user.role || 'user';
    const searchParam = `%${query}%`;
    
    // Define searchable fields based on new schema
    const searchFields = [
      'c.loan_card_no', 'c.c_name', 'c.CRN', 'c.product', 'c.bank_name', 'c.banker_name',
      'c.agent_name', 'c.tl_name', 'c.fl_supervisor', 'c.DPD_vintage',
      'c.POS', 'c.emi_AMT', 'c.loan_AMT', 'c.paid_AMT', 'c.paid_date',
      'c.settl_AMT', 'c.shots',
      'c.resi_address', 'c.pincode', 'c.office_address', 
      'c.mobile', 'c.ref_mobile', 
      'c.mobile_3', 'c.mobile_4', 'c.mobile_5', 'c.mobile_6', 'c.mobile_7', 'c.mobile_8',
      'c.calling_code', 'c.calling_feedback',
      'c.field_feedback', 'c.new_track_no', 'c.field_code', 'c.C_unique_id',
      'c.last_updated', 'c.id'
    ];

    const searchConditions = searchFields.map(field => `${field} LIKE ?`).join(' OR ');

    // Build the base query with role-based access control
    if (userRole === 'team_leader') {
      sql = `
        SELECT DISTINCT c.* 
        FROM customers c
        INNER JOIN users u ON c.agent_name = u.username
        WHERE u.team_id = ? AND (${searchConditions})
      `;
      params = [req.user.team_id, ...searchFields.map(() => searchParam)];
    } else if (userRole === 'user') {
      sql = `
        SELECT c.* FROM customers c
        WHERE c.agent_name = ? AND (${searchConditions})
      `;
      params = [req.user.username, ...searchFields.map(() => searchParam)];
    } else if (['super_admin', 'it_admin', 'business_head'].includes(userRole.toLowerCase())) {
      // Admins can search all records
      sql = `
        SELECT c.* FROM customers c
        WHERE ${searchConditions}
      `;
      params = searchFields.map(() => searchParam);
    } else {
      return res.status(403).json({ message: 'Unauthorized role' });
    }

    // Add ORDER BY and LIMIT
    sql += ' ORDER BY c.last_updated DESC LIMIT 100';

    const [results] = await connection.execute(sql, params);
    
    return res.json({
      success: true,
      data: results,
      count: results.length
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Error searching customers', error: error.message });
  }
};

// *****************

export const getAllCustomers = async (req, res) => {
  const pool = await connectDB();
  let connection;
  try {
    console.log('Request user:', req.user);
    
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    connection = await pool.getConnection();
    let sql;
    let params;

    const userRole = req.user.role;
    console.log('User role in getAllCustomers:', userRole);

    // Get user permissions first
    const [permissions] = await connection.query(
      `SELECT p.permission_name 
       FROM permissions p 
       JOIN user_permissions up ON p.id = up.permission_id 
       WHERE up.user_id = ? AND up.value = true`,
      [req.user.userId]
    );
    
    const userPermissions = permissions.map(p => p.permission_name);
    console.log('User permissions:', userPermissions);

    // Build query based on user role and permissions
    if (userRole === 'super_admin') {
      sql = 'SELECT * FROM customers ORDER BY last_updated DESC';
      params = [];
    } else if (userRole === 'team_leader' && userPermissions.includes('view_team_customers')) {
      // Team leaders see their team's customers
      sql = `
        SELECT c.* FROM customers c
        JOIN users u ON (c.agent_name = u.username)
        WHERE u.team_id = ?
        ORDER BY c.last_updated DESC, c.id DESC
      `;
      params = [req.user.team_id];
    } else if (userRole === 'user' && userPermissions.includes('view_assigned_customers')) {
      // Regular users see only their assigned customers
      sql = `
        SELECT * FROM customers 
        WHERE agent_name = ?
        ORDER BY last_updated DESC
      `;
      params = [req.user.username];
    } else {
      // Default case - users with view_customer permission see all customers
      sql = 'SELECT * FROM customers ORDER BY last_updated DESC';
      params = [];
    }

    console.log('Executing SQL:', sql, 'with params:', params);
    const [results] = await connection.query(sql, params);
    console.log('Query results:', results);

    res.json({
      success: true,
      data: results,
      count: results.length,
      role: req.user.role,
      permissions: userPermissions
    });

  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customers',
      error: error.message,
      details: error.stack
    });
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (err) {
        console.error('Error releasing connection:', err);
      }
    }
  }
};


// *****************

// Helper function to get available users
const getAvailableUsers = async (connection) => {
  try {
    const [users] = await connection.execute(
      'SELECT username FROM users'
    );
    return users.map(u => u.username);
  } catch (error) {
    console.error('Error getting available users:', error);
    return [];
  }
};
// *****************


// ***********

export const viewCustomer = async (req, res) => {
  const uniqueId = req.params.uniqueId; // Get the unique customer ID from the request parameters

  try {
    // Check if user exists in request
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const connection = await connectDB(); 

    // SQL query to retrieve customer details by unique ID
    const query = `SELECT * FROM customers WHERE C_unique_id = ? ORDER BY last_updated DESC, id DESC`;
    const [rows] = await connection.execute(query, [uniqueId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.status(200).json(rows[0]); // Return the first (and should be only) customer found
  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).json({ message: 'Failed to fetch customer details' });
  }
};
// ******************


// ***********
// Function to get list of users for agent assignment
export const getUsers = async (req, res) => {
    try {
        // Check if user exists in request
        if (!req.user) {
          return res.status(401).json({ message: 'Authentication required' });
        }

        const connection = await connectDB();
        let query;
        let params = [];

        // If team_leader, only show users from their team
        if (req.user.role === 'team_leader' && req.user.team_id) {
            query = `
                SELECT u.id, u.username, u.role
                FROM users u
                WHERE u.username IS NOT NULL
                AND u.team_id = ?
                ORDER BY u.username
            `;
            params = [req.user.team_id];
        } else {
            // Super_Admin can see all users
            query = `
                SELECT id, username, role
                FROM users 
                WHERE username IS NOT NULL
                ORDER BY username
            `;
        }
        
        // Execute query and send response
        const [users] = await connection.execute(query, params);
        res.json(users);

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            message: 'Failed to fetch users',
            error: error.message
        });
    }
};

// New function to assign customer to team
export const assignCustomerToTeam = async (req, res) => {
  let connection;
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const pool = connectDB();
    connection = await pool.getConnection();

    // Check if user has permission to assign customers
    const userRole = req.user.role;
    const isAdmin = ['super_admin', 'it_admin', 'business_head'].includes(userRole);
    const isTeamLeader = userRole === 'team_leader';

    if (!isAdmin && !isTeamLeader) {
      return res.status(403).json({ error: 'Access denied. Only admins and team leaders can assign customers.' });
    }

    const { agent_id, customer_ids } = req.body;
    console.log('Assignment request:', { agent_id, customer_ids, userRole });

    // Validate input
    if (!agent_id || !customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
      return res.status(400).json({ error: 'Invalid input. Please provide agent_id and customer_ids.' });
    }

    // Get agent details including username for customer assignment
    const [agents] = await connection.query(
      'SELECT id, username, team_id, role_id FROM users WHERE id = ?',
      [agent_id]
    );

    if (agents.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = agents[0];

    // For team leaders, verify they are assigning to their own team members
    if (isTeamLeader) {
      const teamLeaderTeamId = req.user.team_id;

      if (!teamLeaderTeamId) {
        return res.status(403).json({ 
          error: 'Team leader team information not found',
          details: {
            user: req.user.username,
            role: req.user.role
          }
        });
      }

      if (agent.team_id !== teamLeaderTeamId) {
        return res.status(403).json({ 
          error: 'Cannot assign customers to users outside your team',
          details: {
            user: req.user.username,
            role: req.user.role,
            team_id: teamLeaderTeamId,
            agent_team_id: agent.team_id
          }
        });
      }

      // Check if customers are already assigned to other teams
      const [customerAgents] = await connection.query(
        'SELECT c.id, c.agent_name, u.team_id ' +
        'FROM customers c ' +
        'LEFT JOIN users u ON c.agent_name = u.username ' +
        'WHERE c.id IN (?)',
        [customer_ids]
      );

      const invalidCustomers = customerAgents.filter(c => 
        c.agent_name !== null && c.team_id !== null && c.team_id !== teamLeaderTeamId
      );

      if (invalidCustomers.length > 0) {
        return res.status(403).json({ 
          error: 'Some customers are already assigned to other teams',
          details: {
            invalidCustomerIds: invalidCustomers.map(c => c.id)
          }
        });
      }
    }

    // Begin transaction
    await connection.beginTransaction();

    try {
      // Update customer assignments using the agent's username
      await connection.query(
        'UPDATE customers SET agent_name = ?, tl_name = ? WHERE id IN (?)',
        [agent.username, req.user.username, customer_ids]
      );

      await connection.commit();

      res.json({
        success: true,
        message: 'Customers assigned successfully',
        details: {
          agent_name: agent.username,
          tl_name: req.user.username,
          customer_count: customer_ids.length
        }
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Error assigning customers:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


// ******************


// New function to get teams list
export const getTeams = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const connection = await connectDB();
    let query;
    let params = [];

    if (req.user.role === 'super_admin' || req.user.role === 'it_admin' || req.user.role === 'business_head') {
      // Super_Admin, IT Admin and Business Head can see all teams
      query = 'SELECT id, name FROM teams ORDER BY name';
    } else if (req.user.role === 'team_leader') {
      // team_leader can only see their team
      query = 'SELECT id, name FROM teams WHERE id = ?';
      params = [req.user.team_id];
    } else {
      // Regular users can only see their assigned team
      query = `
        SELECT t.id, t.name 
        FROM teams t
        INNER JOIN users u ON t.id = u.team_id
        WHERE u.username = ?
      `;
      params = [req.user.username];
    }

    const [rows] = await connection.execute(query, params);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ message: 'Failed to fetch teams' });
  }
};


// Add this new function to check for duplicates
export const checkDuplicates = async (req, res) => {
    try {
        const connection = await connectDB();
        const { currentCustomerId, mobile, CRN } = req.body;
        
        const conditions = [];
        const params = [currentCustomerId]; // Start with customerId for the != condition
        const duplicates = [];

        // Helper to check if value is non-null and non-empty
        const isValidValue = (value) => {
            return value !== null && value !== undefined && value.toString().trim() !== '';
        };

        // Add conditions for each field that needs to be checked
        if (isValidValue(CRN)) {
            conditions.push('(CRN = ? AND CRN IS NOT NULL AND CRN != "")');
            params.push(CRN);
        }

        if (conditions.length > 0) {
            const [existRecords] = await connection.query(`
                SELECT id, mobile, CRN, c_name
                FROM customers 
                WHERE id != ? ${conditions.length > 0 ? 'AND (' + conditions.join(' OR ') + ')' : ''}
            `, params);

            // Check which fields are in use and push detailed error messages
            if (existRecords.length > 0) {
                existRecords.forEach(record => {
                    const customerInfo = `${record.c_name} `;
                    
                    if (isValidValue(mobile) && isValidValue(record.mobile) && record.mobile === mobile) {
                        duplicates.push(`Phone number ${mobile} is already registered with customer ${customerInfo}`);
                    }
                    if (isValidValue(CRN) && isValidValue(record.CRN) && record.CRN === CRN) {
                        duplicates.push(`CRN ${CRN} is already registered with customer ${customerInfo}`);
                    }
                });
            }
        }

        res.status(200).json({
            duplicates,
            hasDuplicates: duplicates.length > 0
        });

    } catch (error) {
        console.error('Error checking duplicates:', error);
        res.status(500).json({ 
            message: 'Error checking for duplicates', 
            error: error.message 
        });
    }
};

// ****************

// Function to get team records with field mapping
export const getTeamRecords = async (req, res) => {
  try {
      const connection = await connectDB();
      const query = `SELECT c_name, mobile FROM customers ORDER BY last_updated DESC, id DESC`;
      const [records] = await connection.query(query);

      // Check if request body is empty
      const hasBody = req.body && Object.keys(req.body).length > 0;
      
      // If no body, return records directly
      if (!hasBody) {
        return res.status(200).json({
          success: true,
          count: records.length,
          data: records
        });
      }

      // If body exists, apply field mapping
      const { first_name = "c_name", number = "mobile" } = req.body;
      const mappedRecords = records.map(record => ({
        [first_name]: record.c_name,
        [number]: record.mobile,
        priority: "1"
      }));

      return res.status(200).json({
        success: true,
        count: mappedRecords.length,
        data: mappedRecords
      });

  } catch (error) {
      console.error("Error in getTeamRecords:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
  }
};

// ******************

// Function to get customers by last_updated date range
export const getCustomersByDateRange = async (req, res) => {
    let connection;
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }

        // Convert dates to MySQL format
        const start = new Date(startDate);
        const end = new Date(endDate);
        // Set end date to end of day
        end.setHours(23, 59, 59, 999);

        const pool = await connectDB();
        connection = await pool.getConnection();

        const [results] = await connection.query(
            `SELECT * FROM customers 
             WHERE last_updated >= ? AND last_updated <= ?
             ORDER BY last_updated DESC`,
            [start, end]
        );

        res.json({
            success: true,
            data: results,
            count: results.length,
            dateRange: {
                start: start.toISOString(),
                end: end.toISOString()
            }
        });

    } catch (error) {
        console.error('Error fetching customers by date range:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching customers',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

// **********
