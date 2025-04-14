// src/controllers/uploadFile.js

import connectDB from '../db/index.js';
import { v4 as uuid } from 'uuid';

// Use a Map to store upload data temporarily
const uploadDataStore = new Map();

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

                // Check for duplicates based on CRN + loan_card_no + c_name + mobile combination
                const [existingCustomer] = await connection.query(
                    'SELECT id, CRN FROM customers WHERE CRN = ? OR (loan_card_no = ? AND c_name = ? AND mobile = ?)',
                    [
                        record[headerMapping['CRN']], 
                        record[headerMapping['loan_card_no']], 
                        record[headerMapping['c_name']], 
                        record[headerMapping['mobile']]
                    ]
                );

                if (existingCustomer.length > 0) {
                    // For duplicates, store both the new and existing record data
                    const [existingRecordData] = await connection.query(
                        'SELECT CRN, loan_card_no, c_name, mobile FROM customers WHERE id = ?',
                        [existingCustomer[0].id]
                    );
                    
                    duplicates.push({
                        new_record: record,
                        existing_record: existingRecordData[0]
                    });
                } else {
                    newRecords.push(record);
                }
            }

            const totalRecords = customerData.length;
            const duplicateCount = duplicates.length;
            const uniqueRecords = newRecords.length;

            // If there are duplicates, store them temporarily and return the info
            if (duplicates.length > 0) {
                const uploadId = uuid();
                uploadDataStore.set(uploadId, {
                    duplicates,
                    newRecords,
                    headerMapping,
                    timestamp: Date.now()
                });

                await connection.rollback();
                return res.json({
                    success: false,
                    message: 'Duplicate records found',
                    duplicates: duplicates.map(d => ({
                        new_record: d.new_record,
                        existing_record: d.existing_record
                    })),
                    duplicateCount,
                    totalRecords,
                    uniqueRecords,
                    uploadId
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
    let connection;
    let recordsUploaded = 0;
    
    try {
        const { uploadId, proceed, duplicateActions } = req.body;

        if (!uploadId) {
            return res.status(400).json({ 
                success: false,
                message: 'Upload ID is required' 
            });
        }

        if (!proceed) {
            uploadDataStore.delete(uploadId);
            return res.json({ 
                success: true,
                message: 'Upload cancelled',
                recordsUploaded: 0
            });
        }

        const uploadData = uploadDataStore.get(uploadId);
        if (!uploadData) {
            return res.status(404).json({ 
                success: false,
                message: 'Upload data not found or expired. Please try uploading again.' 
            });
        }

        const { duplicates, newRecords, headerMapping } = uploadData;
        const pool = await connectDB();
        connection = await pool.getConnection();

        await connection.beginTransaction();

        // Alter the CRN column to support longer values
        const alterTableQuery = `
            ALTER TABLE customers 
            MODIFY COLUMN CRN VARCHAR(50)
        `;
        try {
            await connection.query(alterTableQuery);
        } catch (error) {
            // If error is "Duplicate column" or "Column already exists", we can proceed
            if (!error.message.includes('Duplicate') && !error.message.includes('already exists')) {
                throw error;
            }
        }

        // Process new records first
        if (newRecords.length > 0) {
            // Get the latest C_unique_id
            const [lastIdResult] = await connection.query(
                'SELECT C_unique_id FROM customers ORDER BY CAST(SUBSTRING(C_unique_id, 4) AS UNSIGNED) DESC LIMIT 1'
            );
            
            const lastId = lastIdResult[0]?.C_unique_id || 'DF_0';
            const lastNumericPart = parseInt(lastId.split('_')[1]) || 0;
            let nextId = lastNumericPart + 1;

            // First, get all column names in order
            const [columns] = await connection.query('SHOW COLUMNS FROM customers');
            const columnNames = columns.map(col => col.Field)
                .filter(name => !['id', 'date_created', 'last_updated', 'scheduled_at'].includes(name));

            const insertQuery = `INSERT INTO customers (${columnNames.join(', ')}) VALUES ?`;

            const values = newRecords.map(record => {
                const values = [];
                columnNames.forEach(colName => {
                    if (colName === 'C_unique_id') {
                        values.push(`DF_${nextId++}`);
                    } else {
                        const value = colName === 'paid_date' 
                            ? formatDate(record[headerMapping[colName]])
                            : record[headerMapping[colName]] || null;
                        values.push(value);
                    }
                });
                return values;
            });

            const [insertResult] = await connection.query(insertQuery, [values]);
            recordsUploaded += insertResult.affectedRows;
        }

        // Handle duplicate records based on individual actions
        if (duplicates.length > 0) {
            for (const [index, duplicate] of duplicates.entries()) {
                const action = duplicateActions[index] || 'skip';
                const record = duplicate.new_record;
                
                if (action === 'skip') {
                    continue;
                }
                
                if (action === 'append') {
                    // Get the latest C_unique_id again as it might have changed
                    const [lastIdResult] = await connection.query(
                        'SELECT C_unique_id FROM customers ORDER BY CAST(SUBSTRING(C_unique_id, 4) AS UNSIGNED) DESC LIMIT 1'
                    );
                    
                    const lastId = lastIdResult[0]?.C_unique_id || 'DF_0';
                    const lastNumericPart = parseInt(lastId.split('_')[1]) || 0;
                    const newCUniqueId = `DF_${lastNumericPart + 1}`;

                    // Get column names
                    const [columns] = await connection.query('SHOW COLUMNS FROM customers');
                    const columnNames = columns.map(col => col.Field)
                        .filter(name => !['id', 'date_created', 'last_updated', 'scheduled_at'].includes(name));

                    // Find the highest suffix number for this CRN
                    const [suffixResult] = await connection.query(
                        'SELECT CRN FROM customers WHERE CRN LIKE ?',
                        [`${record[headerMapping['CRN']]}\\_%`]
                    );
                    
                    let suffix = 1;
                    if (suffixResult.length > 0) {
                        const suffixes = suffixResult.map(r => {
                            const match = r.CRN.match(/.*__(\d+)$/);
                            return match ? parseInt(match[1]) : 0;
                        });
                        suffix = Math.max(...suffixes) + 1;
                    }

                    const newCRN = `${record[headerMapping['CRN']]}__${suffix}`;
                    const insertQuery = `INSERT INTO customers (${columnNames.join(', ')}) VALUES (${columnNames.map(() => '?').join(', ')})`;
                    
                    const values = columnNames.map(colName => {
                        if (colName === 'C_unique_id') {
                            return newCUniqueId;
                        }
                        if (colName === 'CRN') {
                            return newCRN;
                        }
                        const value = colName === 'paid_date'
                            ? formatDate(record[headerMapping[colName]])
                            : record[headerMapping[colName]] || null;
                        return value;
                    });

                    const [insertResult] = await connection.query(insertQuery, values);
                    recordsUploaded += insertResult.affectedRows;
                } else if (action === 'replace') {
                    // Keep the existing C_unique_id when replacing records
                    const [existingRecord] = await connection.query(
                        'SELECT C_unique_id FROM customers WHERE CRN = ?',
                        [record[headerMapping['CRN']]]
                    );

                    // Get column names for update
                    const [columns] = await connection.query('SHOW COLUMNS FROM customers');
                    const columnNames = columns.map(col => col.Field)
                        .filter(name => !['id', 'C_unique_id', 'date_created', 'last_updated', 'scheduled_at'].includes(name));

                    const updateQuery = `UPDATE customers SET ${
                        columnNames.map(col => `${col} = ?`).join(', ')
                    } WHERE CRN = ?`;

                    const values = columnNames.map(colName => {
                        const value = colName === 'paid_date'
                            ? formatDate(record[headerMapping[colName]])
                            : record[headerMapping[colName]] || null;
                        return value;
                    });
                    values.push(record[headerMapping['CRN']]); // Add CRN for WHERE clause

                    const [updateResult] = await connection.query(updateQuery, values);
                    recordsUploaded += updateResult.affectedRows;
                }
            }
        }

        await connection.commit();
        uploadDataStore.delete(uploadId);

        res.status(200).json({ 
            success: true,
            message: `Successfully processed ${recordsUploaded} records`,
            recordsUploaded
        });
        
    } catch (error) {
        console.error('Error in confirmUpload:', error);
        
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