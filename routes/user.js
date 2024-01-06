const express = require("express");
let router = express.Router();
const User = require("../models/User");
require("dotenv").config();
const cloudinary = require("../utils/cloudinary");
const upload = require("../utils/multer");
const OTPVerification = require("../models/OTPVerification");
const Transactions = require('../models/Transactions');
const Wallets = require('../models/Wallet');
const PurchaseEscrowOrder = require("../models/PurchaseEscrowOrder");
const StandingEscrowOrder = require("../models/StandingEscrowOrder");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require('axios');
const _ = require('lodash');
const twilio = require('twilio');
const MessagingResponse = twilio.twiml.MessagingResponse;
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;


router.post("/signup", upload.single("profile"), async (req, res) => {
  try {
    const { phone, password, userType, email } = req.body;

    const user = await User.findOne({ phone });

    // if (!req.file) {
    //   return res
    //     .status(400)
    //     .json({ errorMessage: "Please upload  profile image" });
    // }

    if (user) {
      return res.status(400).json({ errorMessage: "User Already Exist" });
    }



    // const upload_response = await cloudinary.uploader.upload(req.file.path);


    const salt = await bcrypt.genSalt(10);
    let hashedPassword = await bcrypt.hash(password, salt);

    // let trustId = phone.slice(1);

    // await Wallets.create({ trustId });

    const newUser = new User({
      phone,
      password: hashedPassword,
      verified: false,
      email,
      userType,
    });

    let result = await newUser.save();

    await sendOTPVerification(result, res)

    // return res.status(201).json({
    //   status: true,
    //   message: 'Account was successfully created.',
    //   data: result
    // })

  } catch (error) {
    console.log(error);
    // res.status(500).json({ message: 'Failed to user', })
  }
});

router.post('/update-profile/:id', upload.single("profile"), async (req, res) => {
  try {
    let user = await User.findById(req.params.id);
    if (user.cloudinary_id) {
      await cloudinary.uploader.destroy(user.cloudinary_id);
    }

    let result;

    if (req.file) {
      result = await cloudinary.uploader.upload(req.file.path);
    }

    if (!user) {
      return res.status(400).json({
        errorMessage: `User with ${req.params.id} does not exist.`
      })
    }

    const data = {
      firstName: req.body.firstName || user.firstName,
      middleName: req.body.firstName || user.middleName,
      surname: req.body.surname || user.surname,
      shippingAddress: req.body.shippingAddress || user.shippingAddress,
      phone: req.body.phone || user.phone,
      category: req.body.category || user.category,
      avatar: result?.secure_url || user.avatar,
      cloudinary_id: result?.public_id || user.cloudinary_id,
    };

    user = await User.findByIdAndUpdate(req.params.id, data, {
      new: true,
    });

    return res.status(200).json({
      successMessage: 'Profile was successfully updated',
    });
  } catch (error) {
    return res.status(500).json({ errorMessage: "Something went wrong" });
  }
})

router.post('/credit-wallet', (req, res) => {
  const { trustCode } = req.body;
})


const sendOTPVerification = async ({ _id, phone }, res) => {
  try {
    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;
    let message = `
    Hello From TrustXWallet
    Please enter the OTP ${otp} to verify your account.
    This OTP is valid for 10 minutes.
    `

    const saltRounds = 10;
    const hashedOtp = await bcrypt.hash(otp, saltRounds);
    const newOTPVerification = await OTPVerification({
      userId: _id,
      otp: hashedOtp,
      expiresAt: Date.now() + 600000,
      createdAt: Date.now(),
    });
    await newOTPVerification.save();
    const client = require('twilio')(accountSid, authToken);
    client.messages
      .create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: '+12017309234'
      }).catch((error) => {
        console.log(error);
      })
    return res.status(200).json({
      successMessage: "Verification OTP sent.",
      data: { userId: _id, phone, message, otp },
    });
  } catch (error) {
    if (error.status === 403) {
      return res.status(403).json({
        errorMessage:
          "OOPS! This Reciepient is not authorized on the email service. Please Upgrade your email plan",
      });
    } else {
      return res.status(500).json({
        errorMessage: "Something went wrong.",
      });
    }
  }
};

router.post("/verifyOtp", async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findOne({ _id: userId });

    if (!userId || !otp) {
      return res.status(400).json({
        errorMessage: "Empty OTP details are not allowed.",
      });
    } else {
      const userOTPVerificationRecords = await OTPVerification.find({
        userId,
      });

      if (userOTPVerificationRecords.length <= 0) {
        return res.status(400).json({
          errorMessage:
            "Account record doesn't exist or has been verified already. Please signup or log in",
        });
      } else {
        const { expiresAt } = userOTPVerificationRecords[0];
        const hashedOtp = userOTPVerificationRecords[0].otp;

        if (expiresAt < Date.now()) {
          await OTPVerification.deleteMany({ userId });
          return res.status(400).json({
            errorMessage: "Code has expired. Please request again.",
          });
        } else {
          const validOtp = await bcrypt.compare(otp, hashedOtp);

          if (!validOtp) {
            return res.status(400).json({
              errorMessage: "Invalid code passed. Check your phone inbox.",
            });
          } else {
            await User.updateOne({ _id: userId }, { verified: true });
            await OTPVerification.deleteMany({ userId });

            return res.status(200).json({
              successMessage: "Phone Number has been verified.",
              user: user,
            });
          }
        }
      }
    }
  } catch (error) {
    return res.status(500).json({
      errorMessage: error.message,
    });
  }
});



router.post("/signin", async (req, res) => {
  const { trustId, password } = req.body;

  let formattedTrustId = `0${trustId}`

  try {
    const user = await User.findOne({ phone: formattedTrustId }).select("+password");
    if (!user) {
      return res.status(404).json({ errorMessage: "User Not Found" });
    }

    if (!user.verified) {
      return res.status(404).json({
        errorMessage: "Email has not been verified yet. Check your phone inbox.",
      });
    } else {
      const isMatchPassword = bcrypt.compare(password, user.password);

      if (!isMatchPassword) {
        return res
          .status(400)
          .json({ errorMessage: "Invalid Login Credentials" });
      }

      const jwtPayload = { _id: user._id };

      const accessToken = jwt.sign(jwtPayload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE,
      });

      return res.status(200).json({
        user,
        accessToken
      })
    }
  } catch (error) {
    return res
      .status(500)
      .json({ errorMessage: "Something went wrong, please try again." });
  }
});

router.post('/new-purchase-escrow', async (req, res) => {
  try {
    const { trustId, address, productNarration, phoneNumber, price, deliveryMethod, requestingUser } = req.body;




    const trustCode = `${Math.floor(1000 + Math.random() * 9000)}`;



    let foundBuyer = await User.find({ phone: phoneNumber })
    let foundSeller = await User.find({ phone: `0${trustId}` })

    if (!foundBuyer) {
      return res.status(404).json({
        errorMessage: 'Shopper does not exist'
      })
    }

    if (!foundSeller) {
      return res.status(404).json({
        errorMessage: 'Seller does not exist'
      })
    }

    // if (foundBuyer.mainWalletBalance <= price) {
    //   return res.status(404).json({
    //     errorMessage: 'Sorry, You do not have Enough fund to perform this transaction. Please fund your wallet and try again.'
    //   })
    // }

    // let updatedWalletBalance = foundBuyer.mainWalletBalance - price;

    // const updatedBuyerProfile = {
    //   mainWalletBalance: updatedWalletBalance,
    //   escrowWalletBalance: result.escrowWalletBalance += price
    // };

    // const updatedSellerProfile = {
    //   escrowWalletBalance: foundSeller.escrowWalletBalance += price
    // };

    // User.findByIdAndUpdate(foundSeller.id, updatedSellerProfile, {
    //   new: true,
    // })
    //   .then(() => {
    //     return res
    //       .status(200)
    //       .json({ successMessage: `Seller data was successfully updated` });
    //   })
    //   .catch(() => {
    //     return res.status(500).json({ errorMessage: "Something went wrong" });
    //   });

    // User.findByIdAndUpdate(foundBuyer.id, updatedBuyerProfile, {
    //   new: true,
    // })
    //   .then(() => {
    //     return res
    //       .status(200)
    //       .json({ successMessage: `Buyer data was successfully updated` });
    //   })
    //   .catch(() => {
    //     return res.status(500).json({ errorMessage: "Something went wrong" });
    //   });

    const newPurchaseEscrowOrder = new PurchaseEscrowOrder({
      trustId,
      address,
      productNarration,
      phoneNumber,
      price,
      deliveryMethod,
      requestingUser,
      productTrustCode: trustCode,
    });

    const message = `
       A new escrow order has been made to trustID ${trustId} from buyer ${phoneNumber}                                                
       Please check your email for further details.
    `

    const client = require('twilio')(accountSid, authToken);
    client.messages
      .create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+234${trustId}`
      }).catch((error) => {
        console.log(error);
      })
    let result = await newPurchaseEscrowOrder.save();
    return res.status(200).json({
      successMessage: "Escrow Order created successfully",
      data: { trustCode: result.productTrustCode, amount: result.price },
    });

  } catch (error) {
    console.log(error);
    // return res
    //   .status(500)
    //   .json({ errorMessage: "Something went wrong, please try again." });
  }
})


router.post('/new-standing-escrow', async (req, res) => {
  try {
    const { merchantTrustId, address, productNarration, phoneNumber, price, deliveryMethod, requestingUserTrustId, requestingUser } = req.body;

    // let foundBuyer = await User.find({ phone: `0${requestingUserTrustId}` })
    // let foundSeller = await User.find({ phone: `0${trustId}` })
    let foundRequestingUser = await User.findOne({ phone: `0${requestingUserTrustId}` })

    let foundMerchant = await User.findOne({ phone: `0${merchantTrustId}` })

    if (!foundRequestingUser) {
      return res.status(404).json({ errorMessage: `${requestingUser} with Trust ID was Not Found` });
    }

    const updatedDropShipperProfile = {
      escrowWalletBalance: foundRequestingUser.escrowWalletBalance -= price,
      standingEscrowBalance: foundRequestingUser.standingEscrowBalance += price
    }

    User.findByIdAndUpdate(foundRequestingUser.id, updatedDropShipperProfile, {
      new: true,
    })
      .then(() => {
        return res
          .status(200)
          .json({ successMessage: `Seller data was successfully updated` });
      })
      .catch(() => {
        return res.status(500).json({ errorMessage: "Something went wrong" });
      });

    if (!foundMerchant) {
      return res.status(404).json({ errorMessage: "Merchant with Trust ID was not found" });
    }

    // if (foundRequestingUser.escrowWalletBalance <= price) {
    //   return res.status(404).json({
    //     errorMessage: 'Sorry, You do not have Enough fund to perform this transaction. Please fund your wallet and try again.'
    //   })
    // }

    // let updatedEscrowWalletBalance = foundRequestingUser.escrowWalletBalance -= price'

    // const updatedSellerProfile = {
    //   escrowWalletBalance: foundSeller.escrowWalletBalance += price
    // };

    // const updatedBuyerProfile = {
    //   escrowWalletBalance: updatedEscrowWalletBalance
    // };

    // let updatedWalletBalance = foundBuyer.mainWalletBalance - price;


    // User.findByIdAndUpdate(foundSeller.id, updatedSellerProfile, {
    //   new: true,
    // })
    //   .then(() => {
    //     return res
    //       .status(200)
    //       .json({ successMessage: `Seller data was successfully updated` });
    //   })
    //   .catch(() => {
    //     return res.status(500).json({ errorMessage: "Something went wrong" });
    //   });

    // User.findByIdAndUpdate(foundBuyer.id, updatedBuyerProfile, {
    //   new: true,
    // })
    //   .then(() => {
    //     return res
    //       .status(200)
    //       .json({ successMessage: `Buyer data was successfully updated` });
    //   })
    //   .catch(() => {
    //     return res.status(500).json({ errorMessage: "Something went wrong" });
    //   });



    const newStandingEscrowOrder = new StandingEscrowOrder({
      merchantTrustId,
      requestingUserTrustId,
      address,
      productNarration,
      phoneNumber,
      price,
      deliveryMethod,
      requestingUser
    });

    const message = `
       A new standing escrow order has been made to trustID ${merchantTrustId} from buyer ${phoneNumber}                                                
       Please check your email for further details.
    `

    const client = require('twilio')(accountSid, authToken);
    client.messages
      .create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+234${merchantTrustId}`
      }).catch((error) => {
        console.log(error);
      })
    let result = await newStandingEscrowOrder.save();
    return res.status(200).json({
      successMessage: "Standing Escrow Order created successfully",
      data: result,
    });

  } catch (error) {
    console.log(error);
    // return res
    //   .status(500)
    //   .json({ errorMessage: "Something went wrong, please try again." });
  }
})

// router.post('/transaction/verify', async (req, res) => {
//   try {
//     const { trustId, amount, reference } = req.body;

//     let output = await axios.get(`https://api-d.squadco.com/transaction/verify/${reference}`, {
//       headers: {
//         authorization: `Bearer ${process.env.SQUADCO_SECRET_KEY}`,
//         "content-type": "application/json",
//         "cache-control": "no-cache",
//       }
//     })

//     console.log(output);

//     if (!output.data && output.data.status !== 200) {
//       return res.status(400).json({
//         errorMessage: 'No internet connection'
//       })
//     }

//     if (output.data && output.data.data.transaction_status !== 'Success') {
//       return res.status(400).json({
//         errorMessage: 'Error verifying payment, Unknown transaction reference id'
//       })
//     }


//     let phoneNumber = `0${trustId}`
//     let user = await User.findOne({ phone: phoneNumber })

//     const updatedWallet = {
//       mainWalletBalance: user.mainWalletBalance += output.data.data.amount
//     }


//     await User.findByIdAndUpdate({ _id: user._id }, updatedWallet, {
//       new: true,
//     });

//     let previousBalance = user.mainWalletBalance
//     let newBalance = user.mainWalletBalance += amount

//     let newTransaction = new Transactions({
//       trnxType: 'CR',
//       purpose: 'deposit',
//       trustId: trustId,
//       amount: amount,
//       reference: reference,
//       trnxSummary: 'Fund wallet',
//       balanceBefore: previousBalance,
//       balanceAfter: newBalance
//     })

//     await newTransaction.save();

//     return res.status(200).json({
//       successMessage: 'Wallet updated successfully'
//     })

//   } catch (error) {
//     return res.status(500).json({
//       errorMessage: error.response.data.message
//     })
//   }
// })

router.post('/transaction/verify', async (req, res) => {
  try {
    const { trustId, amount, reference } = req.body;

    let output = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "content-type": "application/json",
        "cache-control": "no-cache",
      }
    })



    if (!output.data && output.data.status !== true) {
      return res.status(400).json({
        errorMessage: 'No internet connection'
      })
    }

    if (output.data && output.data.data.status !== 'success') {
      return res.status(400).json({
        errorMessage: 'Error verifying payment, Unknown transaction reference id'
      })
    }


    let phoneNumber = `0${trustId}`
    let user = await User.findOne({ phone: phoneNumber })

    let previousBalance = user.mainWalletBalance
    let newBalance = user.mainWalletBalance += amount

    let newTransaction = new Transactions({
      trnxType: 'CR',
      purpose: 'deposit',
      trustId: trustId,
      amount: amount,
      reference: reference,
      trnxSummary: 'Fund wallet',
      balanceBefore: previousBalance,
      balanceAfter: newBalance
    })

    await newTransaction.save();

    const updatedWallet = {
      mainWalletBalance: user.mainWalletBalance += output.data.data.amount / 100
    }


    await User.findByIdAndUpdate({ _id: user._id }, updatedWallet, {
      new: true,
    });



    return res.status(200).json({
      successMessage: 'Wallet updated successfully',
      wallet: {
        mainWalletBalance: user.mainWalletBalance,
        escrowWalletBalance: user.escrowWalletBalance

      }
    })

  } catch (error) {
    return res.status(500).json({
      errorMessage: error.response.data.message
    })
  }
})

router.post('/payment/withdraw', async (req, res) => {
  const { amount, trustId } = req.body;

  let phoneNumber = `0${trustId}`

  let user = await User.find({ phone: phoneNumber })

  if (user.mainWalletBalance < amount) {
    return res.status(400).json({
      errorMessage: 'You dont have enough funds to perform this transactionn'
    })
  }

  const updatedWallet = {
    mainWalletBalance: user.mainWalletBalance -= amount
  }

  User.findByIdAndUpdate(user.id, updatedWallet, {
    new: true,
  })
    .then(() => {
      return res
        .status(200)
        .json({ successMessage: `Withdrawal was successful` });
    })
    .catch(() => {
      return res.status(500).json({ errorMessage: "Something went wrong" });
    });
})


router.post('/release-fund', async (req, res) => {
  const { trustCode, merchantTrustId } = req.body;

  const order = await PurchaseEscrowOrder.findOne({ trustCode });


  if (!order) {
    return res.status(400).json({
      errorMessage: `Escrow order with trust code ${trustCode} was not found.`
    })
  }

  const user = await User.findOne({ trustId: order.trustId });

  const merchant = await User.findOne({ trustId: merchantTrustId });

  if (!user) {
    return res.status(400).json({
      errorMessage: `User with trust Id ${order.trustId} was not found.`
    })
  }

  const updatedBuyerProfile = {
    mainWalletBalance: user.mainWalletBalance -= order.price
  }

  const updatedSellerProfile = {
    mainWalletBalance: merchant.mainWalletBalance -= order.price,
    netProfitBalance: merchant.netProfitBalance += ((7.5 * order.price) / 100)
  }

  User.findByIdAndUpdate(user.id, updatedBuyerProfile, {
    new: true,
  })
    .then(() => {
      return res
        .status(200)
        .json({ successMessage: 'Funds was successfully removed from buyers account.' });
    })
    .catch(() => {
      return res.status(500).json({ errorMessage: "Something went wrong. Please try again." });
    });


  User.findByIdAndUpdate(merchant.id, updatedSellerProfile, {
    new: true,
  })
    .then(() => {
      return res
        .status(200)
        .json({ successMessage: 'Funds was successfully added to sellers account.' });
    })
    .catch(() => {
      return res.status(500).json({ errorMessage: "Something went wrong. Please try again." });
    });

  // let member = await Member.findById(_id);
  await order.remove();

  return res
    .status(200)
    .json({ successMessage: 'Fund release was sucessful.' });

})

router.post('/withdraw', async (req, res) => {
  const { amount, trustId } = req.body;
  const user = await User.findOne({ trustId })
  const updatedSellerProfile = {
    mainWalletBalance: user.mainWalletBalance -= amount
  }

  User.findByIdAndUpdate(user.id, updatedSellerProfile, {
    new: true,
  })
    .then(() => {
      return res
        .status(200)
        .json({ successMessage: 'Withdrawal was successful. Please check your bank.' });
    })
    .catch(() => {
      return res.status(500).json({ errorMessage: "Something went wrong. Please try again." });
    });

})

router.get("/transactions/:trustId", async (req, res) => {
  const userTrustId = req.params.trustId;
  try {
    const transactions = await Transactions.aggregate([
      { $match: { trustId: userTrustId } },
    ]);
    return res.status(200).json(transactions);
  } catch (error) {
    return res.status(500).json({
      errorMessage: "Something went wrong. Please try again later",
    });
  }
});


module.exports = router;
