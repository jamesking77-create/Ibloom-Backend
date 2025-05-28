// controllers/authController.js - Authentication controller functions
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const { sendPasswordResetEmail } = require("../utils/emailService");
const { generateToken } = require("../utils/jwtUtils");
//const redisClient = require('../utils/redisClient');

// Register a new user
exports.register = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Input validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide username, email and password",
      });
    }

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
    }

    user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({
        success: false,
        message: "Username is already taken",
      });
    }

    // Create new user
    user = new User({
      username,
      email,
      password,
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();

    // Generate JWT token
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Registration error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
};

// Login user
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Input validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // Check if user exists
    let user = await User.findOne({ email, password });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // // Compare password
    // const isMatch = await bcrypt.compare(password, user.password);
    // if (!isMatch) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Invalid credentials'
    //   });
    // }

    // Generate JWT token
    const token = generateToken(user);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

// Get current user
exports.getMe = async (req, res) => {
  try {
    // User is already attached to req by auth middleware
    res.json({
      success: true,
      user: req.user,
    });
  } catch (err) {
    console.error("Get user error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error retrieving user data",
    });
  }
};

// Forgot password
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    // Input validation
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Please provide an email address",
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User with this email does not exist",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Set token and expiration
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    // Save without triggering validation
    await user.save({ validateBeforeSave: false });

    // Send email with reset token
    try {
      await sendPasswordResetEmail(user.email, resetToken);
      res.json({
        success: true,
        message: "Password reset link sent to your email",
      });
    } catch (emailErr) {
      console.error("Error sending email:", emailErr);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({
        success: false,
        message: "Error sending email",
      });
    }
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error processing password reset request",
    });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  const { password, confirmPassword } = req.body;
  const resetPasswordToken = req.params.token;

  try {
    // Input validation
    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide password and confirm password",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Find user by token and check if token is expired
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Password reset token is invalid or has expired",
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Clear reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    // Generate a new token for automatic login
    const token = generateToken(user);

    res.json({
      success: true,
      message: "Password has been reset successfully",
      token,
    });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error resetting password",
    });
  }
};

// Refresh auth token
exports.refreshToken = async (req, res) => {
  try {
    // User is already attached to req by auth middleware
    const token = generateToken(req.user);

    res.json({
      success: true,
      message: "Token refreshed successfully",
      token,
    });
  } catch (err) {
    console.error("Token refresh error:", err.message);
    res.status(500).json({
      success: false,
      message: "Server error refreshing token",
    });
  }
};

// Logout user
// exports.logout = async (req, res) => {
//   try {
//     const token = req.headers.authorization?.split(' ')[1];

//     if (!token) {
//       return res.status(400).json({
//         success: false,
//         message: 'Token missing in request',
//       });
//     }

//     // Get token expiration from JWT
//     const decoded = require('jsonwebtoken').decode(token);
//     const exp = decoded?.exp;

//     if (!exp) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid token format',
//       });
//     }

//     const ttl = exp - Math.floor(Date.now() / 1000);

//     // Store token in Redis with TTL so it auto-expires
//     await redisClient.set(token, 'blacklisted', {
//       EX: ttl,
//     });

//     res.status(200).json({
//       success: true,
//       message: 'Logout successful. Token is now blacklisted.',
//     });
//   } catch (err) {
//     console.error('Logout error:', err.message);
//     res.status(500).json({
//       success: false,
//       message: 'Server error during logout',
//     });
//   }
// };
