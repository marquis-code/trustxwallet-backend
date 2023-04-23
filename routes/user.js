const express = require("express");
let router = express.Router();
const User = require("../models/User");
require("dotenv").config();
const cloudinary = require("../utils/cloudinary");
const upload = require("../utils/multer");
const OTPVerification = require("../models/OTPVerification");
const Payment = require('../models/Payment');
const PurchaseEscrowOrder = require("../models/PurchaseEscrowOrder");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const axios = require('axios');
const _ = require('lodash');
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;


router.post("/signup", upload.single("profile"), async (req, res) => {
  try {
    const { email, phone, password, userType } = req.body;

    const user = await User.findOne({ phone });

    if (!req.file) {
      return res
        .status(400)
        .json({ errorMessage: "Please upload  profile image" });
    }

    if (user) {
      return res.status(400).json({ errorMessage: "User Already Exist" });
    }

    const upload_response = await cloudinary.uploader.upload(req.file.path);


    const salt = await bcrypt.genSalt(10);
    let hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      email,
      phone,
      password: hashedPassword,
      verified: false,
      userType,
      avatar: upload_response.url,
      cloudinary_id: upload_response.public_id,
    });

    let result = await newUser.save();

    await sendOTPVerification(result, res)
  } catch (error) {
    res.status(500).json({ message: 'Failed to user', })
  }
});


const sendOTPVerification = async ({ _id, email, phone }, res) => {
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
        to: `+234${phone.slice(1)}`
      }).catch((error) => {
        console.log(error);
      })
    return res.status(200).json({
      successMessage: "Verification OTP sent.",
      data: { userId: _id, email, phone },
    });
  } catch (error) {
    if (error.status === 403) {
      return res.status(403).json({
        errorMessage:
          "OOPS! This Recieprnt is not authorized on the email serveice. Please Upgrade your email plan",
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
              user: {
                userType: user.userType,
                userId: user._id,
                email: user.email,
                trustId: user.phone.slice(1),
              },
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
    const user = await User.findOne({ formattedTrustId }).select("+password");
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
        user: {
          token: accessToken,
          trustId: user.phone.slice(1),
          avatar: user.avatar,
          email: user.email,
          userType: user.userType
        }
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

    if (foundBuyer.mainWalletBalance <= price) {
      return res.status(404).json({
        errorMessage: 'Sorry, You do not have Enough fund to perform this transaction. Please fund your wallet and try again.'
      })
    }

    let updatedWalletBalance = foundBuyer.mainWalletBalance - price;

    const updatedBuyerProfile = {
      mainWalletBalance: updatedWalletBalance,
      escrowWalletBalance: result.escrowWalletBalance += price
    };

    const updatedSellerProfile = {
      escrowWalletBalance: foundSeller.escrowWalletBalance += price
    };

    User.findByIdAndUpdate(foundSeller.id, updatedSellerProfile, {
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

    User.findByIdAndUpdate(foundBuyer.id, updatedBuyerProfile, {
      new: true,
    })
      .then(() => {
        return res
          .status(200)
          .json({ successMessage: `Buyer data was successfully updated` });
      })
      .catch(() => {
        return res.status(500).json({ errorMessage: "Something went wrong" });
      });

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
    return res
      .status(500)
      .json({ errorMessage: "Something went wrong, please try again." });
  }
})


router.post('/new-standing-escrow', async (req, res) => {
  try {
    const { trustId, address, productNarration, phoneNumber, price, deliveryMethod, requestingUserTrustId } = req.body;

    let foundBuyer = await User.find({ phone: phoneNumber })
    let foundSeller = await User.find({ phone: `0${trustId}` })
    let foundRequestingUser = await User.find({ phone: `0${requestingUserTrustId}` })

    if (foundRequestingUser.escrowWalletBalance <= price) {
      return res.status(404).json({
        errorMessage: 'Sorry, You do not have Enough fund to perform this transaction. Please fund your wallet and try again.'
      })
    }

    let updatedEscrowWalletBalance = foundRequestingUser.escrowWalletBalance -= price

    const updatedSellerProfile = {
      escrowWalletBalance: foundSeller.escrowWalletBalance += price
    };

    const updatedBuyerProfile = {
      escrowWalletBalance: updatedEscrowWalletBalance
    };

    // let updatedWalletBalance = foundBuyer.mainWalletBalance - price;


    User.findByIdAndUpdate(foundSeller.id, updatedSellerProfile, {
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

    User.findByIdAndUpdate(foundBuyer.id, updatedBuyerProfile, {
      new: true,
    })
      .then(() => {
        return res
          .status(200)
          .json({ successMessage: `Buyer data was successfully updated` });
      })
      .catch(() => {
        return res.status(500).json({ errorMessage: "Something went wrong" });
      });

    const newStandingEscrowOrder = new StandingEscrowOrder({
      trustId,
      requestingUserTrustId,
      address,
      productNarration,
      phoneNumber,
      price,
      deliveryMethod,
    });

    const message = `
       A new standing escrow order has been made to trustID ${trustId} from buyer ${phoneNumber}                                                
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
    let result = await newStandingEscrowOrder.save();
    return res.status(200).json({
      successMessage: "Standing Escrow Order created successfully",
      data: {
        trustId: result.trustId,
        amount: result.price,
        productName: result.productNarration,
        status: result.status
      },
    });

  } catch (error) {
    return res
      .status(500)
      .json({ errorMessage: "Something went wrong, please try again." });
  }
})

router.post('/payment/verify', async (req, res) => {
  try {
    const { trustId, reference } = req.body;

    let output = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "content-type": "application/json",
        "cache-control": "no-cache",
      }
    })

    if (!output.data && output.data.status !== 200) {
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

    const updatedWallet = {
      mainWalletBalance: user.mainWalletBalance += output.data.data.amount
    }


    await User.findByIdAndUpdate({ _id: user._id }, updatedWallet, {
      new: true,
    });

    return res.status(200).json({
      successMessage: 'Wallet updated successfully'
    })

  } catch (error) {
    return res.status(500).json({
      errorMessage: 'Something went wrong.'
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


module.exports = router;
