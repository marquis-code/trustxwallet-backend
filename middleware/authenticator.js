const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.authenticateJwt = async (req, res, next) => {
  let token; 

  if(req.headers.authorization && req.headers.authorization.startsWith("Bearer")){
      token = req.headers.authorization.split(" ")[1]
  }                                                                                                                                                                  

  if(!token) {
      res.status(401).json({errorMessage : 'No Token. Authorization denied. Please Login to have access'})
  }

  try {                       
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded._id);

      if(!user) {
        return res.status(404).json({errorMessage : 'Invalid User Id'})
      }

      req.user = user;

      next();
  } catch (error) {
    return res.status(401).json({errorMessage : 'Invalid Token. Not Authorized to access this route'})
  }
}