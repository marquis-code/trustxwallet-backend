const express = require("express");
let router = express.Router();
const Admin = require("../models/Admin");
const Payment = require("../models/Payment");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const OTPVerification = require("../models/OTPVerification");
const bcrypt = require("bcrypt");
const _ = require("lodash");
const nodemailer = require("nodemailer");
const nodemailerMailgunTransport = require("nodemailer-mailgun-transport");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const auth = {
  auth: {
    api_key: process.env.MAILGUN_APIKEY,
    domain: process.env.MAILGUN_DOMAIN,
  },
};

const transporter = nodemailer.createTransport(
  nodemailerMailgunTransport(auth)
);

router.post("/admin-signup", async (req, res) => {
    const { firstName, lastName, email, password } = req.body;
    const validationResult = registerSchema.validate(req.body, {
      abortEarly: false,
    });
    if (validationResult.error) {
      let errorMsg = validationResult.error.details[0].message;
      return res.status(400).json({ errorMessage: errorMsg });
    }
  
    try {
      const user = await Admin.findOne({ email });
      if (user) {
        return res.status(400).json({ errorMessage: "User Already Exist" });
      }
  
      const salt = await bcrypt.genSalt(10);
      let hashedPassword = await bcrypt.hash(password, salt);
  
      const newAdmin = new Admin({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        verified: false,
      });
  
      newAdmin
        .save()
        .then((result) => {
          sendOTPVerificationEmail(result, res);
        })
        .catch((error) => {
          return res.json({
            errorMessage:
              "Something went wrong, while saving user account, please try again.",
          });
        });
    } catch (error) {
      return res.json({
        errorMessage: "Something went wrong, please try again.",
      });
    }
  });
  
  router.post("/admin-signin", async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await Admin.findOne({ email }).select("+password");
      if (user) {
        const isMatchPassword = bcrypt.compare(password, user.password);
        if (!isMatchPassword) {
          return res
            .status(400)
            .json({ errorMessage: "INVALID LOGIN CREDENTIALS" });
        } else {
          sendOTPVerificationEmail(user, res);
        }
      } else {
        return res
          .status(400)
          .json({ errorMessage: "INVALID LOGIN CREDENTIALS" });
      }
    } catch (error) {
      return res
        .status(500)
        .json({ errorMessage: "SOMETHING WENT WRONG, PLEASE TRY AGAIN." });
    }
  });

const sendOTPVerificationEmail = async ({ _id, email }, res) => {
  try {
    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;
    const mailOptions = {
      from: process.env.AUTH_EMAIL,
      to: email,
      subject: "Trust X Email Verification Code (One Time Password)",
      html: `
             <p>Hi!</p>
             <p>We recieved a request to access your Trust X Wallet Account ${email} through your email address.</p>
             <p>Your One Time OTP verification code is: <h3> ${otp}</h3></p>
             <p>Please enter the OTP to verify your email address.</p>
             <p>This code <b>expires in 30 minutes</b>.</p>
             <p>If you did not request this code, it is possible that someone else is trying to access the Trust X Wallet Account ${email}</p>
             <p><b>Do not forward or give this code to anyone.</b></p>
             <p> If you cannot see the email from 'sandbox.mgsend.net' in your inbox, make sure to check your SPAM folder.</p>
             <P>If you have any questions, send us an email trustxwallet@gmail.com</P>
            <p>We’re glad you’re here!,</p>
            <p>The Trust X wallet team</p>
        `,
    };

    const saltRounds = 10;
    const hashedOtp = await bcrypt.hash(otp, saltRounds);
    const newOTPVerification = await new OTPVerification({
      userId: _id,
      otp: hashedOtp,
      expiresAt: Date.now() + 1800000,
      createdAt: Date.now(),
    });

    await newOTPVerification.save();
    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      successMessage: "Verification otp email sent.",
      data: { userId: _id, email },
    });
  } catch (error) {
    return res.status(200).json({
      errorMessage: error.messages,
    });
  }
};

router.post("/verifyOtp", async (req, res) => {
  try {
    const { userId, otp } = req.body;
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
            await Admin.updateOne({ _id: userId }, { verified: true });
            await OTPVerification.deleteMany({ userId });
            return res.status(200).json({
              successMessage: "Email has been verified.",
              data: { userId },
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

router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const admin = await Admin.findOne({ email });
    if (admin) {
      return res.status(404).json({ errorMessage: "Admin already exist" });
    }

    const salt = await bcrypt.genSalt(10);
    let hashedPassword = await bcrypt.hash(password, salt);

    const newAdmin = new Admin({
      name,
      email,
      password: hashedPassword,
    });
    newAdmin
      .save()
      .then(() => {
        return res
          .status(200)
          .json({ successMessage: "Admin saved successfully" });
      })
      .catch(() => {
        return res.status(500).json({
          errorMessage:
            "Something went wrong while saving admin. Please try again later",
        });
      });
  } catch (error) {
    return res.status(500).json({
      errorMessage: "Something went wrong. Please try again later",
    });
  }
});

router.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res
        .status(404)
        .json({ errorMessage: "Invalid email or password" });
    }

    const isMatchPassword = bcrypt.compare(password, admin.password);

    if (!isMatchPassword) {
      return res
        .status(400)
        .json({ errorMessage: "Invalid Login Credentials" });
    }

    const jwtPayload = { _id: admin._id };

    const accessToken = jwt.sign(jwtPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE,
    });

    return res.status(200).json({
      successMessage: "Login was successful",
      user: {
        token: accessToken,
      },
    });
  } catch (error) {
    return res.status(500).json({
      errorMessage: "Something went wrong. Please try again later",
    });
  }
});

router.get("/sellers", async (req, res) => {
  try {
    const sellers = await User.aggregate([{ $match: { userType: "seller" } }]);
    return res.status(200).json(sellers);
  } catch (error) {
    return res.status(500).json({
      errorMessage: "Something went wrong. Please try again later",
    });
  }
});

router.get("/buyers", async (req, res) => {
  try {
    const sellers = await User.aggregate([{ $match: { userType: "buyer" } }]);
    return res.status(200).json(sellers);
  } catch (error) {
    return res.status(500).json({
      errorMessage: "Something went wrong. Please try again later",
    });
  }
});

router.get("/successfulTransactions", async (req, res) => {
  try {
    const successfulTransactions = await Payment.aggregate([
      { $match: { withdrawalStatus: true } },
    ]);
    return res.status(200).json(successfulTransactions);
  } catch (error) {
    return res.status(500).json({
      errorMessage: "Something went wrong. Please try again later",
    });
  }
});

router.get("/disputeTransactions", async (req, res) => {
  try {
    const disputeTransactions = await Payment.aggregate([
      { $match: { withdrawalStatus: false } },
    ]);
    return res.status(200).json(disputeTransactions);
  } catch (error) {
    return res.status(500).json({
      errorMessage: "Something went wrong. Please try again later",
    });
  }
});

router.get("/users", async (req, res) => {
  try {
    const users = await User.find();
    return res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({
      errorMessage: "Something went wrong. Please try again later",
    });
  }
});
