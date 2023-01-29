const express = require("express");
let router = express.Router();
const User = require("../models/User");
const Payment = require("../models/Payment");
const OTPVerification = require("../models/OTPVerification");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const _ = require("lodash");
const nodemailer = require("nodemailer");
const nodemailerMailgunTransport = require("nodemailer-mailgun-transport");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();
const randomstring = require("randomstring");
const cloudinary = require("../utils/cloudinary");
const upload = require("../utils/multer");
const nodeCron = require("node-cron");
const axios = require("axios");

const auth = {
  auth: {
    api_key: process.env.MAILGUN_APIKEY,
    domain: process.env.MAILGUN_DOMAIN,
  },
};

const transporter = nodemailer.createTransport(
  nodemailerMailgunTransport(auth)
);

transporter.verify((error, success) => {
  if (error) {
    console.log(error);
  } else {
    console.log("ready for message transport");
    console.log(success);
  }
});

router.post("/identityVerification", async (req, res) => {
  const { email, username, phone, password, termsAgreement, userType } =
    req.body;
  try {
    const user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ errorMessage: "User Already Exist" });
    }

    const salt = await bcrypt.genSalt(10);
    let hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      email,
      username,
      phone,
      password: hashedPassword,
      termsAgreement: termsAgreement,
      verified: false,
      userType,
    });

    let result = await newUser.save();
    console.log(result);

    await sendOTPVerificationEmail(result, res);
  } catch (error) {
    return res.json({
      errorMessage: "Something went wrong, please try again.",
    });
  }
});

router.post(
  "/productVerification",
  upload.single("image"),
  async (req, res) => {
    const { alternative_email, alternative_phone, goods, email } = req.body;
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ errorMessage: "Please upload  profile image" });
      }
      let user = await User.findOne({ email: email, verified: true });
      console.log(user);
      if (!user) {
        return res.status(400).json({ errorMessage: "User not found" });
      }

      const upload_response = await cloudinary.uploader.upload(req.file.path);
      const generated_trust_id = randomstring.generate({
        length: 12,
        charset: "alphanumeric",
        capitalization: "uppercase",
      });
      const data = {
        alternative_email,
        alternative_phone,
        goods,
        avatar: upload_response.url,
        cloudinary_id: upload_response.public_id,
        trustId: generated_trust_id,
      };
      const updatedUser = await User.findOneAndUpdate(
        { email: req.body.email },
        data,
        {
          returnDocument: "after",
        }
      );

      const trustLink = `${process.env.CLIENT_URL}seller/${data.trustId}`;

      const mailOptions = {
        from: process.env.AUTH_EMAIL,
        to: email,
        subject: "Welcome to Trust X Wallet",
        html: `
               <h3>Congratulations!</h3>
               <p>Your Trust X Wallet account has been successfully created.</p>
               <p>Your trust Id is <b>${data.trustId}</b></p>
               <p>Your trust x payment link is <b>${trustLink}</b></p>
               <p>Kind regards,</p>
               <p>Trust X Team.</p>
          `,
      };

      await transporter.sendMail(mailOptions);
      return res.status(200).json({
        successMessage: "Seller was successfully created",

        user: {
          username: updatedUser.username,
          trustId: updatedUser.trustId,
        },
      });
    } catch (error) {
      return res.status(500).json({
        errorMessage: "Something went wrong. Plaese try again!",
      });
    }
  }
);

router.post("/seller-signin", async (req, res) => {
  const { trustId, password } = req.body;

  try {
    const user = await User.findOne({ trustId }).select("+password");
    console.log(user);
    if (!user) {
      return res.status(404).json({ errorMessage: "User Not Found" });
    }

    if (!user.verified) {
      return res.status(404).json({
        errorMessage: "Email has not been verified yet. Check your inbox.",
      });
    }
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
      successMessage: "Login was successful",
      user: {
        username: user.username,
        trustId: user.trustId,
        userType: user.userType,
        email: user.email,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ errorMessage: "Something went wrong, please try again." });
  }
});

router.post("/buyer-signin", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(404).json({ errorMessage: "User Not Found" });
    }

    if (!user.verified) {
      return res.status(404).json({
        errorMessage: "Email has not been verified yet. Check your inbox.",
      });
    }
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
      successMessage: "Login was successful",
      user: {
        username: user.username,
        email: user.email,
        userType: user.userType,
        accessToken,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ errorMessage: "Something went wrong, please try again." });
  }
});

const sendOTPVerificationEmail = async ({ _id, email, username }, res) => {
  try {
    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;
    const mailOptions = {
      from: process.env.AUTH_EMAIL,
      to: email,
      subject: "Verify Your Email (One Time Password)",
      html: `
           <p>A One Time Password has been sent to ${email}</p>
           <p>Please enter the OTP ${otp} to verify your Email Address. If you cannot see the email from 'sandbox.mgsend.net' in your inbox.</p>
           <p>make sure to check your SPAM folder</p>
            <p>This code <b>expires in 10 minutes</b>.</p>
      `,
    };

    const saltRounds = 10;
    const hashedOtp = await bcrypt.hash(otp, saltRounds);
    const newOTPVerification = await new OTPVerification({
      userId: _id,
      otp: hashedOtp,
      expiresAt: Date.now() + 600000,
      createdAt: Date.now(),
    });
    await newOTPVerification.save();
    await transporter.sendMail(mailOptions);
    return res.status(200).json({
      successMessage: "Verification otp email sent.",
      data: { userId: _id, email, username },
    });
  } catch (error) {
    return res.status(500).json({
      errorMessage: "Something went wrong. Please try again.",
    });
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
              errorMessage: "Invalid code passed. Check your inbox.",
            });
          } else {
            await User.updateOne({ _id: userId }, { verified: true });
            await OTPVerification.deleteMany({ userId });

            if (user.userType === "buyer") {
              return res.status(200).json({
                successMessage: "Email has been verified.",
                user: {
                  userType: user.userType,
                  userId: user._id,
                  username: user.username,
                  email: user.email,
                },
              });
            } else {
              return res.status(200).json({
                successMessage: "Email has been verified.",
                user: {
                  userType: user.userType,
                  userId: user._id,
                  username: user.username,
                  email: user.email,
                  wallet: user.wallet,
                  successfulTransactions: user.successfulTransactions,
                  transactionsInDispute: user.transactionsInDispute,
                  trustId: user.trustId,
                },
              });
            }
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

router.post("/resendOTPVerificationCode", async (req, res) => {
  try {
    const { userId, email } = req.body;
    if (!userId || !email) {
      return res.status(400).json({
        errorMessage: "Empty user details are not allowed.",
      });
    } else {
      await OTPVerification.deleteMany({ userId });
      sendOTPVerificationEmail({ _id: userId, email }, res);
    }
  } catch (error) {
    return res.status(500).json({
      errorMessage: error.message,
    });
  }
});

router.post("/transaction", async (req, res) => {
  try {
    const {
      trustId,
      address,
      deliveryDuration,
      amount,
      commodities,
      reference,
      status,
      email,
    } = req.body;

    const seller = await User.findOne({ trustId });

    const buyer = await User.findOne({ email });

    if (!seller) {
      return res.status(400).json({
        errorMessage: `Seller with trust Id ${trustId} does not exist`,
      });
    }

    if (!buyer) {
      return res.status(400).json({
        errorMessage: `Buyer does not exist`,
      });
    }

    await User.findOneAndUpdate(
      { trustId },
      { wallet: amount },
      { returnDocument: "after" }
    );

    const newPayment = new Payment({
      trustId,
      amount,
      address,
      deliveryDuration,
      commodities,
      reference,
      status,
      email,
      withdrawalStatus: false,
    });

    const response = await newPayment.save();

    await handleCronJobs(buyer.email, buyer.username, res);

    const sellerMailOptions = {
      from: process.env.AUTH_EMAIL,
      to: seller.email,
      subject: "Confirmed Payment",
      html: `
                 <h3>Hello, ${seller.username}</h3>
                 <p>A sum of NGN${amount} has been paid to your account for the following commodities ${commodities}</p>
                 <p>Commodities should be delivered to ${address}, between a duration of ${deliveryDuration}</b></p>
                 <p>Kind regards,</p>
                 <p>Trust X Team.</p>
            `,
    };

    const buyerMailOptions = {
      from: process.env.AUTH_EMAIL,
      to: email,
      subject: "Confirmed Payment",
      html: `
                 <h3>Hello, ${buyer.username}</h3>
                 <p>Your payment has been confirmed and your goods is on it's way</p>
                 <p>Below is a summary of payment and delivery details"</p>
                 <p>Address : ${address}</p>
                 <p>Amount : ${amount}</p>
                 <p>Commodities Ordered : ${commodities}</p>
                 <p>Payment reference: ${reference}</p>
                 <p>Date Item would be delivered : ${deliveryDuration}th of this month.</p>
                 <small>Please Noted: Payment reference would be used to confirm the goods recieved.</small>
                 <p>Kind regards,</p>
                 <p>Trust X Team.</p>
            `,
    };

    await transporter.sendMail(buyerMailOptions);

    await transporter.sendMail(sellerMailOptions);
    return res.status(200).json({
      successMessage: "Seller has been successfully notified",
      paymentInfo: {
        withdrawalStatus: response.withdrawalStatus,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ errorMessage: "Something went wrong, please try again." });
  }
});

// const handleCronJobs = async (email, username, res) => {
//   try {
//     nodeCron.schedule("* * * * * *", function () {
//       sendCronReminderEmails(email, username, res);
//     });
//     // emailCron.stop();
//   } catch (error) {
//     console.log(error);
//   }
// };

const handleCronJobs = async (email, username, res) => {
  try {
    nodeCron.schedule(`* * */3 ${deliveryDuration} * *`, function () {
      sendCronReminderEmails(email, username, res);
    });
  } catch (error) {
    console.log(error);
  }
};

const sendCronReminderEmails = async (email, username, res) => {
  try {
    const buyerMailReminderOptions = {
      from: process.env.AUTH_EMAIL,
      to: email,
      subject: "Good's arrival reminder",
      html: `
               <h3>Hello ${username}</h3>
               <p>This is a reminder that your goods is on it's way.</p>
               <p>Please reach out if you have issues with the package recieved.</p>
               <p>Kind regards,</p>
               <p>Trust X Team.</p>
          `,
    };

    return await transporter.sendMail(buyerMailReminderOptions);
  } catch (error) {
    console.log(error);
  }
};

router.post("/confirm-goods", async (req, res) => {
  const { reference, trustId, comments, email } = req.body;

  const result = await Payment.findOne({ reference });
  const seller = await User.findOne({ trustId });
  const buyer = await User.findOne({ email });

  if (!result) {
    return res.status(400).json({ errorMessage: "Invalid payment referennce" });
  }

  const data = {
    withdrawalStatus: true,
    comments: comments,
  };

  const response = await Payment.findOneAndUpdate(
    { reference: req.body.reference },
    data,
    {
      returnDocument: "after",
    }
  );

  await User.findOneAndUpdate(
    { trustId },
    {
      successfulTransactions: (seller.successfulTransactions += 1),
    },
    {
      returnDocument: "after",
    }
  );

  const sellerMailOptions = {
    from: process.env.AUTH_EMAIL,
    to: seller.email,
    subject: "Confirmed Goods",
    html: `
               <h3>Hello, ${seller.username}</h3>
               <p>The buyer has successfully recieved the items.</p>
               <p>Therefore, this trannsaction is complete and you can go ahead to withdraw from you wallet </p>
               <p>Kind regards,</p>
               <p>Trust X Team.</p>
          `,
  };

  const buyerMailOptions = {
    from: process.env.AUTH_EMAIL,
    to: buyer.email,
    subject: "Confirmed Goods",
    html: `
               <h3>Hello, ${buyer.username}</h3>
               <p>Thanks for confirming your goods.</p>
               <p>Kind regards,</p>
               <p>Trust X Team.</p>
          `,
  };

  await transporter.sendMail(sellerMailOptions);
  await transporter.sendMail(buyerMailOptions);
  return res.status(200).json({
    successMessage: "Thanks for confirming your goods.",
    paymentInfo: {
      withdrawalStatus: response.withdrawalStatus,
    },
  });
});

module.exports = router;
