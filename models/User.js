const mongoose = require("mongoose");

let UserSchema = new mongoose.Schema(
  {
    avatar: {
      type: String,
    },
    cloudinary_id: {
      type: String,
    },
    userType: {
      type: String,
      enum: ["shopper", "freelancer", "dropshipper", "merchant"],
      default: "shopper",
    },
    phone: {
      type: String,
    },
    email: {
      type: String,
      required: false,
    },
    firstName: {
      type: String,
      required: false,
    },
    middleName: {
      type: String,
      required: false
    },
    surname: {
      type: String,
      required: false,
    },
    shippingAddress: {
      type: String,
      required: false,
    },
    category: {
      type: String,
      required: false,
    },
    password: {
      type: String,
      required: true,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    mainWalletBalance: {
      type: Number,
      default: 0
    },
    escrowWalletBalance: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", UserSchema);

module.exports = User;
