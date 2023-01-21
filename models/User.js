const mongoose = require("mongoose");
let UserSchema = new mongoose.Schema(
  {
    avatar: {
      type: String,
    },
    cloudinary_id: {
      type: String,
    },
    username: {
      type: String,
    },
    phone: {
      type: String,
    },
    email: {
      type: String,
      required: true,
    },
    password: {
      type: String,
    },
    goods: { type: [String], default: undefined },
    alternative_email: {
      type: String,
    },
    alternative_phone: {
      type: String,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    trustId: {
      type: String,
    },
    termsAgreement: {
      type: Boolean,
      default: false,
    },
    wallet: {
      type: Number,
      default: "0",
    },
    successfulTransactions: {
      type: Number,
      default: "0",
    },
    transactionsInDispute: {
      type: String,
      default: "0",
    },
    userType: {
      type: String,
      enum: ["buyer", "seller"],
      default: "seller",
    },
    transactions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payment",
      },
    ],
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", UserSchema);

module.exports = User;
