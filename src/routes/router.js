// src/routes/router.js

import express from 'express';
import teamRoutes from './teamRoutes.js';

import {
    searchCustomers,
    getAllCustomers,
    assignCustomerToTeam,
    checkDuplicates,
    getTeamRecords,
    getCustomersByDateRange
} from '../controllers/customers.js';

import { deleteCustomer, deleteMultipleCustomers } from '../controllers/deleteCustomers.js';

import { makeNewRecord, createCustomer } from '../controllers/createCustomers.js';

import { updateCustomer, historyCustomer, gethistoryCustomer } from '../controllers/updateCustomers.js';

import { 
    registerCustomer, 
    loginCustomer, logoutCustomer, 
    fetchCurrentUser, forgotPassword, 
    resetPasswordWithToken, resetPassword,
    sendOTP,
    getTeams, checkSession 
} from '../controllers/sign.js';

import { getReminders, getAllReminders } from '../controllers/schedule.js';

import { uploadCustomerData, confirmUpload } from '../controllers/uploadFile.js';
import { downloadCustomerData } from '../controllers/downloadFile.js';
import { authenticateToken } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/checkPermission.js';

import { checkCustomerByPhone } from '../controllers/newnum.js';

import restrictUsers from '../middlewares/restrictUsers.js';

import { validateSession } from '../middlewares/sessionMiddleware.js';

import { createUser, getAllUsers, getTeamMembers } from '../controllers/users.js';

const router = express.Router();

// Mount team routes
router.use('/', teamRoutes);

// Route for user registration
router.post('/register', restrictUsers, async (req, res) => {
    try {
        await registerCustomer(req, res);
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Registration failed' });
    }
});
// Route for user login
router.post('/login', loginCustomer);

// Route for sending OTP (reset password link)
router.post('/send-otp', sendOTP);

// Route for resetting password with token
router.post('/reset-password/:id/:token', resetPasswordWithToken);

// Route for forgot password
router.post('/forgot-password', forgotPassword);

// Route for resetting password with token
router.post('/reset-password/:token', resetPassword);


// Route for user logout
router.post('/logout', authenticateToken, logoutCustomer);

// Route to check session
router.get('/check-session', validateSession, checkSession);

router.get('/players/teams', getTeams);

// Route to get latest customers based on role
router.get('/customers', authenticateToken, checkPermission('view_customer'), getAllCustomers);

// Route to search customers
router.get('/customers/search', authenticateToken, checkPermission('view_customer'), searchCustomers);

// Add these after your existing /customers route
router.get('/customers/team', authenticateToken, checkPermission('view_team_customers'), getAllCustomers);
router.get('/customers/assigned', authenticateToken, checkPermission('view_assigned_customers'), getAllCustomers);

// Add these after your customer/new route
router.patch('/customers/phone/:mobile/updates', authenticateToken, checkPermission('edit_customer'), updateCustomer);
router.put('/customers/:id', authenticateToken, checkPermission('edit_customer'), updateCustomer);

router.delete('/customers/:id', authenticateToken, checkPermission('delete_customer'), deleteCustomer);
router.post('/customers/delete-multiple', authenticateToken, checkPermission('delete_customer'), deleteMultipleCustomers);

// Route to check if customer exists by phone number
router.get('/customers/phone/:mobile', authenticateToken, checkPermission('view_customer'), checkCustomerByPhone);

// Route to create a new customer record
router.post('/customer/new', authenticateToken, checkPermission('create_customer'), makeNewRecord);

// Route to create a new customer record with a new number 
router.post('/customer/new/:mobile', authenticateToken, checkPermission('create_customer'), makeNewRecord);

// Route to create a new customer
router.post('/customers/new', authenticateToken, checkPermission('create_customer'), createCustomer);

// Change history routes
router.get('/customers/log-change/:id', authenticateToken, checkPermission('view_customer'), gethistoryCustomer);
router.post('/customers/log-change', authenticateToken, checkPermission('edit_customer'), historyCustomer);

// File upload routes
router.post('/upload', authenticateToken, checkPermission('upload_document'), uploadCustomerData);
router.post('/upload/confirm', authenticateToken, checkPermission('upload_document'), confirmUpload);

// Route to fetch current user
router.get('/current-user', authenticateToken, fetchCurrentUser);

// Reminder routes
router.get('/customers/reminders', authenticateToken, getReminders);
router.get('/customers/getAllReminders', authenticateToken, getAllReminders);

// Route to assign customers to team/agent
router.post('/customers/assign-team', authenticateToken, assignCustomerToTeam);

// Route to download customer data with date filter
router.get('/customers/download', authenticateToken, checkPermission('download_data'), downloadCustomerData);

// Route to get customers by date range
router.get('/customers/date-range', authenticateToken, checkPermission('download_data'), getCustomersByDateRange);

// Route to check duplicates
router.post('/customers/check-duplicates', authenticateToken, checkDuplicates);

// Route to get team records with field mapping
router.post('/records_info', getTeamRecords);

// User management routes
router.post('/users/create', authenticateToken, createUser);
router.get('/users/all', authenticateToken, getAllUsers);
router.get('/users/team/:teamId', authenticateToken, getTeamMembers);

export default router;
