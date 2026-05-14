const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  itemType: { type: String, enum: ['Product', 'Course'], required: true },
  item: { type: mongoose.Schema.Types.ObjectId, refPath: 'items.itemType', required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, default: 1 },
  price: { type: Number, required: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, default: '' },
  sellerStatus: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  sellerStatusUpdatedAt: { type: Date, default: null }
});

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [orderItemSchema],
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0.02 },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'egp' },
    stripeSessionId: { type: String },
    paymentMethod: {
      type: String,
      enum: ['card', 'instapay', 'cash', 'fake'],
      default: 'fake'
    },
    paymentDetails: { type: mongoose.Schema.Types.Mixed },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'paid' },
    hasCourse: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);