const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['general', 'store', 'payment', 'academy', 'notifications'],
    unique: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("Settings", settingsSchema);