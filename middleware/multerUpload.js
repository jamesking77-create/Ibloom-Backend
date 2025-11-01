const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(
      file.originalname
    )}`;
    cb(null, uniqueName);
  },
});

// Enhanced file filter supporting more formats
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp|svg|bmp|tiff/;
  const allowedVideoTypes = /mp4|mov|avi|webm|mkv|flv|wmv|m4v|3gp/;
  
  const extname = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype.toLowerCase();
  
  // Check if it's an image
  if (
    allowedImageTypes.test(extname.slice(1)) ||
    mimetype.startsWith("image/")
  ) {
    return cb(null, true);
  }
  
  // Check if it's a video
  if (
    allowedVideoTypes.test(extname.slice(1)) ||
    mimetype.startsWith("video/")
  ) {
    return cb(null, true);
  }
  
  cb(new Error(`File type not allowed. Uploaded: ${extname}`));
};

// File size limit: 50MB for images, 200MB for videos
const limits = {
  fileSize: 200 * 1024 * 1024, // 200MB max
  files: 20, // max 20 files per upload
};

module.exports = multer({ 
  storage, 
  fileFilter,
  limits 
});