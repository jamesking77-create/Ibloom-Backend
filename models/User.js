const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    password: {
      type: String,
      required: true,
      minlength: 6
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    resetPasswordToken: {
      type: String,
      default: undefined
    },
    resetPasswordExpires: {
      type: Date,
      default: undefined
    },

    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    location: { type: String, trim: true },
    joinDate: { type: Date, default: Date.now },
    avatar: { type: String, default: '/api/placeholder/150/150' },
    bio: { type: String, trim: true },
    specialize: [{ type: String, trim: true }], 

    categories: [
      {
        id: { type: Number, required: true },
        name: { type: String, required: true, trim: true }
      }
    ]

  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('User', UserSchema);
