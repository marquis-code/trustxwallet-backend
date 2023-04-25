const mongoose = require("mongoose");

let WalletSchema = new mongoose.Schema(
    {
        trustId: {
            type: String,
            required: true,
            trim: true,
            immutable: true,
            unique: true
        },
        balance: {
            type: mongoose.Decimal128,
            required: true,
            default: 0.00
        },

    },
    {
        timestamps: true,
    }
);

const Wallets = mongoose.model("Wallet", WalletSchema);

module.exports = Wallets;
