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
      'c.resi_address', 'c.pincode', 'c.office_address', 'c.mobile',
      'c.ref_mobile', 'c.calling_code', 'c.calling_feedback',
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

export const updateCustomer = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Check if user has edit_customer permission or is an admin
    const isAdmin = req.user.role === 'it_admin' || req.user.role === 'super_admin';
    const hasEditPermission = req.user.permissions?.includes('edit_customer');
    console.log('User permissions:', req.user.permissions);
    console.log('Has edit permission:', hasEditPermission);
    
    if (!hasEditPermission && !isAdmin) {
      return res.status(403).json({ message: 'You do not have permission to edit customer records' });
    }

    const customerId = req.params.id;
    const updates = req.body;
    const username = req.user.username;

    const pool = await connectDB();
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Get current customer data
      const [currentCustomer] = await connection.query(
        'SELECT * FROM customers WHERE id = ?',
        [customerId]
      );

      if (currentCustomer.length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({ message: 'Customer not found' });
      }

      // Function to format date for MySQL
      const formatMySQLDateTime = (date) => {
        if (!date) return null;
        if (date instanceof Date) {
          return date.toISOString().slice(0, 19).replace('T', ' ');
        }
        // If it's an ISO string, convert it to MySQL format
        if (typeof date === 'string' && date.includes('T')) {
          // For date-only fields, return just the date part
          if (date.includes('00:00:00')) {
            return date.slice(0, 10);
          }
          return date.slice(0, 19).replace('T', ' ');
        }
        return date;
      };

      // Default dates
      const defaultLastPaidDate = '2025-01-01';
      const defaultScheduledAt = '2025-01-01 13:00:00';

      // Prepare update fields
      const allowedFields = [
        'loan_card_no', 'c_name', 'product', 'CRN', 'bank_name', 'banker_name', 'agent_name',
        'tl_name', 'fl_supervisor', 'DPD_vintage', 'POS', 'emi_AMT',
        'loan_AMT', 'paid_AMT', 'settl_AMT', 'shots', 'resi_address',
        'pincode', 'office_address', 'mobile', 'ref_mobile', 'calling_code',
        'calling_feedback', 'field_feedback', 'new_track_no', 'field_code',
        'paid_date', 'scheduled_at'
      ];

      const updateFields = {};
      const changes = [];

      // Filter and validate updates
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields[key] = value;
          if (currentCustomer[0][key] !== value) {
            changes.push({
              field: key,
              old_value: currentCustomer[0][key],
              new_value: value
            });
          }
        }
      }

      if (Object.keys(updateFields).length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ message: 'No valid fields to update' });
      }

      // Add last_updated timestamp and default dates to updateFields
      updateFields.last_updated = formatMySQLDateTime(new Date());
      updateFields.paid_date = formatMySQLDateTime(updateFields.paid_date) || defaultLastPaidDate;
      updateFields.scheduled_at = formatMySQLDateTime(updateFields.scheduled_at) || defaultScheduledAt;

      // Format any other date fields that might be present
      if (updateFields.DPD_vintage) {
        updateFields.DPD_vintage = formatMySQLDateTime(updateFields.DPD_vintage);
      }

      // Update customer
      const [updateResult] = await connection.query(
        'UPDATE customers SET ? WHERE id = ?',
        [updateFields, customerId]
      );

      // Log changes
      if (changes.length > 0) {
        await insertChangeLog(
          connection,
          customerId,
          currentCustomer[0].C_unique_id,
          changes,
          username
        );
      }

      // Get the updated change history
      const [changeHistory] = await connection.query(
        `SELECT * FROM updates_customer 
         WHERE customer_id = ? 
         ORDER BY changed_at DESC, id DESC`,
        [customerId]
      );

      await connection.commit();
      connection.release();

      return res.status(200).json({
        success: true,
        message: 'Customer updated successfully',
        changes: changeHistory
      });

    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }
      console.error('Error updating customer:', error);
      return res.status(500).json({ message: 'Error updating customer', error: error.message });
    }
  } catch (error) {
    console.error('Error updating customer:', error);
    return res.status(500).json({ message: 'Error updating customer', error: error.message });
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

// Function to insert change log entries
export const insertChangeLog = async (connection, customerId, C_unique_id, changes, username) => {
  try {
    // Ensure all required fields are present
    if (!customerId || !username) {
      throw new Error('Missing required fields for change log');
    }

    // Insert each change as a separate record
    for (const change of changes) {
      const query = `
        INSERT INTO updates_customer (
          customer_id, C_unique_id, field, 
          old_value, new_value, changed_by, 
          changed_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())
      `;

      const params = [
        customerId,
        C_unique_id || null,
        change.field || null,
        change.old_value || null,
        change.new_value || null,
        username
      ];

      console.log('Inserting change log:', {
        query,
        params,
        change
      });

      await connection.execute(query, params);
    }
  } catch (error) {
    console.error('Error inserting change log:', error);
    throw error;
  }
};

export const historyCustomer = async (req, res) => {
  try {
    // Check if user exists in request
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const connection = await connectDB();
    const { customerId, C_unique_id, changes } = req.body;

    // Validate required fields
    if (!customerId || !changes || !Array.isArray(changes)) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        required: ['customerId', 'changes (array)'],
        received: req.body
      });
    }

    // First get the customer to check authorization
    const [customer] = await connection.execute(
      'SELECT agent_name FROM customers WHERE id = ?',
      [customerId]
    );

    if (customer.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Check authorization
    if (req.user.role !== 'super_admin' && req.user.role !== 'business_head' && req.user.role !== 'team_leader' && customer[0].agent_name !== req.user.username) {
      return res.status(403).json({ 
        message: 'You are not authorized to log changes for this customer',
        user: req.user,
        customerAgent: customer[0].agent_name
      });
    }

    // Insert the changes
    await insertChangeLog(
      connection,
      customerId,
      C_unique_id,
      changes,
      req.user.username
    );

    res.status(200).json({ 
      message: 'Changes logged successfully',
      changeCount: changes.length
    });
  } catch (error) {
    console.error('Error logging changes:', error);
    res.status(500).json({ 
      message: 'Failed to log changes', 
      error: error.message,
      user: req.user
    });
  }
};


// Function to fetch change history for a customer
const getChangeHistory = async (connection, customerId) => {
  const fetchHistoryQuery = `
    SELECT * FROM updates_customer 
    WHERE customer_id = ? 
    ORDER BY changed_at DESC, id DESC`;

  const [changeHistory] = await connection.execute(fetchHistoryQuery, [customerId]);
  return changeHistory;
};

// Main function to handle logging and fetching change history
export const gethistoryCustomer = async (req, res) => {
  try {
    // Check if user exists in request
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const connection = await connectDB();
    const customerId = req.params.id;

    // First get the customer to check authorization
    const [customer] = await connection.execute(
      'SELECT agent_name FROM customers WHERE id = ?',
      [customerId]
    );

    if (customer.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Check authorization
    if (req.user.role !== 'super_admin' && req.user.role !== 'business_head' && req.user.role !== 'team_leader' && customer[0].agent_name !== req.user.username) {
      return res.status(403).json({ 
        message: 'You are not authorized to view this customer\'s history',
        user: req.user,
        customerAgent: customer[0].agent_name
      });
    }

    const changeHistory = await getChangeHistory(connection, customerId);
    res.status(200).json({ changeHistory });
  } catch (error) {
    console.error('Error fetching change history:', error);
    res.status(500).json({ 
      message: 'Failed to fetch change history', 
      error: error.message,
      user: req.user
    });
  }
};

// ***************


export const makeNewRecord = async (req, res) => {
  try {
    // Check if user exists in request
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const connection = await connectDB();

    // Constants for ENUM values matching database schema exactly
    const VALID_C_CODE = ['WN', 'NC', 'CB', 'PTP', 'RTP'];
    const VALID_F_CODE = ['ANF', 'SKIP', 'RTP', 'REVISIT', 'PTP'];
    // Validation functions
    const validateEnum = (value, validValues, defaultValue) => {
      if (!value) return defaultValue;
      const normalizedValue = value.toString().toLowerCase().trim();
      return validValues.includes(normalizedValue) ? normalizedValue : defaultValue;
    };

    // Default dates
    const defaultLastPaidDate = '2025-01-01';
    const defaultScheduledAt = '2025-01-01 13:00:00';

    const validateVarchar = (value, maxLength) => {
      if (!value) return null;
      return value.toString().substring(0, maxLength);
    };

    const validateMobileNumber = (value) => {
      if (!value) return null;
      // Remove any non-digit characters
      const digits = value.toString().replace(/\D/g, '');
      // Check if the number has more than 12 digits
      if (digits.length > 12) {
        throw new Error('Phone number cannot exceed 12 digits');
      }
      return digits;
    };

    // Function to format date for MySQL
    const formatMySQLDateTime = (date) => {
      if (!date) return null;
      if (date instanceof Date) {
        return date.toISOString().slice(0, 19).replace('T', ' ');
      }
      // If it's an ISO string, convert it to MySQL format
      if (typeof date === 'string' && date.includes('T')) {
        // For date-only fields, return just the date part
        if (date.includes('00:00:00')) {
          return date.slice(0, 10);
        }
        return date.slice(0, 19).replace('T', ' ');
      }
      return date;
    };

    // Extract variables from req.body
    const {
      loan_card_no, c_name, product, CRN, bank_name, banker_name, 
      agent_name, tl_name, fl_supervisor, mobile, shots, 
      office_address, resi_address, 
      calling_code, calling_feedback, field_feedback, 
      paid_date,  


      scheduled_at
    } = req.body;

    const errors = [];

    // Validate phone numbers to ensure they are provided
    if (!mobile) {
      errors.push('Mobile number is required.');
    }

    // Validate phone numbers
    try {
      if (!mobile) {
        errors.push('Mobile number is required.');
      } else {
        validateMobileNumber(mobile);
      }
      if (whatsapp_num) validateMobileNumber(whatsapp_num);
    } catch (error) {
      errors.push(error.message);
    }


    // Check if any of the phone numbers or email already exist in the database
    const conditions = [];
    const params = [];

    // Helper to check if value is non-null and non-empty
    const isValidValue = (value) => {
      return value !== null && value !== undefined && value.toString().trim() !== '';
    };

    // Add conditions for each field that needs to be checked
    if (isValidValue(mobile)) {
      conditions.push('(mobile = ? AND mobile IS NOT NULL AND mobile != "")');
      params.push(mobile);
    }

    if (conditions.length > 0) {
      const [existRecords] = await connection.execute(`
        SELECT mobile, whatsapp_num, email_id
        FROM customers 
        WHERE ${conditions.join(' OR ')}
      `, params);

      // Check which fields are in use and push appropriate messages
      if (existRecords.length > 0) {
        existRecords.forEach(record => {
          if (isValidValue(mobile) && isValidValue(record.mobile) && record.mobile === mobile) {
            errors.push('This phone number is already registered in our system');
          }

        });
      }
    }

    // If there are any errors, return them
    if (errors.length > 0) {
      return res.status(409).json({ 
        message: 'Validation failed', 
        errors,
        details: 'One or more fields contain values that are already in use'
      });
    }

    // Validate disposition length (assuming max length is 50 - adjust this value based on your actual database column definition)
    if (disposition && disposition.length > 50) {
      return res.status(400).json({
        message: 'Disposition value exceeds maximum allowed length of 50 characters'
      });
    }

    // Fetch the latest C_unique_id and increment it
    const [latestCustomer] = await connection.query(`
      SELECT C_unique_id 
      FROM customers 
      ORDER BY id DESC 
      LIMIT 1
    `);

    let nextUniqueId;
    if (latestCustomer.length > 0) {
      const lastUniqueId = latestCustomer[0].C_unique_id;
      const lastNumericPart = parseInt(lastUniqueId.split('_')[1]); // Extract the numeric part
      nextUniqueId = `FF_${lastNumericPart + 1}`;
    } else {
      // If no record exists, start with FF_1
      nextUniqueId = `FF_1`;
    }

    // Validate all fields
    const validatedData = {
      product,
      CRN,
      bank_name,
      banker_name,
      agent_name,
      tl_name,
      fl_supervisor,
      loan_card_no,
      mobile,



      first_name: validateVarchar(first_name, 100),
      last_name: validateVarchar(last_name, 100),
      course: validateEnum(course, VALID_COURSES, null),
      age_group: validateVarchar(age_group, 10),
      profession: validateVarchar(profession, 30),
      investment_trading: validateEnum(investment_trading, VALID_INVESTMENT_TYPES, null),
      followup_count: validateEnum(followup_count, VALID_FOLLOWUP, null),
      why_choose: validateVarchar(why_choose, 200),
      language: validateVarchar(language, 50),
      mentor: validateVarchar(mentor, 50),
      education: validateVarchar(education, 50),
      region: validateVarchar(region, 50),
      designation: validateVarchar(designation, 50),
      phone_no: validateMobileNumber(phone_no), // Use the validated phone number
      whatsapp_num: validateMobileNumber(whatsapp_num), // Use the validated WhatsApp number
      email_id: validateVarchar(email_id, 100),
      yt_email_id: validateVarchar(yt_email_id, 100),
      gender: validateEnum(gender, VALID_GENDERS, null),
      disposition: validateEnum(disposition, VALID_DISPOSITIONS, null),
      // Use the agent_name from request, fallback to current user's username
      agent_name: validateVarchar(agent_name, 100) || req.user.username,
      comment: validateVarchar(comment, 500),
      C_unique_id: nextUniqueId,
      scheduled_at: formatMySQLDateTime(scheduled_at) || defaultScheduledAt,
      paid_date: defaultLastPaidDate,
      last_updated: formatMySQLDateTime(new Date())
    };

    const sql = `
      INSERT INTO customers 
      (first_name, last_name, course, age_group, profession, 
      investment_trading, why_choose, language, education, 
      region, designation, phone_no, whatsapp_num, C_unique_id,
      email_id, yt_email_id, gender, disposition, followup_count
      agent_name, comment, scheduled_at, mentor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;    

    const values = [
      validatedData.first_name, validatedData.last_name, validatedData.course,
      validatedData.age_group, validatedData.profession, validatedData.investment_trading,
      validatedData.why_choose, validatedData.language, validatedData.education,
      validatedData.region, validatedData.designation, validatedData.phone_no,
      validatedData.mentor, validatedData.followup_count,
      validatedData.whatsapp_num, validatedData.C_unique_id, validatedData.email_id,
      validatedData.yt_email_id, validatedData.gender, validatedData.disposition,
      validatedData.agent_name, validatedData.comment, validatedData.scheduled_at
    ];

    // Insert the customer record
    const [result] = await connection.query(sql, values);
    const customerId = result.insertId;

    // If the user is a team_leader, automatically assign the record to their team
    if (req.user.role === 'team_leader' && req.user.team_id) {
      await connection.query(`
        INSERT INTO customer_team_assignments (customer_id, team_id, assigned_by)
        VALUES (?, ?, ?)
      `, [customerId, req.user.team_id, req.user.username]);
    }

    res.status(201).json({ 
      message: 'Record added successfully', 
      C_unique_id: nextUniqueId,
      agent_name: validatedData.agent_name // Return the agent_name in response
    });
  } catch (error) {
    console.error('Error creating new customer record:', error);
    res.status(500).json({ message: 'Error adding new record', error: error.message });
  }
};


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

// Function to delete from the updates_customer table
const deleteCustomerUpdates = async (connection, customerId) => {
  const deleteUpdatesQuery = `
    DELETE FROM updates_customer 
    WHERE customer_id = ?`;

  await connection.execute(deleteUpdatesQuery, [customerId]);
};

// Function to delete from the customers table
const deleteCustomerRecord = async (connection, customerId) => {
  const deleteCustomerQuery = `
    DELETE FROM customers 
    WHERE id = ?`;

  await connection.execute(deleteCustomerQuery, [customerId]);
};

// Combined function to handle deleting a customer and associated updates
export const deleteCustomer = async (req, res) => {
  const customerId = req.params.id;  // Assuming customerId is passed as a URL parameter

  try {
    // Check if user exists in request
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (!customerId || isNaN(customerId)) {
      return res.status(400).json({ message: 'Valid Customer ID is required' });
    }

    const connection = await connectDB();

    // Delete from updates_customer table first to ensure relational integrity
    await deleteCustomerUpdates(connection, customerId);

    // Then delete from customers table
    await deleteCustomerRecord(connection, customerId);

    res.status(200).json({ message: 'Customer and associated updates deleted successfully!' });
  } catch (error) {
    console.error('Error deleting customer and updates:', error);
    res.status(500).json({ message: 'Failed to delete customer and updates' });
  }
};

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


export const updateCustomerFieldsByPhone = async (req, res) => {
  console.log('Request Headers:', req.headers);
  console.log('Query Parameters:', req.query);
  
  const phoneNumber = req.params.phone_no;
  const queryParams = req.query;

  console.log('Incoming updates:', queryParams);

  // Validate that updates are provided
  if (!queryParams || Object.keys(queryParams).length === 0) {
    return res.status(400).json({ error: 'No valid updates provided.' });
  }

  try {
    // Check if user exists in request
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const connection = await connectDB();

  
      // First, get the current customer details and C_unique_id
      const [customerRows] = await connection.execute(
        'SELECT * FROM customers WHERE phone_no = ? ORDER BY last_updated DESC, id DESC',
        [phoneNumber]
      );
  
      if (customerRows.length === 0) {
        await connection.end();
        return res.status(404).json({ error: 'Customer not found.' });
      }
  
      const customer = customerRows[0];
      const customerId = customer.id;
      const cUniqueId = customer.C_unique_id;

        // Process each update
        for (const [field, newValue] of Object.entries(queryParams)) {
          // Verify the field exists in customers table
          if (customer.hasOwnProperty(field)) {
            const oldValue = customer[field];
  
            // Insert into updates_customer table
            await connection.execute(
              `INSERT INTO updates_customer 
              (customer_id, C_unique_id, field, 
              old_value, new_value, changed_by, 
              changed_at)
              VALUES (?, ?, ?, ?, ?, ?, NOW())`,
              [customerId, cUniqueId, field, oldValue, newValue, req.user.username]
            );
  
            // Update the customers table
            await connection.execute(
              `UPDATE customers SET ${field} = ? WHERE id = ?`,
              [newValue, customerId]
            );
          }
        }
  
        res.status(200).json({ 
          message: 'Customer details updated successfully.',
          updatedFields: Object.keys(queryParams),
          phoneNumber,
          C_unique_id: cUniqueId
        });

  } catch (error) {
    console.error('Error updating customer details:', error);
    res.status(500).json({ 
      error: 'Failed to update customer details.',
      details: error.message 
    });
  }
};


// New function to get teams list
export const getTeams = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const connection = await connectDB();
    let query;
    let params = [];

    if (req.user.role === 'super_admin') {
      // Super_Admin can see all teams
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
        const { currentCustomerId, phone_no, whatsapp_num, email_id } = req.body;
        
        const conditions = [];
        const params = [currentCustomerId]; // Start with customerId for the != condition
        const duplicates = [];

        // Helper to check if value is non-null and non-empty
        const isValidValue = (value) => {
            return value !== null && value !== undefined && value.toString().trim() !== '';
        };

        // Add conditions for each field that needs to be checked
        if (isValidValue(email_id)) {
            conditions.push('(email_id = ? AND email_id IS NOT NULL AND email_id != "")');
            params.push(email_id);
        }

        if (conditions.length > 0) {
            const [existRecords] = await connection.query(`
                SELECT id, phone_no, email_id, first_name, last_name
                FROM customers 
                WHERE id != ? ${conditions.length > 0 ? 'AND (' + conditions.join(' OR ') + ')' : ''}
            `, params);

            // Check which fields are in use and push detailed error messages
            if (existRecords.length > 0) {
                existRecords.forEach(record => {
                    const customerInfo = `${record.first_name} ${record.last_name} `;
                    
                    if (isValidValue(phone_no) && isValidValue(record.phone_no) && record.phone_no === phone_no) {
                        duplicates.push(`Phone number ${phone_no} is already registered with customer ${customerInfo}`);
                    }
                    if (isValidValue(whatsapp_num) && isValidValue(record.whatsapp_num) && record.whatsapp_num === whatsapp_num) {
                        duplicates.push(`WhatsApp number ${whatsapp_num} is already registered with customer ${customerInfo}`);
                    }
                    if (isValidValue(email_id) && isValidValue(record.email_id) && record.email_id === email_id) {
                        duplicates.push(`Email address ${email_id} is already registered with customer ${customerInfo}`);
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
      const query = `SELECT first_name, phone_no FROM customers ORDER BY last_updated DESC, id DESC`;
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
      const { first_name = "first_name", number = "phone_no" } = req.body;
      const mappedRecords = records.map(record => ({
        [first_name]: record.first_name,
        [number]: record.phone_no,
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

// Create new customer
export const createCustomer = async (req, res) => {
  let connection;
  try {
    const pool = await connectDB();
    connection = await pool.getConnection();

    // Generate unique customer ID
    const uniqueId = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Start transaction
    await connection.beginTransaction();

    try {
      // Insert new customer
      const [result] = await connection.query(
        `INSERT INTO customers (
          loan_card_no, CRN, c_name, product, bank_name, banker_name,
          mobile, ref_mobile, agent_name, tl_name, fl_supervisor,
          DPD_vintage, POS, emi_AMT, loan_AMT, paid_AMT, settl_AMT,
          shots, resi_address, pincode, office_address, new_track_no,
          calling_code, field_code, C_unique_id, calling_feedback,
          field_feedback, scheduled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.body.loan_card_no || null,
          req.body.CRN || null,
          req.body.c_name || null,
          req.body.product || null,
          req.body.bank_name || null,
          req.body.banker_name || null,
          req.body.mobile || null,
          req.body.ref_mobile || null,
          req.body.agent_name || null,
          req.body.tl_name || null,
          req.body.fl_supervisor || null,
          req.body.DPD_vintage || null,
          req.body.POS || null,
          req.body.emi_AMT || null,
          req.body.loan_AMT || null,
          req.body.paid_AMT || null,
          req.body.settl_AMT || null,
          req.body.shots || null,
          req.body.resi_address || null,
          req.body.pincode || null,
          req.body.office_address || null,
          req.body.new_track_no || null,
          req.body.calling_code || 'WN',
          req.body.field_code || 'ANF',
          uniqueId,
          req.body.calling_feedback || null,
          req.body.field_feedback || null,
          req.body.scheduled_at || null
        ]
      );

      await connection.commit();

      res.json({
        success: true,
        message: 'Customer created successfully',
        customerId: result.insertId,
        C_unique_id: uniqueId
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create customer',
      error: error.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

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