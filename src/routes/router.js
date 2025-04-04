// src/routes/router.js

import express from 'express';
import {
    gethistoryCustomer,
    searchCustomers,
    updateCustomer,
    historyCustomer,
    getAllCustomers,
    makeNewRecord,
    deleteCustomer,
    updateCustomerFieldsByPhone,
    getUsers,
    assignCustomerToTeam,
    downloadCustomerDataNew,
    checkDuplicates,
    getDepartmentRecords
} from '../controllers/customers.js';

import {
    loginCustomer, 
    logoutCustomer, 
    registerCustomer, 
    fetchCurrentUser,
    forgotPassword,
    resetPassword,
    sendOTP,
    resetPasswordWithToken,
    getDepartments,     
    handleRegistrationApproval
} from '../controllers/sign.js';

import { getReminders, getAllReminders } from '../controllers/schedule.js';

import { uploadCustomerData, confirmUpload } from '../controllers/uploadFile.js';
import { authenticateToken } from '../middlewares/auth.js';

import { checkCustomerByPhone } from '../controllers/newnum.js';

import restrictUsers from '../middlewares/restrictUsers.js';

const router = express.Router();

// Route for user registration
router.post('/register', restrictUsers, registerCustomer);

// Route for user login
router.post('/login', loginCustomer);

// Route for sending OTP (reset password link)
router.post('/send-otp', sendOTP);

// Route for resetting password with token
router.post('/reset-password/:id/:token', resetPasswordWithToken);

// Route for forgot password
router.post('/forgot-password', forgotPassword);

// Route for reset password
router.post('/reset-password/:token', resetPassword);

// Route for user logout
router.post('/logout', authenticateToken, logoutCustomer);

router.get('/departments', getDepartments);
router.post('/approve-registration',  handleRegistrationApproval);

// Route to get latest customers
router.get('/customers', authenticateToken, getAllCustomers);

// Route to search customers
router.get('/customers/search', authenticateToken, searchCustomers);

// Route to check if customer exists by phone number
router.get('/customers/phone/:phone_no', authenticateToken, checkCustomerByPhone);

// Route to create a new customer record
router.post('/customer/new', authenticateToken, makeNewRecord);

// Route to create a new customer record with a new number 
router.post('/customer/new/:phone_no',authenticateToken, makeNewRecord);

// Route to update a customer by ID
router.put('/customers/:id',authenticateToken, updateCustomer);

// Change history routes
router.get('/customers/log-change/:id', authenticateToken, gethistoryCustomer);
router.post('/customers/log-change', authenticateToken, historyCustomer);
router.patch('/customers/phone/:phone/updates', authenticateToken, updateCustomerFieldsByPhone);

// Route to delete a custom field
router.delete('/customer/:id', authenticateToken, deleteCustomer);

// File upload routes
router.post('/upload', authenticateToken, uploadCustomerData);
router.post('/upload/confirm', authenticateToken, confirmUpload);

// Route to fetch current user
router.get('/current-user', authenticateToken, fetchCurrentUser);

// Route to check reminders
router.get('/customers/reminders', authenticateToken, getAllReminders);

// Route to update specific customer fields by phone number
router.post('/customers/phone/:phone_no_primary/updates/', updateCustomerFieldsByPhone);

router.get('/users', authenticateToken, getUsers);

// Route to assign customer to team
router.post('/assign-customer', authenticateToken, assignCustomerToTeam);

// Route to download customer data with date filter
router.get('/download-data', authenticateToken, downloadCustomerDataNew);

// Route to check duplicates
router.post('/customers/check-duplicates', authenticateToken, checkDuplicates);

// Route to get department records with field mapping
router.post('/records_info', getDepartmentRecords);

export default router;
