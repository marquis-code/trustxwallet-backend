const express = require("express");
let router = express.Router();
const User = require("../models/User");
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
  const { email, username, phone, password } = req.body;
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
      verified: false,
    });

    newUser
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
      let user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ errorMessage: "User not found" });
      }
      const upload_response = await cloudinary.uploader.upload(req.file.path);
      if (user.verified && upload_response) {
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
        await User.findOneAndUpdate(email, data, {
          returnOriginal: false,
          upsert: true,
          returnDocument: "after",
        });
        return res.status(200).json({
          successMessage: "Buyer was successfully created",
        });
      } else {
        return res.status(400).json({
          errorMessage: "User not verified, please signup",
        });
      }
    } catch (error) {
      return res.status(500).json({
        errorMessage: "Something went wrong. Plaese try again!",
      });
    }
  }
);

router.post("/signin", async (req, res) => {
  const { trustId, password } = req.body;

  try {
    const user = await User.findOne({ trustId }).select("+password");
    if (!user) {
      return res.status(404).json({ errorMessage: "User Not Found" });
    }

    if (!user.verified) {
      return res.status(404).json({
        errorMessage: "Email has not been verified yet. Check your inbox.",
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
      return res.status(200).json({ accessToken, user: { modifiedUser } });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ errorMessage: "Something went wrong, please try again." });
  }
});

const sendOTPVerificationEmail = async ({ _id, email }, res) => {
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
            <p>This code <b>expires in 1 hour</b>.</p>
      `,
    };

    const saltRounds = 10;
    const hashedOtp = await bcrypt.hash(otp, saltRounds);
    const newOTPVerification = await new OTPVerification({
      userId: _id,
      otp: hashedOtp,
      expiresAt: Date.now() + 3600000,
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
            await User.updateOne({ _id: userId }, { verified: true });
            await OTPVerification.deleteMany({ userId });
            return res.status(200).json({
              successMessage: "Email has been verified.",
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

module.exports = router;
