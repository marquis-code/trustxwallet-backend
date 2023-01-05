"use strict";

const mongoose = require("mongoose");
let OTPVerificationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
    },
    otp: {
      type: String,
    },
    expiresAt: {
      type: Date,
    },
    createdAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const OTPVerification = mongoose.model(
  "OTPVerification",
  OTPVerificationSchema
);

module.exports = OTPVerification;
