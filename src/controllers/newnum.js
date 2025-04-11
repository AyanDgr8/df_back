// src/controllers/newnum.js

import connectDB from '../db/index.js';

// Function to check if customer exists by phone number
export const checkCustomerByPhone = async (req, res) => {
  const { mobile } = req.params;

  try {
    // Establish database connection
    const connection = await connectDB();

    // Query to check if customer exists
    const [rows] = await connection.execute(
      'SELECT * FROM customers WHERE mobile = ?',
      [mobile]
    );

    // If customer exists, return their data
    if (rows.length > 0) {
      res.status(200).json({ exists: true, customer: rows[0] });
    } else {
      // If customer does not exist, respond with exists: false
      res.status(404).json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking customer by phone:', error);
    res.status(500).json({ message: 'Failed to check customer' });
  }
};


export const insertPrimaryNum = async(req, res)=>{
  const { mobile } = req.params;

  try {
    // Establish database connection
    const connection = await connectDB();

    // Query to check if customer exists
    const [rows] = await connection.execute(
      'INSERT * FROM customers WHERE mobile = ?',
      [mobile]
    );

    // If customer exists, return their data
    if (rows.length > 0) {
      res.status(200).json({ exists: true, customer: rows[0] });
    } else {
      // If customer does not exist, respond with exists: false
      res.status(404).json({ exists: false });
    }
  } catch (error) {
    console.error('Error checking customer by phone:', error);
    res.status(500).json({ message: 'Failed to check customer' });
  }
};

