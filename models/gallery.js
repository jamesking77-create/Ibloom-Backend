const mongoose = require("mongoose");

const gallerySchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    publicId: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ["image", "video", "raw"], // raw for other file types
      required: true,
    },
    filename: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
    },
    size: {
      type: Number, // size in bytes
    },
    duration: {
      type: Number, // for videos (in seconds)
    },
    width: {
      type: Number,
    },
    height: {
      type: Number,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index for faster queries
gallerySchema.index({ uploadedBy: 1, createdAt: -1 });
gallerySchema.index({ type: 1 });

// Virtual for formatted size
gallerySchema.virtual('formattedSize').get(function() {
  if (!this.size) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = this.size;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
});

module.exports = mongoose.model("Gallery", gallerySchema);
