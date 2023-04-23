const mongoose = require("mongoose");
let FundWithdrawalSchema = new mongoose.Schema(
    {
        fundSource: {
            type: String,
            required: true
        },
        transferLocation: {
            type: String,
            required: true,
        },
        amount: {
            type: String,
            required: true,
        }
    },
    {
        timestamps: true,
    }
);

const FundWithdrawal = mongoose.model("PurchaseEscrowOrder", FundWithdrawalSchema);

module.exports = FundWithdrawal;
