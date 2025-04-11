// src/controllers/createCustomer.js

import connectDB from '../db/index.js';



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
        mobile, ref_mobile, calling_code, calling_feedback, 
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
          SELECT mobile, ref_mobile
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
        nextUniqueId = `DF_${lastNumericPart + 1}`;
      } else {
        // If no record exists, start with DF_1
        nextUniqueId = `DF_1`;
      }
  
      // Validate all fields
      const validatedData = {
        loan_card_no: validateVarchar(loan_card_no, 25),
        c_name: validateVarchar(c_name, 30),
        product: validateEnum(product, 15),
        CRN: validateVarchar(CRN, 25),
        bank_name: validateVarchar(bank_name, 100),
        banker_name: validateVarchar(banker_name, 100),
        agent_name: validateVarchar(agent_name, 100),
          tl_name: validateVarchar(tl_name, 100),
        fl_supervisor: validateVarchar(fl_supervisor, 100),
        loan_card_no,
        mobile,
  
  
        C_unique_id: nextUniqueId,
        scheduled_at: formatMySQLDateTime(scheduled_at) || defaultScheduledAt,
        paid_date: paid_date || defaultLastPaidDate,
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
            req.user.username, // Automatically use the authenticated user's username
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
  