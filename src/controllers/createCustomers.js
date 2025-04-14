// src/controllers/createCustomer.js

import connectDB from '../db/index.js';

// Helper function to format date
const formatDate = (dateStr) => {
    if (!dateStr) return null;
    
    // Convert to string and trim
    const strDate = String(dateStr).trim();
    if (!strDate) return null;

    try {
        // First try to handle Excel date number (days since December 30, 1899)
        const numericDate = Number(strDate.replace(/[^0-9]/g, ''));
        if (!isNaN(numericDate)) {
            // Excel date starting point (December 30, 1899)
            const excelEpoch = new Date(1899, 11, 30);
            const date = new Date(excelEpoch.getTime() + (numericDate * 24 * 60 * 60 * 1000));
            
            // Validate the resulting date
            if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && date.getFullYear() <= 2100) {
                return date.toISOString().slice(0, 10);
            }
        }

        // Try DD/MM/YYYY format
        const parts = strDate.split('/');
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10);

            if (day > 0 && day <= 31 && 
                month > 0 && month <= 12 && 
                year >= 2000 && year <= 2100) {
                const paddedDay = day.toString().padStart(2, '0');
                const paddedMonth = month.toString().padStart(2, '0');
                return `${year}-${paddedMonth}-${paddedDay}`;
            }
        }

        // Try parsing as regular date string
        const date = new Date(strDate);
        if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && date.getFullYear() <= 2100) {
            return date.toISOString().slice(0, 10);
        }

        console.warn(`Invalid date format for value: ${strDate}`);
        return null;
    } catch (error) {
        console.error(`Error formatting date: ${strDate}`, error);
        return null;
    }
};

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
        agent_name, tl_name, fl_supervisor, DPD_vintage,
        POS, emi_AMT, loan_AMT, paid_AMT, paid_date,
        settl_AMT, shots, 
        office_address, resi_address, pincode, 
        mobile, ref_mobile, 
        mobile_3, mobile_4, mobile_5, 
        mobile_6, mobile_7, mobile_8,
        calling_code, calling_feedback, 
        field_feedback, new_track_no, field_code, 
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
        if (ref_mobile) validateMobileNumber(ref_mobile);
        if (mobile_3) validateMobileNumber(mobile_3);
        if (mobile_4) validateMobileNumber(mobile_4);
        if (mobile_5) validateMobileNumber(mobile_5);
        if (mobile_6) validateMobileNumber(mobile_6);
        if (mobile_7) validateMobileNumber(mobile_7);
        if (mobile_8) validateMobileNumber(mobile_8);
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
      if (isValidValue(ref_mobile)) {
        conditions.push('(ref_mobile = ? AND ref_mobile IS NOT NULL AND ref_mobile != "")');
        params.push(ref_mobile);
      }
      if (isValidValue(mobile_3)) {
        conditions.push('(mobile_3 = ? AND mobile_3 IS NOT NULL AND mobile_3 != "")');
        params.push(mobile_3);
      }
      if (isValidValue(mobile_4)) {
        conditions.push('(mobile_4 = ? AND mobile_4 IS NOT NULL AND mobile_4 != "")');
        params.push(mobile_4);
      }
      if (isValidValue(mobile_5)) {
        conditions.push('(mobile_5 = ? AND mobile_5 IS NOT NULL AND mobile_5 != "")');
        params.push(mobile_5);
      }
      if (isValidValue(mobile_6)) {
        conditions.push('(mobile_6 = ? AND mobile_6 IS NOT NULL AND mobile_6 != "")');
        params.push(mobile_6);
      }
      if (isValidValue(mobile_7)) {
        conditions.push('(mobile_7 = ? AND mobile_7 IS NOT NULL AND mobile_7 != "")');
        params.push(mobile_7);
      }
      if (isValidValue(mobile_8)) {
        conditions.push('(mobile_8 = ? AND mobile_8 IS NOT NULL AND mobile_8 != "")');
        params.push(mobile_8);
      }
  
      if (conditions.length > 0) {
        const [existRecords] = await connection.execute(`
          SELECT mobile, ref_mobile, mobile_3, mobile_4, mobile_5, 
          mobile_6, mobile_7, mobile_8
          FROM customers 
          WHERE ${conditions.join(' OR ')}
        `, params);
  
        // Check which fields are in use and push appropriate messages
        if (existRecords.length > 0) {
          existRecords.forEach(record => {
            if (isValidValue(mobile) && isValidValue(record.mobile) && record.mobile === mobile) {
              errors.push('This phone number is already registered in our system');
            }
            if (isValidValue(ref_mobile) && isValidValue(record.ref_mobile) && record.ref_mobile === ref_mobile) {
              errors.push('This reference phone number is already registered in our system');
            }
            if (isValidValue(mobile_3) && isValidValue(record.mobile_3) && record.mobile_3 === mobile_3) {
              errors.push('This mobile 3 is already registered in our system');
            }
            if (isValidValue(mobile_4) && isValidValue(record.mobile_4) && record.mobile_4 === mobile_4) {
              errors.push('This mobile 4 is already registered in our system');
            }
            if (isValidValue(mobile_5) && isValidValue(record.mobile_5) && record.mobile_5 === mobile_5) {
              errors.push('This mobile 5 is already registered in our system');
            }
            if (isValidValue(mobile_6) && isValidValue(record.mobile_6) && record.mobile_6 === mobile_6) {
              errors.push('This mobile 6 is already registered in our system');
            }
            if (isValidValue(mobile_7) && isValidValue(record.mobile_7) && record.mobile_7 === mobile_7) {
              errors.push('This mobile 7 is already registered in our system');
            }
            if (isValidValue(mobile_8) && isValidValue(record.mobile_8) && record.mobile_8 === mobile_8) {
              errors.push('This mobile 8 is already registered in our system');
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
        nextUniqueId = `DF_${lastNumericPart + 1}`;
      } else {
        // If no record exists, start with DF_1
        nextUniqueId = `DF_1`;
      }
  
      // Validate all fields
      const validatedData = {
        loan_card_no: validateVarchar(loan_card_no, 25),
        CRN: validateVarchar(CRN, 25),
        c_name: validateVarchar(c_name, 25),
        product: validateEnum(product, 15),
        bank_name: validateVarchar(bank_name, 20),
        banker_name: validateVarchar(banker_name, 20),
        mobile: validateVarchar(mobile, 15),
        ref_mobile: validateVarchar(ref_mobile, 15),
        mobile_3: validateVarchar(mobile_3, 15),
        mobile_4: validateVarchar(mobile_4, 15),
        mobile_5: validateVarchar(mobile_5, 15),
        mobile_6: validateVarchar(mobile_6, 15),
        mobile_7: validateVarchar(mobile_7, 15),
        mobile_8: validateVarchar(mobile_8, 15),
        agent_name: validateVarchar(agent_name, 20),
        tl_name: validateVarchar(tl_name, 20),
        fl_supervisor: validateVarchar(fl_supervisor, 20),
        DPD_vintage: validateVarchar(DPD_vintage, 20),
        POS: validateVarchar(POS, 20),
        emi_AMT: validateVarchar(emi_AMT, 20),
        loan_AMT: validateVarchar(loan_AMT, 20),
        paid_AMT: validateVarchar(paid_AMT, 20),
        settl_AMT: validateVarchar(settl_AMT, 20),
        shots: validateVarchar(shots, 10),
        resi_address: validateVarchar(resi_address, 255),
        pincode: validateVarchar(pincode, 10),
        office_address: validateVarchar(office_address, 255),
        new_track_no: validateVarchar(new_track_no, 20),
        calling_code: validateVarchar(calling_code, 2),
        field_code: validateVarchar(field_code, 10),
        C_unique_id: nextUniqueId,
        calling_feedback: validateVarchar(calling_feedback, 255),
        field_feedback: validateVarchar(field_feedback, 255),
        scheduled_at: formatMySQLDateTime(scheduled_at) || defaultScheduledAt,
        paid_date: paid_date || defaultLastPaidDate,
      };
  
      const sql = `INSERT INTO customers
        (
          loan_card_no, CRN, c_name, product, bank_name, banker_name,
          mobile, ref_mobile, mobile_3, mobile_4, mobile_5, mobile_6,
          mobile_7, mobile_8, agent_name, tl_name, fl_supervisor,
          DPD_vintage, POS, emi_AMT, loan_AMT, paid_AMT, settl_AMT,
          shots, resi_address, pincode, office_address, new_track_no,
          calling_code, field_code, C_unique_id, calling_feedback,
          field_feedback, scheduled_at, paid_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const values = [
        loan_card_no, CRN, c_name, product, bank_name, banker_name,
        mobile, ref_mobile, mobile_3, mobile_4, mobile_5, mobile_6,
        mobile_7, mobile_8, agent_name, tl_name, fl_supervisor,
        DPD_vintage, POS, emi_AMT, loan_AMT, paid_AMT, settl_AMT,
        shots, resi_address, pincode, office_address, new_track_no,
        calling_code || 'WN', field_code || 'ANF', nextUniqueId,
        calling_feedback || null, field_feedback || null,
        formatMySQLDateTime(scheduled_at) || formatMySQLDateTime(new Date()),
        paid_date || defaultLastPaidDate,
        formatMySQLDateTime(new Date())
      ];

      // Log for debugging
      console.log('SQL Query:', sql);
      console.log('Values:', values);
      console.log('Values length:', values.length);

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
  

// Function to check for duplicates
const checkDuplicates = async (connection, loan_card_no, CRN) => {
  const duplicates = {
    exists: false,
    loan_card_no_exists: false,
    crn_exists: false,
    existing_record: null
  };

  if (loan_card_no) {
    const [loanCardResults] = await connection.query(
      'SELECT * FROM customers WHERE loan_card_no = ?',
      [loan_card_no]
    );
    if (loanCardResults.length > 0) {
      duplicates.exists = true;
      duplicates.loan_card_no_exists = true;
      duplicates.existing_record = loanCardResults[0];
    }
  }

  if (CRN && !duplicates.exists) {
    const [crnResults] = await connection.query(
      'SELECT * FROM customers WHERE CRN = ?',
      [CRN]
    );
    if (crnResults.length > 0) {
      duplicates.exists = true;
      duplicates.crn_exists = true;
      duplicates.existing_record = crnResults[0];
    }
  }

  return duplicates;
};

// Function to handle duplicate records
const handleDuplicate = async (connection, customerData, existingRecord, action) => {
  switch (action) {
    case 'skip':
      return { success: false, message: 'Record skipped due to duplicate' };
    
    case 'append':
      // Find the highest suffix number for this loan_card_no/CRN
      const suffix = await getNextSuffix(connection, customerData.loan_card_no, customerData.CRN);
      customerData.loan_card_no = `${customerData.loan_card_no}__${suffix}`;
      customerData.CRN = `${customerData.CRN}__${suffix}`;
      return { success: true, data: customerData };
    
    case 'replace':
      // Delete the existing record first
      await connection.query('DELETE FROM customers WHERE id = ?', [existingRecord.id]);
      return { success: true, data: customerData };
    
    default:
      return { success: false, message: 'Invalid duplicate action' };
  }
};

// Helper function to get next suffix number
const getNextSuffix = async (connection, loan_card_no, CRN) => {
  const [results] = await connection.query(
    'SELECT loan_card_no, CRN FROM customers WHERE loan_card_no LIKE ? OR CRN LIKE ?',
    [`${loan_card_no}%`, `${CRN}%`]
  );
  
  let maxSuffix = 0;
  const suffixRegex = /__(\d+)$/;
  
  results.forEach(record => {
    const loanMatch = record.loan_card_no?.match(suffixRegex);
    const crnMatch = record.CRN?.match(suffixRegex);
    
    if (loanMatch) maxSuffix = Math.max(maxSuffix, parseInt(loanMatch[1]));
    if (crnMatch) maxSuffix = Math.max(maxSuffix, parseInt(crnMatch[1]));
  });
  
  return maxSuffix + 1;
};

// Create new customer
export const createCustomer = async (req, res) => {
    let connection;
    try {
      // Check if user exists in request
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const pool = await connectDB();
      connection = await pool.getConnection();
      await connection.beginTransaction();

      let customerData = req.body;
      const duplicateAction = req.body.duplicateAction || 'skip'; // Get duplicate action from request

      // Check for duplicates
      const duplicates = await checkDuplicates(connection, customerData.loan_card_no, customerData.CRN);

      if (duplicates.exists) {
        if (duplicateAction === 'prompt') {
          // Return duplicate info to frontend for user decision
          return res.status(409).json({
            duplicate: true,
            loan_card_no_exists: duplicates.loan_card_no_exists,
            crn_exists: duplicates.crn_exists,
            existing_record: duplicates.existing_record
          });
        }

        // Handle duplicate based on specified action
        const handleResult = await handleDuplicate(connection, customerData, duplicates.existing_record, duplicateAction);
        
        if (!handleResult.success) {
          return res.status(400).json({ message: handleResult.message });
        }
        
        customerData = handleResult.data;
      }

      // Get the latest C_unique_id
      const [lastIdResult] = await connection.query(
        'SELECT C_unique_id FROM customers ORDER BY CAST(SUBSTRING(C_unique_id, 4) AS UNSIGNED) DESC LIMIT 1'
      );
      
      const lastId = lastIdResult[0]?.C_unique_id || 'DF_0';
      const lastNumericPart = parseInt(lastId.split('_')[1]) || 0;
      const nextId = `DF_${lastNumericPart + 1}`;
  
      // Insert new customer
      const [result] = await connection.query(
        `INSERT INTO customers (
          loan_card_no, CRN, c_name, product, bank_name, banker_name,
          mobile, ref_mobile, mobile_3, mobile_4, mobile_5, mobile_6,
          mobile_7, mobile_8,
          agent_name, tl_name, fl_supervisor,
          DPD_vintage, POS, emi_AMT, loan_AMT, paid_AMT, settl_AMT,
          shots, resi_address, pincode, office_address, new_track_no,
          calling_code, field_code, C_unique_id, calling_feedback,
          field_feedback, scheduled_at, paid_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerData.loan_card_no || null,
          customerData.CRN || null,
          customerData.c_name || null,
          customerData.product || null,
          customerData.bank_name || null,
          customerData.banker_name || null,
          customerData.mobile || null,
          customerData.ref_mobile || null,
          customerData.mobile_3 || null,
          customerData.mobile_4 || null,
          customerData.mobile_5 || null,
          customerData.mobile_6 || null,
          customerData.mobile_7 || null,
          customerData.mobile_8 || null,
          req.user.username, // Automatically use the authenticated user's username
          customerData.tl_name || null,
          customerData.fl_supervisor || null,
          customerData.DPD_vintage || null,
          customerData.POS || null,
          customerData.emi_AMT || null,
          customerData.loan_AMT || null,
          customerData.paid_AMT || null,
          customerData.settl_AMT || null,
          customerData.shots || null,
          customerData.resi_address || null,
          customerData.pincode || null,
          customerData.office_address || null,
          customerData.new_track_no || null,
          customerData.calling_code || 'WN',
          customerData.field_code || 'ANF',
          nextId,
          customerData.calling_feedback || null,
          customerData.field_feedback || null,
          formatDate(customerData.scheduled_at) || null,
          formatDate(customerData.paid_date) || null,
        ]
      );
  
      await connection.commit();
  
      res.json({
        success: true,
        message: 'Customer created successfully',
        customerId: result.insertId,
        C_unique_id: nextId
      });
  
    } catch (error) {
      await connection.rollback();
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
  