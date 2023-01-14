const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    billingAddress: {
      type: String,
      required: true,
    },
    postalCode: {
      type: Number,
      required: true,
    },
    reference: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", PaymentSchema);

module.exports = Payment;
