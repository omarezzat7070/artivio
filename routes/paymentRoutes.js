const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Order = require('../models/order');
const crypto = require('crypto');

// POST /api/payment/create-checkout-session
router.post('/create-checkout-session', protect, async (req, res) => {
  const { items, successUrl, cancelUrl, payment, paymentMethod } = req.body;
  
  // paymentMethod can be: 'card', 'instapay', 'cash'
  const selectedMethod = paymentMethod || 'card';

  if (!items || !items.length) {
    return res.status(400).json({ error: 'No items provided' });
  }

  try {
    // Calculate total amount
    const amount = items.reduce((sum, it) => sum + ((it.price || 0) * (it.quantity || 1)), 0);
    const TAX_RATE = 0.02; // 2% tax
    const tax = Number((amount * TAX_RATE).toFixed(2));
    const totalWithTax = Number((amount + tax).toFixed(2));
    
    const currency = 'egp';
    const fakeSessionId = 'fake_' + crypto.randomBytes(8).toString('hex');

    // Check if order contains courses
    const hasCourse = items.some(item => item.type === 'Course');

    // Cash on Delivery is NOT allowed for courses
    if (selectedMethod === 'cash' && hasCourse) {
      return res.status(400).json({ 
        error: 'Cash on Delivery is not available for courses. Please use Card or InstaPay.' 
      });
    }

    // Prepare payment details based on method
    let paymentDetails = {};
    let paymentStatus = 'paid'; // 🔥 CHANGED: Now auto-paid for ALL payment methods

    if (selectedMethod === 'card') {
      if (payment && payment.cardNumber) {
        const num = String(payment.cardNumber).replace(/\s+/g, '');
        paymentDetails = {
          cardLast4: num.slice(-4),
          cardholderName: payment.name || '',
          expiry: payment.expiry || '',
          type: 'card',
          billingAddress: payment.billingAddress || ''
        };
      }
      paymentStatus = 'paid';
    } 
    else if (selectedMethod === 'instapay') {
      paymentDetails = {
        type: 'instapay',
        phoneNumber: payment?.phoneNumber || '',
        status: 'completed' // 🔥 CHANGED: Auto-complete InstaPay
      };
      paymentStatus = 'paid'; // 🔥 CHANGED: Auto-paid for InstaPay
    } 
    else if (selectedMethod === 'cash') {
      paymentDetails = {
        type: 'cash_on_delivery',
        fullName: payment?.fullName || '',
        deliveryAddress: payment?.deliveryAddress || '',
        phoneNumber: payment?.phoneNumber || ''
      };
      paymentStatus = 'paid'; // 🔥 CHANGED: Auto-paid for Cash on Delivery
    }

    const order = await Order.create({
      user: req.user._id,
      items: items.map(i => ({
        itemType: i.type || 'Product',
        item: i.id || null,
        name: i.name || i.title || 'Item',
        quantity: i.quantity || 1,
        price: i.price || 0,
        description: i.description || ''
      })),
      amount: totalWithTax,
      subtotal: amount,
      tax: tax,
      taxRate: TAX_RATE,
      currency,
      stripeSessionId: fakeSessionId,
      paymentMethod: selectedMethod,
      paymentDetails,
      paymentStatus: paymentStatus,
      hasCourse: hasCourse
    });

    // For card payments, redirect to success
    // For instapay/cash, show order confirmation with instructions
    const fakeSession = { 
      url: (successUrl || '/') + '?session_id=' + fakeSessionId + '&method=' + selectedMethod, 
      id: fakeSessionId,
      paymentMethod: selectedMethod
    };
    
    res.json(fakeSession);
  } catch (err) {
    console.error('Payment create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payment/checkout-session
router.get('/checkout-session', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id is required' });

  try {
    const order = await Order.findOne({ stripeSessionId: session_id }).populate('user', 'name email');
    if (order) {
      return res.json({ 
        session: { 
          id: session_id, 
          payment_status: order.paymentStatus, 
          payment_method: order.paymentMethod,
          hasCourse: order.hasCourse
        }, 
        order 
      });
    }
    res.status(404).json({ error: 'Session not found' });
  } catch (err) {
    console.error('Error retrieving session:', err);
    res.status(500).json({ error: err.message });
  }
});

// Webhook for InstaPay (simulated)
router.post('/instapay-webhook', async (req, res) => {
  const { orderId, status, transactionId } = req.body;
  
  try {
    const order = await Order.findById(orderId);
    if (order && order.paymentMethod === 'instapay') {
      order.paymentStatus = status === 'completed' ? 'paid' : 'failed';
      order.paymentDetails.transactionId = transactionId;
      order.paymentDetails.status = status;
      await order.save();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Diagnostic config endpoint
router.get('/config', (req, res) => {
  res.json({
    stripeConfigured: false,
    fakePayments: true,
    supportedMethods: ['card', 'instapay', 'cash']
  });
});

module.exports = router;