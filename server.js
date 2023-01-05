const express = require("express");
const app = express();
const morgan = require("morgan");
const helment = require("helmet");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const cookieParser = require("cookie-parser");
const port = process.env.PORT || 5000;
const connectDB = require("./database/db");

connectDB();

// middleware
const corsOptions = {
  // origin:'http://localhost:3000',
  credentials: true, //access-control-allow-credentials:true
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(morgan("dev"));
app.use(helment());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const userRouter = require("./routes/user");
// const panAfricaRouter = require("./routes/panAfrica");

// map URL starts:
app.use("/api/user", userRouter);
// app.use("/api/panAfrica", panAfricaRouter);
// app.use('/uploads', express.static('uploads'));

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});

module.exports = app;
