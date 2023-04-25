const mongoose = require("mongoose");
const TransactionsSchema = new mongoose.Schema(
  {
    trnxType: {
      type: String,
      required: true,
      enum: ['CR', 'DR']
    },
    purpose: {
      type: String,
      enum: ['deposit', 'transfer', 'reversal', 'withdrawal'],
      required: true
    },
    // trustCode: {
    //   type: String,
    //   required: true,
    // },
    amount: {
      type: mongoose.Decimal128,
      required: true,
      default: 0.00
    },
    trustId: {
      type: String,
      required: true,
    },
    reference: { type: String, required: true },
    balanceBefore: {
      type: mongoose.Decimal128,
      required: true,
    },
    balanceAfter: {
      type: mongoose.Decimal128,
      required: true,
    },
    // summary: { type: String, required: true },
    trnxSummary: { type: String, required: true },
    // email: {
    //   type: String,
    //   required: true,
    // },
    // reference: {
    //   type: String,
    //   required: true,
    //   unique: true,
    // },
    // status: {
    //   type: String,
    //   required: true,
    // },
  },
  {
    timestamps: true,
  }
);

const Transactions = mongoose.model("Transactions", TransactionsSchema);

module.exports = Transactions;



