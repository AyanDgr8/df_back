// src/controllers/uploadFile.js

import connectDB from '../db/index.js';
import axios from 'axios';
import { v4 as uuid } from 'uuid';

// Use a Map to store upload data temporarily
const uploadDataStore = new Map();

export const uploadCustomerData = async (req, res) => {
    try {
        const { headerMapping, customerData } = req.body;

        if (!headerMapping || typeof headerMapping !== 'object' || Object.keys(headerMapping).length === 0) {
            return res.status(400).json({ message: 'Invalid header mapping provided' });
        }

        if (!Array.isArray(customerData) || customerData.length === 0) {
            return res.status(400).json({ message: 'customerData must be a non-empty array.' });
        }

        const pool = await connectDB();
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Get valid agent usernames from users table
            const [userResults] = await connection.query(
                'SELECT username, team_id FROM users'
            );
            
            if (userResults.length === 0) {
                return res.status(400).json({ 
                    message: 'No users found in the system.' 
                });
            }

            // Create a map of valid usernames and their team_ids
            const validAgents = {};
            userResults.forEach(row => {
                validAgents[row.username] = row.team_id;
            });

            // Get the latest C_unique_id
            const [lastIdResult] = await connection.query(
                'SELECT C_unique_id FROM customers ORDER BY CAST(SUBSTRING(C_unique_id, 4) AS UNSIGNED) DESC LIMIT 1'
            );
            
            const lastId = lastIdResult[0]?.C_unique_id || 'DF_0';
            const lastNumericPart = parseInt(lastId.split('_')[1]) || 0;

            // Check for duplicates first
            const duplicates = [];
            const newRecords = [];

            // Process each record
            for (const [index, record] of customerData.entries()) {
                // Skip empty records
                if (!record[headerMapping['c_name']] || !record[headerMapping['mobile']] || !record[headerMapping['agent_name']]) {
                    continue;
                }

                // Check if agent exists in users table
                if (!validAgents[record[headerMapping['agent_name']]]) {
                    return res.status(400).json({
                        message: `Invalid agent name: ${record[headerMapping['agent_name']]}. Agent must be a registered user.`
                    });
                }

                // Check for duplicate based on loan_card_no or mobile
                const [existingCustomer] = await connection.query(
                    'SELECT id FROM customers WHERE loan_card_no = ? OR mobile = ?',
                    [record[headerMapping['loan_card_no']], record[headerMapping['mobile']]]
                );

                if (existingCustomer.length > 0) {
                    duplicates.push({
                        ...record,
                        existing: existingCustomer[0]
                    });
                } else {
                    newRecords.push(record);
                }
            }

            const totalRecords = customerData.length;
            const duplicateCount = duplicates.length;
            const uniqueRecords = newRecords.length;

            // If there are duplicates, return them without inserting anything
            if (duplicates.length > 0) {
                await connection.rollback();
                return res.json({
                    success: false,
                    message: 'Duplicate records found',
                    duplicates: duplicates.map(d => ({
                        ...d,
                        existing_record: d.existing
                    })),
                    duplicateCount,
                    totalRecords,
                    uniqueRecords,
                    uploadId: uuid()
                });
            }

            // Generate a unique upload ID
            const uploadId = uuid();
            
            // Store the processed data
            uploadDataStore.set(uploadId, {
                newRecords,
                headerMapping,
                validAgents
            });

            await connection.commit();
            connection.release();

            res.status(200).json({ 
                message: 'Data processed successfully',
                totalRecords,
                duplicateCount,
                uniqueRecords,
                uploadId
            });

        } catch (error) {
            await connection.rollback();
            connection.release();
            throw error;
        }
    } catch (error) {
        console.error('Error in uploadCustomerData:', error);
        res.status(500).json({ 
            message: 'Failed to process data',
            error: error.message
        });
    }
};

export const confirmUpload = async (req, res) => {
    const { uploadId, proceed, headerMapping, customerData, uploadResult } = req.body;
    let connection;
    
    // Set a timeout for the request
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            res.status(503).json({
                success: false,
                message: 'Request timed out. Please try again.'
            });
        }
    }, 30000); // 30 second timeout

    try {
        // Validate required data
        if (proceed && (!uploadId || !headerMapping || !customerData)) {
            clearTimeout(timeout);
            return res.status(400).json({ 
                message: 'Missing required data for upload confirmation',
                details: {
                    uploadId: !uploadId,
                    headerMapping: !headerMapping,
                    customerData: !customerData
                }
            });
        }

        // Check if there are any records to upload when proceeding
        if (proceed && (!customerData || customerData.length === 0)) {
            clearTimeout(timeout);
            return res.status(400).json({
                success: false,
                message: 'No unique records to upload. All records are duplicates.'
            });
        }

        // Use data from request if uploadDataStore is empty
        let uploadData;
        if (!uploadDataStore.has(uploadId)) {
            uploadData = {
                newRecords: customerData || [],
                headerMapping: headerMapping || {},
                validAgents: uploadResult?.validAgents || []
            };
        } else {
            uploadData = uploadDataStore.get(uploadId);
        }

        // Get database connection
        const pool = await connectDB();
        if (!pool) {
            clearTimeout(timeout);
            throw new Error('Failed to connect to database');
        }
        
        connection = await pool.getConnection();
        await connection.beginTransaction();

        if (proceed) {
            // Get the latest C_unique_id - optimize by using LIMIT
            const [lastIdResult] = await connection.query(
                'SELECT C_unique_id FROM customers ORDER BY CAST(SUBSTRING(C_unique_id, 4) AS UNSIGNED) DESC LIMIT 1'
            );
            
            const lastId = lastIdResult[0]?.C_unique_id || 'DF_0';
            const lastNumericPart = parseInt(lastId.split('_')[1]) || 0;
            let nextId = lastNumericPart + 1;

            // Prepare the base query
            const insertQuery = `INSERT INTO customers (
                loan_card_no, c_name, product, CRN, bank_name, 
                banker_name, agent_name, tl_name, fl_supervisor,
                DPD_vintage, POS, emi_AMT, loan_AMT, paid_AMT,
                paid_date, settl_AMT, shots, resi_address, pincode,
                office_address, mobile, ref_mobile, calling_code,
                calling_feedback, field_feedback, new_track_no,
                field_code, C_unique_id
            ) VALUES ?`;

            // Prepare all values in a single array for bulk insert
            const values = uploadData.newRecords.map(record => [
                record[uploadData.headerMapping['loan_card_no']], record[uploadData.headerMapping['c_name']], 
                record[uploadData.headerMapping['product']], record[uploadData.headerMapping['CRN']], 
                record[uploadData.headerMapping['bank_name']], record[uploadData.headerMapping['banker_name']], 
                record[uploadData.headerMapping['agent_name']], record[uploadData.headerMapping['tl_name']], 
                record[uploadData.headerMapping['fl_supervisor']], record[uploadData.headerMapping['DPD_vintage']], 
                record[uploadData.headerMapping['POS']], record[uploadData.headerMapping['emi_AMT']], 
                record[uploadData.headerMapping['loan_AMT']], record[uploadData.headerMapping['paid_AMT']],
                record[uploadData.headerMapping['paid_date']], record[uploadData.headerMapping['settl_AMT']], 
                record[uploadData.headerMapping['shots']], record[uploadData.headerMapping['resi_address']], 
                record[uploadData.headerMapping['pincode']], record[uploadData.headerMapping['office_address']], 
                record[uploadData.headerMapping['mobile']], record[uploadData.headerMapping['ref_mobile']], 
                record[uploadData.headerMapping['calling_code']], record[uploadData.headerMapping['calling_feedback']], 
                record[uploadData.headerMapping['field_feedback']], record[uploadData.headerMapping['new_track_no']],
                record[uploadData.headerMapping['field_code']], `DF_${nextId++}`
            ]);

            // Perform bulk insert
            await connection.query(insertQuery, [values]);
        }

        // Clear the upload data if it exists
        if (uploadDataStore.has(uploadId)) {
            uploadDataStore.delete(uploadId);
        }
        
        await connection.commit();
        clearTimeout(timeout);

        res.status(200).json({ 
            success: true,
            message: proceed ? 'Records uploaded successfully' : 'Upload cancelled',
            recordsProcessed: proceed ? uploadData.newRecords.length : 0
        });

    } catch (error) {
        console.error('Error in confirmUpload:', error);
        clearTimeout(timeout);
        
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Error rolling back transaction:', rollbackError);
            }
        }

        res.status(500).json({ 
            success: false,
            message: 'Failed to process upload confirmation',
            error: error.message
        });
    } finally {
        if (connection) {
            try {
                connection.release();
            } catch (releaseError) {
                console.error('Error releasing connection:', releaseError);
            }
        }
    }
};