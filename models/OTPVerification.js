"use strict";

const mongoose = require("mongoose");
let OTPVerificationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
    },
    otp: {
      type: String,
      minlength: 4,
      maxlength: 4,
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
