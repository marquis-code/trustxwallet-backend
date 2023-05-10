const mongoose = require("mongoose");
let StandingEscrowOrderSchema = new mongoose.Schema(
    {
        merchantTrustId: {
            type: String,
            required: true
        },
        requestingUserTrustId: {
            type: String,
            required: true
        },
        address: {
            type: String,
            required: true,
        },
        productNarration: {
            type: String,
            required: true,
        },
        phoneNumber: {
            type: String,
            required: true,
        },
        price: {
            type: String,
            default: false,
        },
        deliveryMethod: {
            type: String,
            enum: ["logX", "alternative"],
            default: "logX",
        },
        
        productStatus: {
            type: String,
            enum: ["progress", "completed"],
            default: 'progress'
        },
        requestingUser: {
            type: String,
            enum: ["dropshipper"],
            default: "dropshipper",
        }
    },
    {
        timestamps: true,
    }
);

const StandingEscrowOrder = mongoose.model("StandingEscrowOrder", StandingEscrowOrderSchema);

module.exports = StandingEscrowOrder;
