// src/controllers/customers.js

import connectDB from '../db/index.js';  

export const searchCustomers = async (req, res) => {
  const { query } = req.query;
  const user = req.user; // Get the current user from the request

  try {
    // Check if user exists in request
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const connection = await connectDB();
    let sql;
    let params;

    // Ensure user role exists, default to 'User' if undefined
    const userRole = req.user.role || 'User';

    const searchParam = `%${query}%`;
    const searchFields = [
      'c.first_name', 'c.last_name', 'c.course', 'c.age_group', 
      'c.profession', 'c.investment_trading', 'c.why_choose', 
      'c.language', 'c.education', 'c.region', 'c.designation',
      'c.phone_no', 'c.whatsapp_num', 'c.email_id', 'c.yt_email_id',
      'c.mentor','c.gender', 'c.disposition', 'c.followup_count',
      'c.agent_name', 'c.C_unique_id', 'c.comment', 'c.last_updated'
    ];

    const searchConditions = searchFields.map(field => `${field} LIKE ?`).join(' OR ');

    if (userRole === 'Super_Admin') {
      sql = `
        SELECT c.*, d.name as department_name 
        FROM customers c
        LEFT JOIN customer_department_assignments cda ON c.id = cda.customer_id
        LEFT JOIN departments d ON cda.department_id = d.id
        WHERE ${searchConditions}
      `;
      params = Array(searchFields.length).fill(searchParam);
    } 
    else if (userRole === 'Department_Admin' && req.user.department_id) {
      sql = `
        SELECT c.*, d.name as department_name 
        FROM customers c
        INNER JOIN customer_department_assignments cda ON c.id = cda.customer_id
        INNER JOIN departments d ON cda.department_id = d.id
        WHERE cda.department_id = ? 
        AND (${searchConditions})
      `;
      params = [req.user.department_id, ...Array(searchFields.length).fill(searchParam)];
    } 
    else {
      // Ensure username exists
      if (!req.user.username) {
        return res.status(400).json({ message: 'Username is required' });
      }
      sql = `
        SELECT c.*, d.name as department_name 
        FROM customers c
        LEFT JOIN customer_department_assignments cda ON c.id = cda.customer_id
        LEFT JOIN departments d ON cda.department_id = d.id
        WHERE c.agent_name = ? 
        AND (${searchConditions})
      `;
      params = [req.user.username, ...Array(searchFields.length).fill(searchParam)];
    }

    // Log query and params for debugging
    console.log('Search Query:', sql);
    console.log('Search Params:', params);

    // Check if params array contains any undefined values
    if (params.some(param => param === undefined)) {
      return res.status(400).json({ 
        message: 'Invalid parameters', 
        details: 'Some required parameters are undefined'
      });
    }

    const [rows] = await connection.execute(sql, params);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error searching customers:', error);
    res.status(500).json({ 
      message: 'Failed to search customers',
      error: error.message,
      user: {
        role: req.user?.role || 'undefined',
        username: req.user?.username || 'undefined',
        department_id: req.user?.department_id || 'undefined'
      }
    });
  }
};

// *****************

export const getAllCustomers = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const connection = await connectDB();

    // Ensure user role exists, default to 'User' if undefined
    const userRole = req.user.role || 'User';

    // Log user info only once
    console.log('User info:', {
      role: userRole,
      username: req.user.username,
      department_id: req.user.department_id,
      userId: req.user.userId,
    });

    let query;
    let params = [];

    // Super_Admin can see all records
    if (userRole === 'Super_Admin') {
      query = `
        SELECT c.*, d.name as department_name 
        FROM customers c
        LEFT JOIN customer_department_assignments cda ON c.id = cda.customer_id
        LEFT JOIN departments d ON cda.department_id = d.id
        ORDER BY c.last_updated DESC
      `;
    }
    // Department_Admin can see all records in their department
    else if (userRole === 'Department_Admin') {
      const departmentId = req.user.department_id ? parseInt(req.user.department_id) : null;
      query = `
        SELECT DISTINCT c.*, d.name as department_name 
        FROM customers c
        LEFT JOIN customer_department_assignments cda ON c.id = cda.customer_id
        LEFT JOIN departments d ON cda.department_id = d.id
        WHERE cda.department_id = ? AND ? IS NOT NULL
        ORDER BY c.last_updated DESC
      `;
      params = [departmentId, departmentId];
    }
    // Regular users can only see their assigned records
    else {
      if (!req.user.username) {
        return res.status(400).json({ message: 'Username is required' });
      }
      query = `
        SELECT c.*, d.name as department_name 
        FROM customers c
        LEFT JOIN customer_department_assignments cda ON c.id = cda.customer_id
        LEFT JOIN departments d ON cda.department_id = d.id
        WHERE c.agent_name = ? 
        ORDER BY c.last_updated DESC
      `;
      params = [req.user.username];
    }

    // Validate parameters
    if (params.some((param) => param === undefined)) {
      return res.status(400).json({
        message: 'Invalid parameters',
        details: 'Some required parameters are undefined',
      });
    }

    const [rows] = await connection.execute(query, params);

    // Log results only once
    console.log('Query results count:', rows ? rows.length : 0);

    res.status(200).json({ records: rows });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      message: 'Failed to fetch records',
      error: error.message,
      user: {
        role: req.user?.role || 'undefined',
        username: req.user?.username || 'undefined',
        department_id: req.user?.department_id || 'undefined'
      },
    });
  }
};


// *****************

export const updateCustomer = async (req, res) => {
  try {
    // Check if user exists in request
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const customerId = req.params.id;
    const connection = await connectDB();

    // Constants for ENUM values
    const VALID_COURSES = ['elite_program', 'extra_earners', 'advanced_TFL'];
    const VALID_INVESTMENT_TYPES = ['investment', 'trading'];
    const VALID_GENDERS = ['male', 'female', 'other'];
    const VALID_DISPOSITIONS = [
      'interested', 'not interested', 'needs to call back', 
      'switched off', 'ringing no response', 'follow-up', 
      'invalid number', 'whatsapp number', 'converted', 'referral'
    ];
    const VALID_FOLLOWUP = [
      'followup-1','followup-2','followup-3','followup-4','followup-5'
    ]

    // Validation functions
    const validateEnum = (value, validValues, defaultValue) => {
      if (!value) return defaultValue;
      const normalizedValue = value.toString().toLowerCase().trim();
      return validValues.includes(normalizedValue) ? normalizedValue : defaultValue;
    };

    const validateVarchar = (value, maxLength) => {
      if (!value) return null;
      return value.toString().substring(0, maxLength);
    };

    const validatePhoneNumber = (value) => {
      if (!value) return null;
      // Remove any non-digit characters
      const digits = value.toString().replace(/\D/g, '');
      // Check if the number has more than 12 digits
      if (digits.length > 12) {
        throw new Error('Phone number cannot exceed 12 digits');
      }
      return digits;
    };

    // Extract variables from req.body
    const {
      first_name, last_name, phone_no, whatsapp_num, email_id, yt_email_id,
      course, age_group, profession, investment_trading, why_choose,
      mentor, followup_count,
      language, education, region, designation, gender, disposition,
      agent_name, comment, scheduled_at
    } = req.body;

    const errors = [];

    // Validate phone numbers
    try {
      if (phone_no) validatePhoneNumber(phone_no);
      if (whatsapp_num) validatePhoneNumber(whatsapp_num);
    } catch (error) {
      errors.push(error.message);
    }

    // Validate email format
    const validateEmail = (email) => {
      if (!email) return true; // Empty email is allowed
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    // Validate email format if provided
    if (email_id && !validateEmail(email_id)) {
      errors.push('Invalid email format');
    }

    if (yt_email_id && !validateEmail(yt_email_id)) {
      errors.push('Invalid YouTube email format');
    }

    // Get the current record to compare with new values
    const [currentRecord] = await connection.query(
      'SELECT phone_no, whatsapp_num, email_id FROM customers WHERE id = ?',
      [customerId]
    );

    if (currentRecord.length === 0) {
      return res.status(404).json({ message: 'Customer record not found' });
    }

    // Helper to check if value is non-null and non-empty
    const isValidValue = (value) => {
      return value !== null && value !== undefined && value.toString().trim() !== '';
    };

    // Check for duplicates excluding the current record
    const conditions = [];
    const params = [customerId]; // Start with customerId for the != condition

    // Only check for duplicates if the value is different from the current record
    if (isValidValue(phone_no) && phone_no !== currentRecord[0].phone_no) {
      conditions.push('(phone_no = ? AND phone_no IS NOT NULL AND phone_no != "")');
      params.push(phone_no);
    }
    if (isValidValue(whatsapp_num) && whatsapp_num !== currentRecord[0].whatsapp_num) {
      conditions.push('(whatsapp_num = ? AND whatsapp_num IS NOT NULL AND whatsapp_num != "")');
      params.push(whatsapp_num);
    }
    if (isValidValue(email_id) && email_id !== currentRecord[0].email_id) {
      conditions.push('(email_id = ? AND email_id IS NOT NULL AND email_id != "")');
      params.push(email_id);
    }

    if (conditions.length > 0) {
      const [existRecords] = await connection.query(`
        SELECT id, phone_no, whatsapp_num, email_id, first_name, last_name
        FROM customers 
        WHERE id != ? ${conditions.length > 0 ? 'AND (' + conditions.join(' OR ') + ')' : ''}
      `, params);

      // Check which fields are in use and push detailed error messages
      if (existRecords.length > 0) {
        existRecords.forEach(record => {
          const customerInfo = `${record.first_name} ${record.last_name}`;
          
          if (isValidValue(phone_no) && isValidValue(record.phone_no) && record.phone_no === phone_no) {
            errors.push(`Phone number ${phone_no} is already registered with customer ${customerInfo}`);
          }
          if (isValidValue(whatsapp_num) && isValidValue(record.whatsapp_num) && record.whatsapp_num === whatsapp_num) {
            errors.push(`WhatsApp number ${whatsapp_num} is already registered with customer ${customerInfo}`);
          }
          if (isValidValue(email_id) && isValidValue(record.email_id) && record.email_id === email_id) {
            errors.push(`Email address ${email_id} is already registered with customer ${customerInfo}`);
          }
        });
      }
    }

    // If there are any errors, return them with detailed information
    if (errors.length > 0) {
      return res.status(409).json({ 
        message: 'Duplicate values found', 
        errors,
        details: 'One or more fields contain values that are already registered with other customers'
      });
    }

    // Validate all fields according to database schema
    const validatedData = {
      first_name: validateVarchar(first_name, 100),
      last_name: validateVarchar(last_name, 100),
      course: validateEnum(course, VALID_COURSES, null),
      age_group: validateVarchar(age_group, 10),
      mentor: validateVarchar(mentor, 50),
      profession: validateVarchar(profession, 30),
      investment_trading: validateEnum(investment_trading, VALID_INVESTMENT_TYPES, null),
      why_choose: validateVarchar(why_choose, 200),
      language: validateVarchar(language, 50),
      education: validateVarchar(education, 50),
      region: validateVarchar(region, 50),
      designation: validateVarchar(designation, 50),
      phone_no: validatePhoneNumber(phone_no),
      whatsapp_num: validatePhoneNumber(whatsapp_num),
      email_id: validateVarchar(email_id, 100),
      yt_email_id: validateVarchar(yt_email_id, 100),
      gender: validateEnum(gender, VALID_GENDERS, null),
      disposition: validateEnum(disposition, VALID_DISPOSITIONS, null),
      followup_count: validateEnum(followup_count, VALID_FOLLOWUP, null),
      mentor: validateVarchar(mentor, 50),
      comment: validateVarchar(comment, 500),
      agent_name: validateVarchar(agent_name, 100),
      scheduled_at: scheduled_at ? new Date(scheduled_at) : null
    };

    // Debug logs for disposition
    console.log('Raw disposition value:', req.body.disposition);
    console.log('Validated disposition value:', validatedData.disposition);

    // Define valid disposition values
    const validDispositions = [
      'interested',
      'not interested',
      'needs to call back',
      'switched off',
      'ringing no response',
      'follow-up',
      'invalid number',
      'whatsapp number',
      'converted',
      'referral'
    ];

    // Validate disposition value and normalize it
    if (validatedData.disposition) {
      const normalizedDisposition = validatedData.disposition.toLowerCase().trim();
      if (!validDispositions.includes(normalizedDisposition)) {
        return res.status(400).json({
          message: `Invalid disposition value. Must be one of: ${validDispositions.join(', ')}`
        });
      }
      // Ensure we use the normalized value
      validatedData.disposition = normalizedDisposition;
    }

    // Get the current customer data for comparison
    const [currentCustomer] = await connection.execute(
      'SELECT * FROM customers WHERE id = ?',
      [customerId]
    );

    if (currentCustomer.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Check authorization
    if (req.user.role !== 'Super_Admin' && req.user.role !== 'Department_Admin' && currentCustomer[0].agent_name !== req.user.username) {
      return res.status(403).json({ 
        message: 'You are not authorized to update this customer record',
        user: req.user,
        customerAgent: currentCustomer[0].agent_name
      });
    }

    // Only include agent_name in update if user is Super_Admin or Department_Admin and it's different
    const shouldUpdateAgent = (req.user.role === 'Super_Admin' || req.user.role === 'Department_Admin') && agent_name !== currentCustomer[0].agent_name;

    const query = `
      UPDATE customers  
      SET first_name = ?, last_name = ?, 
          course = ?, age_group = ?,
          profession  = ?, investment_trading = ?, why_choose = ?,
          language = ?, education = ?, region = ?, designation = ?, 
          phone_no = ?, whatsapp_num = ?, email_id = ?, yt_email_id = ?, 
          gender = ?, disposition = ?, mentor = ?, followup_count = ?,
          ${shouldUpdateAgent ? 'agent_name = ?,' : ''} 
          comment = ?, 
          scheduled_at = ?,
          last_updated = NOW()
      WHERE id = ?`;

    // Initialize updateParams array
    const updateParams = [
      validatedData.first_name || null,
      validatedData.last_name || null,
      validatedData.course || null,
      validatedData.age_group || null,
      validatedData.profession || null,
      validatedData.investment_trading || null,
      validatedData.why_choose || null,
      validatedData.language || null,
      validatedData.education || null,
      validatedData.region || null,
      validatedData.designation || null,
      validatedData.phone_no || null,
      validatedData.whatsapp_num || null,
      validatedData.email_id || null,
      validatedData.yt_email_id || null,
      validatedData.gender || null,
      validatedData.disposition || null,
      validatedData.mentor || null,
      validatedData.followup_count || null
    ];

    // Debug log for update parameters
    console.log('Update params before query:', updateParams);

    // Only add agent_name to params if user is Super_Admin or Department_Admin and it's being updated
    if (shouldUpdateAgent) {
      updateParams.push(agent_name || null);
    }

    updateParams.push(
      validatedData.comment || null,
      validatedData.scheduled_at,
      customerId
    );

    console.log('Update query:', query);
    console.log('Update params:', updateParams);
    console.log('User data:', req.user);

    await connection.execute(query, updateParams);

    res.status(200).json({
      message: 'Customer updated successfully',
    });

  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

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
    if (req.user.role !== 'Super_Admin' && req.user.role !== 'Department_Admin' && customer[0].agent_name !== req.user.username) {
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
    ORDER BY changed_at DESC`;

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
    if (req.user.role !== 'Super_Admin' && req.user.role !== 'Department_Admin' && customer[0].agent_name !== req.user.username) {
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
    const VALID_COURSES = ['elite_program', 'extra_earners', 'advanced_TFL'];
    const VALID_INVESTMENT_TYPES = ['investment', 'trading'];
    const VALID_GENDERS = ['male', 'female', 'other'];
    const VALID_DISPOSITIONS = [
      'interested', 'not interested', 'needs to call back', 
      'switched off', 'ringing no response', 'follow-up', 
      'invalid number', 'whatsapp number', 'converted', 'referral'
    ];
    const VALID_FOLLOWUP = [
      'followup-1','followup-2','followup-3','followup-4','followup-5'
    ]

    // Validation functions
    const validateEnum = (value, validValues, defaultValue) => {
      if (!value) return defaultValue;
      const normalizedValue = value.toString().toLowerCase().trim();
      return validValues.includes(normalizedValue) ? normalizedValue : defaultValue;
    };

    const validateVarchar = (value, maxLength) => {
      if (!value) return null;
      return value.toString().substring(0, maxLength);
    };

    const validatePhoneNumber = (value) => {
      if (!value) return null;
      // Remove any non-digit characters
      const digits = value.toString().replace(/\D/g, '');
      // Check if the number has more than 12 digits
      if (digits.length > 12) {
        throw new Error('Phone number cannot exceed 12 digits');
      }
      return digits;
    };

    // Extract variables from req.body
    const {
      first_name, last_name, phone_no, whatsapp_num, email_id, yt_email_id,
      course, age_group, profession, investment_trading, why_choose, mentor,
      language, education, region, designation, gender, disposition, followup_count,
      agent_name, comment, scheduled_at
    } = req.body;

    const errors = [];

    // Validate phone numbers to ensure they are provided
    if (!phone_no) {
      errors.push('Primary phone number is required.');
    }

    // Validate phone numbers
    try {
      if (!phone_no) {
        errors.push('Primary phone number is required.');
      } else {
        validatePhoneNumber(phone_no);
      }
      if (whatsapp_num) validatePhoneNumber(whatsapp_num);
    } catch (error) {
      errors.push(error.message);
    }

    // Validate email format
    const validateEmail = (email) => {
      if (!email) return true; // Empty email is allowed
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    // Validate email format if provided
    if (email_id && !validateEmail(email_id)) {
      errors.push('Invalid email format');
    }

    if (yt_email_id && !validateEmail(yt_email_id)) {
      errors.push('Invalid YouTube email format');
    }

    // Check if any of the phone numbers or email already exist in the database
    const conditions = [];
    const params = [];

    // Helper to check if value is non-null and non-empty
    const isValidValue = (value) => {
      return value !== null && value !== undefined && value.toString().trim() !== '';
    };

    // Add conditions for each field that needs to be checked
    if (isValidValue(phone_no)) {
      conditions.push('(phone_no = ? AND phone_no IS NOT NULL AND phone_no != "")');
      params.push(phone_no);
    }
    if (isValidValue(whatsapp_num)) {
      conditions.push('(whatsapp_num = ? AND whatsapp_num IS NOT NULL AND whatsapp_num != "")');
      params.push(whatsapp_num);
    }
    if (isValidValue(email_id)) {
      conditions.push('(email_id = ? AND email_id IS NOT NULL AND email_id != "")');
      params.push(email_id);
    }

    if (conditions.length > 0) {
      const [existRecords] = await connection.query(`
        SELECT phone_no, whatsapp_num, email_id
        FROM customers 
        WHERE ${conditions.join(' OR ')}
      `, params);

      // Check which fields are in use and push appropriate messages
      if (existRecords.length > 0) {
        existRecords.forEach(record => {
          if (isValidValue(phone_no) && isValidValue(record.phone_no) && record.phone_no === phone_no) {
            errors.push('This phone number is already registered in our system');
          }
          if (isValidValue(whatsapp_num) && isValidValue(record.whatsapp_num) && record.whatsapp_num === whatsapp_num) {
            errors.push('This WhatsApp number is already registered in our system');
          }
          if (isValidValue(email_id) && isValidValue(record.email_id) && record.email_id === email_id) {
            errors.push('This email address is already registered in our system');
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
      phone_no: validatePhoneNumber(phone_no), // Use the validated phone number
      whatsapp_num: validatePhoneNumber(whatsapp_num), // Use the validated WhatsApp number
      email_id: validateVarchar(email_id, 100),
      yt_email_id: validateVarchar(yt_email_id, 100),
      gender: validateEnum(gender, VALID_GENDERS, null),
      disposition: validateEnum(disposition, VALID_DISPOSITIONS, null),
      // Use the agent_name from request, fallback to current user's username
      agent_name: validateVarchar(agent_name, 100) || req.user.username,
      comment: validateVarchar(comment, 500),
      C_unique_id: nextUniqueId,
      scheduled_at: scheduled_at
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

    // If the user is a Department_Admin, automatically assign the record to their department
    if (req.user.role === 'Department_Admin' && req.user.department_id) {
      await connection.query(`
        INSERT INTO customer_department_assignments (customer_id, department_id, assigned_by)
        VALUES (?, ?, ?)
      `, [customerId, req.user.department_id, req.user.userId]);
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
    const query = `SELECT * FROM customers WHERE C_unique_id = ?`;
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
        'SELECT * FROM customers WHERE phone_no = ?',
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

        // If Department_Admin, only show users from their department
        if (req.user.role === 'Department_Admin' && req.user.department_id) {
            query = `
                SELECT u.id, u.username, u.role
                FROM users u
                WHERE u.username IS NOT NULL
                AND u.department_id = ?
                ORDER BY u.username
            `;
            params = [req.user.department_id];
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

// New function to assign customer to team/department
export const assignCustomerToTeam = async (req, res) => {
  let connection;
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    console.log('Request body:', req.body);
    const { customer_id, user_id } = req.body;
    console.log('Extracted values:', { customer_id, user_id });

    if (!customer_id || !user_id) {
      return res.status(400).json({ 
        message: 'Customer ID and User ID are required',
        received: { customer_id, user_id }
      });
    }

    // Only Super_Admin and Department_Admin can assign customers
    if (req.user.role !== 'Super_Admin' && req.user.role !== 'Department_Admin') {
      return res.status(403).json({ message: 'Unauthorized to assign customers' });
    }

    const pool = await connectDB();
    connection = await pool.getConnection();

    // Start transaction
    await connection.beginTransaction();

    try {
      // Get the department_id of the target user
      const [userDept] = await connection.execute(
        'SELECT department_id, username FROM users WHERE id = ?',
        [user_id]
      );
      console.log('User department query result:', userDept);

      if (userDept.length === 0 || !userDept[0].department_id) {
        await connection.rollback();
        return res.status(404).json({ 
          message: 'User or department not found',
          userId: user_id
        });
      }

      const department_id = userDept[0].department_id;
      const username = userDept[0].username;

      // Department_Admin can only assign to their own department
      if (req.user.role === 'Department_Admin' && department_id !== req.user.department_id) {
        await connection.rollback();
        return res.status(403).json({ 
          message: 'Can only assign to users in your own department',
          userDept: department_id,
          adminDept: req.user.department_id
        });
      }

      // Check if customer exists
      const [customerExists] = await connection.execute(
        'SELECT id FROM customers WHERE C_unique_id = ?',
        [customer_id]
      );
      console.log('Customer exists query result:', customerExists);

      if (customerExists.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          message: 'Customer not found',
          customerId: customer_id
        });
      }

      const customerId = customerExists[0].id;

      // Validate all required values before proceeding
      if (!customerId || !department_id || !req.user.userId) {
        console.error('Missing required values:', { 
          customerId, 
          department_id, 
          assignedBy: req.user.userId
        });
        await connection.rollback();
        return res.status(400).json({ 
          message: 'Missing required values for assignment',
          details: { 
            customerId, 
            department_id, 
            assignedBy: req.user.userId
          }
        });
      }

      // Get the old agent_name and C_unique_id
      const [oldAgentData] = await connection.execute(
        'SELECT agent_name, C_unique_id FROM customers WHERE id = ?',
        [customerId]
      );

      const oldAgentName = oldAgentData[0]?.agent_name;
      const newAgentName = username || 'None';

      // Only log agent_name change if it actually changed
      if (oldAgentName !== newAgentName) {
        const changeLogQuery = 'INSERT INTO updates_customer (customer_id, C_unique_id, field, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, NOW())';
        
        await connection.execute(
            changeLogQuery,
            [
                customerId,
                oldAgentData[0].C_unique_id,
                'agent_name',
                oldAgentName || 'None',
                newAgentName,
                req.user.username
            ]
        );
      }

      // Get old and new department info
      const [oldDept] = await connection.execute(
        'SELECT d.name FROM departments d JOIN customer_department_assignments cda ON d.id = cda.department_id WHERE cda.customer_id = ?',
        [customerId]
      );

      const [newDept] = await connection.execute(
        'SELECT name FROM departments WHERE id = ?',
        [department_id]
      );

      const oldDeptName = oldDept[0]?.name || 'None';
      const newDeptName = newDept[0]?.name || 'None';

      // Only log department change if it actually changed
      if (oldDeptName !== newDeptName) {
        const changeLogQuery = 'INSERT INTO updates_customer (customer_id, C_unique_id, field, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, NOW())';
        
        await connection.execute(
            changeLogQuery,
            [
                customerId,
                oldAgentData[0].C_unique_id,
                'department',
                oldDeptName,
                newDeptName,
                req.user.username
            ]
        );
      }

      // Update customer's agent_name with the assigned user's username
      await connection.execute(
        'UPDATE customers SET agent_name = ? WHERE id = ?',
        [username || null, customerId]
      );

      // Remove any existing team assignment
      await connection.execute(
        'DELETE FROM customer_department_assignments WHERE customer_id = ?',
        [customerId]
      );

      // Create new team assignment
      const assignedBy = req.user.userId || null;
      await connection.execute(
        'INSERT INTO customer_department_assignments (customer_id, department_id, assigned_by) VALUES (?, ?, ?)',
        [customerId, department_id, assignedBy]
      );

      // Commit transaction
      await connection.commit();
      console.log('Assignment successful for customer:', customer_id);

      res.status(200).json({ 
        message: 'Customer assigned to team successfully',
        details: {
          customer_id: customer_id,
          assigned_to: username,
          department: department_id
        }
      });
    } catch (error) {
      console.error('Database error:', error);
      await connection.rollback();
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }
  } catch (error) {
    console.error('Error assigning customer to team:', error);
    res.status(500).json({ 
      message: 'Failed to assign customer to team',
      error: error.message
    });
  }
};

// New function to get teams/departments list
export const getTeams = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const connection = await connectDB();
    let query;
    let params = [];

    if (req.user.role === 'Super_Admin') {
      // Super_Admin can see all teams
      query = 'SELECT id, name FROM departments ORDER BY name';
    } else if (req.user.role === 'Department_Admin') {
      // Department_Admin can only see their team
      query = 'SELECT id, name FROM departments WHERE id = ?';
      params = [req.user.department_id];
    } else {
      // Regular users can only see their assigned team
      query = `
        SELECT d.id, d.name 
        FROM departments d
        INNER JOIN users u ON d.id = u.department_id
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

// Function to download customer data with date filter
export const downloadCustomerDataNew = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const user = req.user; // Get the current user

    console.log('Input dates:', { startDate, endDate });
    console.log('User role:', user.role);
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }

    // Parse the input date format (DD/MM/YYYY, HH:mm:ss)
    const parseDate = (dateStr) => {
      const [datePart, timePart] = dateStr.split(', ');
      const [day, month, year] = datePart.split('/');
      const [time] = timePart.split(' '); // Ignore AM/PM as we're using 24-hour format
      const [hours, minutes, seconds] = time.split(':');
      
      // Format as MySQL datetime
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds || '00'}`;
    };

    const mysqlStartDate = parseDate(startDate);
    const mysqlEndDate = parseDate(endDate);

    console.log('Parsed MySQL dates:', { mysqlStartDate, mysqlEndDate });

    let query = `
      SELECT 
        c.*,
        d.name as department_name
      FROM customers c
      LEFT JOIN customer_department_assignments cda ON c.id = cda.customer_id
      LEFT JOIN departments d ON cda.department_id = d.id
      WHERE c.last_updated >= ?
      AND c.last_updated <= ?
    `;

    let queryParams = [mysqlStartDate, mysqlEndDate];

    // Add role-specific filters
    if (user.role === 'Department_Admin' && user.department_id) {
      query += ' AND cda.department_id = ?';
      queryParams.push(user.department_id);
    } else if (user.role !== 'Super_Admin') {
      // For regular users, only show their own records
      query += ' AND c.agent_name = ?';
      queryParams.push(user.username);
    }

    query += ' ORDER BY c.last_updated DESC';

    console.log('Query:', query);
    console.log('Params:', queryParams);

    const connection = await connectDB();
    const [rows] = await connection.query(query, queryParams);
    console.log('Query returned rows:', rows.length);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ 
        message: 'No data found for the selected datetime range',
        range: { startDate, endDate }
      });
    }

    res.json(rows);
  } catch (error) {
    console.error('Error downloading data:', error);
    res.status(500).json({ 
      message: 'Error downloading data', 
      error: error.message,
      details: 'An error occurred while processing the datetime values'
    });
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
        if (isValidValue(phone_no)) {
            conditions.push('(phone_no = ? AND phone_no IS NOT NULL AND phone_no != "")');
            params.push(phone_no);
        }
        if (isValidValue(whatsapp_num)) {
            conditions.push('(whatsapp_num = ? AND whatsapp_num IS NOT NULL AND whatsapp_num != "")');
            params.push(whatsapp_num);
        }
        if (isValidValue(email_id)) {
            conditions.push('(email_id = ? AND email_id IS NOT NULL AND email_id != "")');
            params.push(email_id);
        }

        if (conditions.length > 0) {
            const [existRecords] = await connection.query(`
                SELECT id, phone_no, whatsapp_num, email_id, first_name, last_name
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

// Function to get department records with field mapping
export const getDepartmentRecords = async (req, res) => {
  try {
      const connection = await connectDB();
      const query = `SELECT first_name, phone_no FROM customers`;
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
      console.error("Error in getDepartmentRecords:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
  }
};