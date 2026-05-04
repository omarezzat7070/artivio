// @desc    Create Stripe checkout session
// @route   POST /api/payment/create-checkout-session
// @access  Private
exports.createCheckoutSession = asyncHandler(async (req, res) => {
  console.log('=== Create Checkout Session Called ===');
  console.log('User ID:', req.user?._id);
  console.log('User role:', req.user?.role);
  console.log('Request body:', { ...req.body, payment: 'hidden' });
  
  const { items, successUrl, cancelUrl, paymentMethod } = req.body;
  
  if (!items || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No items provided'
    });
  }
  
  // Calculate total amount
  let totalAmount = 0;
  const lineItems = [];
  
  for (const item of items) {
    const itemTotal = item.price * item.quantity;
    totalAmount += itemTotal;
    
    lineItems.push({
      price_data: {
        currency: 'egp',
        product_data: {
          name: item.name,
          metadata: {
            itemId: item.id,
            itemType: item.type
          }
        },
        unit_amount: Math.round(item.price * 100), // Convert to cents/piastres
      },
      quantity: item.quantity,
    });
  }
  
  // Add shipping
  const SHIPPING_COST = 97;
  totalAmount += SHIPPING_COST;
  
  lineItems.push({
    price_data: {
      currency: 'egp',
      product_data: {
        name: 'Shipping',
      },
      unit_amount: SHIPPING_COST * 100,
    },
    quantity: 1,
  });
  
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: paymentMethod === 'card' ? ['card'] : ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: req.user._id.toString(),
        items: JSON.stringify(items.map(i => ({ id: i.id, type: i.type, quantity: i.quantity }))),
        paymentMethod: paymentMethod
      },
    });
    
    // Create order record
    const order = await Order.create({
      user: req.user._id,
      items: items.map(item => ({
        item: item.id,
        itemType: item.type,
        name: item.name,
        price: item.price,
        quantity: item.quantity
      })),
      amount: totalAmount,
      shippingCost: SHIPPING_COST,
      paymentMethod: paymentMethod,
      paymentStatus: 'pending',
      stripeSessionId: session.id
    });
    
    console.log('Order created:', order._id);
    console.log('Stripe session created:', session.id);
    console.log('Redirect URL:', session.url);
    
    res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
      orderId: order._id
    });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment session'
    });
  }
});