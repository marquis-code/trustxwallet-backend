const mongoose = require("mongoose");
let AdminVerificationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
    },
    uniqueString: {
      type: String,
    },
    createdAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const AdminVerification = mongoose.model(
  "AdminVerification",
  AdminVerificationSchema
);

module.exports = AdminVerification;
