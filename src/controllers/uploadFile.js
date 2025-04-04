// src/controllers/uploadFile.js

import connectDB from '../db/index.js';
import axios from 'axios';

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

            // Get department mappings for agents
            const [departmentResults] = await connection.query(
                'SELECT username, department_id FROM users WHERE role = "department_admin"'
            );
            
            if (departmentResults.length === 0) {
                return res.status(400).json({ 
                    message: 'No Department_Admin users found in the system.' 
                });
            }

            const agentToDepartment = {};
            departmentResults.forEach(row => {
                agentToDepartment[row.username] = row.department_id;
            });

            // Get the latest C_unique_id
            const [lastIdResult] = await connection.query(
                'SELECT C_unique_id FROM customers ORDER BY CAST(SUBSTRING(C_unique_id, 4) AS UNSIGNED) DESC LIMIT 1'
            );
            
            const lastId = lastIdResult[0]?.C_unique_id || 'FF_0';
            const lastNumericPart = parseInt(lastId.split('_')[1]) || 0;

            // Check for duplicates first
            const duplicates = [];
            const newRecords = [];
            const invalidAgents = [];
            
            for (const [index, customer] of customerData.entries()) {
                const phone = customer[headerMapping['phone_no']]?.toString().trim();
                const email = customer[headerMapping['email_id']]?.toString().trim();
                const agentName = customer[headerMapping['agent_name']]?.toString().trim();
                
                // Validate agent name if provided
                if (agentName && !agentToDepartment[agentName]) {
                    invalidAgents.push({
                        rowIndex: index + 1,
                        agentName: agentName
                    });
                    continue;
                }
                
                // Check if record already exists
                const [existing] = await connection.query(`
                    SELECT * FROM customers 
                    WHERE (phone_no = ? AND phone_no IS NOT NULL)
                    OR (email_id = ? AND email_id IS NOT NULL)
                `, [phone, email]);

                if (existing.length > 0) {
                    duplicates.push({
                        ...customer,
                        existing: existing[0]
                    });
                } else {
                    newRecords.push({
                        ...customer,
                        C_unique_id: `FF_${lastNumericPart + newRecords.length + 1}`
                    });
                }
            }

            const totalRecords = customerData.length;
            const duplicateCount = duplicates.length;
            const uniqueRecords = newRecords.length;
            const invalidAgentCount = invalidAgents.length;

            // If there are invalid agents, return error
            if (invalidAgents.length > 0) {
                return res.status(400).json({
                    message: 'Invalid agent names found',
                    invalidAgents,
                    error: 'INVALID_AGENTS'
                });
            }

            // Generate a unique upload ID
            const uploadId = Date.now().toString();
            
            // Store the processed data
            uploadDataStore.set(uploadId, {
                newRecords,
                headerMapping,
                agentToDepartment
            });

            await connection.commit();
            connection.release();

            res.status(200).json({ 
                message: 'Data processed successfully',
                totalRecords,
                duplicateCount,
                uniqueRecords,
                duplicates: duplicates.map(d => ({
                    ...d,
                    existing_record: d.existing
                })),
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
    const { uploadId, proceed } = req.body;
    
    if (!uploadId || !uploadDataStore.has(uploadId)) {
        return res.status(400).json({ message: 'No upload data found. Please upload again.' });
    }

    const { newRecords, headerMapping, agentToDepartment } = uploadDataStore.get(uploadId);
    const pool = await connectDB();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        if (proceed) {
            const definedColumns = [
                "first_name", "last_name", "phone_no",
                "whatsapp_num", "email_id", "yt_email_id",  
                "agent_name", "course", "age_group", "gender", 
                "profession", "investment_trading", "why_choose", 
                "language", "education", "region", "designation",
                "disposition", "comment", "mentor", "followup_count", 
                "C_unique_id"
            ];
            
            // Insert new records
            for (const record of newRecords) {
                const mappedCustomer = {};
                for (const [sysHeader, fileHeader] of Object.entries(headerMapping)) {
                    if (definedColumns.includes(sysHeader)) {
                        mappedCustomer[sysHeader] = record[fileHeader]?.toString().trim() || null;
                    }
                }
                mappedCustomer['C_unique_id'] = record.C_unique_id;

                const columns = Object.keys(mappedCustomer);
                const values = Object.values(mappedCustomer);
                const placeholders = columns.map(() => '?').join(',');

                const [result] = await connection.query(
                    `INSERT INTO customers (${columns.join(',')}) VALUES (${placeholders})`,
                    values
                );

                // Handle department assignment if needed
                const agentName = record[headerMapping['agent_name']]?.toString().trim();
                if (agentName && agentToDepartment[agentName]) {
                    await connection.query(`
                        INSERT INTO customer_department_assignments (customer_id, department_id, assigned_by)
                        VALUES (?, ?, ?)
                    `, [result.insertId, agentToDepartment[agentName], req.user?.userId]);
                }
            }
        }

        // Clear the upload data
        uploadDataStore.delete(uploadId);
        
        await connection.commit();
        connection.release();

        // Send WhatsApp welcome messages if records were uploaded
        if (proceed && newRecords.length > 0) {
            try {
                // Get authentication token from login endpoint
                const loginResponse = await axios.post('https://login.messgeblast.com:9443/login', {
                    email: "mohitgo2006@gmail.com",
                    password: "WELcome@12"
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-device-id': '0cd99797-13ef-407d-8bc0-df8033bb6891'
                    }
                });
        
                // Extract the auth token from the response
                const authToken = loginResponse.data.token;
                
                if (!authToken) {
                    console.error('Failed to get authentication token for WhatsApp messaging');
                } else {
                    // Use a Set to track processed phone numbers
                    const processedNumbers = new Set();
                    
                    // Add delay function for rate limiting
                    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
                    let retryCount = 0;
                    const maxRetries = 3;
                    
                    for (const record of newRecords) {
                        const phoneNo = record[headerMapping['phone_no']]?.toString().trim();
                        
                        // Skip if phone number is missing or already processed
                        if (!phoneNo || processedNumbers.has(phoneNo)) {
                            continue;
                        }
                        
                        // Format phone number if needed
                        let formattedNumber = phoneNo;
                        if (!formattedNumber.startsWith('+')) {
                            formattedNumber = '+' + formattedNumber;
                        }
                        
                        try {
                            // Implement exponential backoff
                            const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 5000);
                            await delay(backoffTime);
                            
                            const response = await axios.post('https://login.messgeblast.com:9443/schedule-message', {
                                instance_id: "MOGO",
                                recipient: formattedNumber,
                                message: "Multycomm !!"
                            }, {
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${authToken}`
                                }
                            });

                            // Update message ID validation to handle actual response format
                            if (response.status !== 200) {
                                throw new Error(`WhatsApp API returned status ${response.status}`);
                            }
        
                            // Mark this number as processed only after successful send
                            processedNumbers.add(phoneNo);
                            retryCount = 0; // Reset retry count on success
                            console.log(`WhatsApp welcome message sent to ${formattedNumber}`);
                            
                            // Add small delay between messages to prevent rate limiting
                            await delay(1000);
                        } catch (msgError) {
                            console.error(`Failed to send WhatsApp message to ${formattedNumber}:`, msgError.message);
                            retryCount++;
                            
                            if (retryCount >= maxRetries) {
                                console.error(`Max retries reached for ${formattedNumber}, skipping...`);
                                retryCount = 0;
                                continue;
                            }
                        }
                    }
                    
                    console.log(`WhatsApp welcome messages sent to ${processedNumbers.size} unique contacts`);
                }
            } catch (whatsappError) {
                console.error('Error sending WhatsApp welcome messages:', whatsappError.message);
            }
        }
        

        res.status(200).json({ 
            message: proceed ? 'Records uploaded successfully' : 'Upload cancelled',
            success: true,
            recordsProcessed: proceed ? newRecords.length : 0
        });

    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Error in confirmUpload:', error);
        res.status(500).json({ 
            message: 'Failed to process upload confirmation',
            error: error.message
        });
    }
};