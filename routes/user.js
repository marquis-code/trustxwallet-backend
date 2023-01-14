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
const {
  startPayment,
  createPayment,
  getPayment,
} = require("../controllers/payment");

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
  const { email, username, phone, password, termsAgreement } = req.body;
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

      console.log(updatedUser, "updated user");

      const mailOptions = {
        from: process.env.AUTH_EMAIL,
        to: email,
        subject: "Welcome to Trust X Wallet",
        html: `
               <h3>Congratulations!</h3>
               <p>Your Trust X Wallet account has been successfully created.</p>
               <p>Your trust Id is <b>${data.trustId}</b></p>
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

router.post("/signin", async (req, res) => {
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
        email: user.email,
      },
    });
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
      data: { userId: _id, email },
    });
  } catch (error) {
    return res.status(200).json({
      errorMessage: error.messages,
    });
  }
};

const sendPaymentConfirmationEmail = async ({ firstName, lastName, amount, email }, res) => {
  try {
    let ts = Date.now();
    let date_ob = new Date(ts);
    let date = date_ob.getDate();
    let month = date_ob.getMonth() + 1;
    let year = date_ob.getFullYear();   
    let hours = date_ob.getHours();
    let minutes = date_ob.getMinutes();
    let seconds = date_ob.getSeconds();

    const mailOptions = {
      from: process.env.AUTH_EMAIL,
      to: email,
      subject: "Payment Acknowledgement",
      html: `
           <h1>Hello, ${firstName} ${lastName}</h1>
           <p>Thanks for your recent payment that you made on date ${date + "-" + month + "-" + year} at ${hours + ":" + minutes + ":" + seconds} for the amount of ${amount}</p>
           <p>This is a confirmation that NGN${amount} has been successfully recieved and deposited in your account.</p>

           <p>If you have any questions, reach out to us at hello@trustxwallet.com</p>

           <h3>Team Trust X</h3>
      `,
    };

    await transporter.sendMail(mailOptions);
    return res.status(200).json({
      successMessage: "Payment confirmation email sent",
      // data: { userId: _id, email },
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

router.post("/transaction", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      amount,
      billingAddress,
      postalCode,
      reference,
      status,
    } = req.body;
    if (!userId || !email) {
      return res.status(400).json({
        errorMessage: "Empty user details are not allowed.",
      });
    } else {
      const payment = new Payment({
        firstName,
        lastName,
        email,
        phone,
        amount,
        billingAddress,
        postalCode,
        reference,
        status,
      });

      payment
        .save()
        .then((result) => {
          sendPaymentConfirmationEmail(result, res);
        })
        .catch((error) => {
          return res.json({
            errorMessage:
              "Something went wrong, while saving payment, please try again.",
          });
        });
    }
  } catch (error) {
    return res.status(500).json({
      errorMessage: error.message,
    });
  }
});

router.post("/initializePayment", startPayment);
router.get("/createPayment", createPayment);
router.get("/paymentDetails", getPayment);

// router.post("/payment/verify", async (req, res) => {
//   const ref = req.query.reference;
//   let output;
//   await axios
//     .get(`https://api.paystack.co/transaction/verify/${ref}`, {
//       headers: {
//         authorization: "Bearer TEST SECRET KEY",
//         //replace TEST SECRET KEY with your actual test secret
//         //key from paystack
//         "content-type": "application/json",
//         "cache-control": "no-cache",
//       },
//     })
//     .then((success) => {
//       output = success;
//     })
//     .catch((error) => {
//       output = error;
//     });

//   //now we check for internet connectivity issues
//   if (!output.response && output.status !== 200)
//     throw new UserInputError("No internet Connection");

//   if (output.response && !output.response.data.status)
//     throw new UserInputError("Error verifying payment");

//   //we return the output of the transaction
//   res.status(200).send("Payment was successfully verified");
// });
module.exports = router;
