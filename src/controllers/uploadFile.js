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

                // Check for duplicate based on c_name or mobile
                const [existingCustomer] = await connection.query(
                    'SELECT id FROM customers WHERE c_name = ? OR mobile = ?',
                    [record[headerMapping['c_name']], record[headerMapping['mobile']]]
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
                message: 'No records to upload.'
            });
        }

        // Get database connection
        const pool = await connectDB();
        if (!pool) {
            clearTimeout(timeout);
            throw new Error('Failed to connect to database');
        }
        
        connection = await pool.getConnection();
        await connection.beginTransaction();

        let recordsUploaded = 0;

        if (proceed && customerData.length > 0) {
            // Get the latest C_unique_id
            const [lastIdResult] = await connection.query(
                'SELECT C_unique_id FROM customers ORDER BY CAST(SUBSTRING(C_unique_id, 4) AS UNSIGNED) DESC LIMIT 1'
            );
            
            const lastId = lastIdResult[0]?.C_unique_id || 'DF_0';
            const lastNumericPart = parseInt(lastId.split('_')[1]) || 0;
            let nextId = lastNumericPart + 1;

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

            // Prepare values array
            const values = customerData.map(record => [
                record[headerMapping['loan_card_no']], record[headerMapping['c_name']], 
                record[headerMapping['product']], record[headerMapping['CRN']], 
                record[headerMapping['bank_name']], record[headerMapping['banker_name']], 
                record[headerMapping['agent_name']], record[headerMapping['tl_name']], 
                record[headerMapping['fl_supervisor']], record[headerMapping['DPD_vintage']], 
                record[headerMapping['POS']], record[headerMapping['emi_AMT']], 
                record[headerMapping['loan_AMT']], record[headerMapping['paid_AMT']],
                formatDate(record[headerMapping['paid_date']]), record[headerMapping['settl_AMT']], 
                record[headerMapping['shots']], record[headerMapping['resi_address']], 
                record[headerMapping['pincode']], record[headerMapping['office_address']], 
                record[headerMapping['mobile']], record[headerMapping['ref_mobile']], 
                record[headerMapping['calling_code']], record[headerMapping['calling_feedback']], 
                record[headerMapping['field_feedback']], record[headerMapping['new_track_no']],
                record[headerMapping['field_code']], `DF_${nextId++}`
            ]);

            // Perform bulk insert
            const [insertResult] = await connection.query(insertQuery, [values]);
            recordsUploaded = insertResult.affectedRows;
            await connection.commit();
        }

        // Clear the upload data if it exists
        if (uploadDataStore.has(uploadId)) {
            uploadDataStore.delete(uploadId);
        }

        clearTimeout(timeout);
        res.status(200).json({ 
            success: true,
            message: proceed ? `Successfully uploaded ${recordsUploaded} records` : 'Upload cancelled',
            recordsUploaded
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