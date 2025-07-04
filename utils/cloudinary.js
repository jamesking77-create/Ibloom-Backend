// utils/cloudinary.js (optimized version - URL only)
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Verify environment variables
const requiredEnvVars = {
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET
};

const missingVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error('❌ Missing required Cloudinary environment variables:', missingVars);
  console.error('Please add these to your .env file:');
  missingVars.forEach(varName => {
    console.error(`${varName}=your_${varName.toLowerCase()}_here`);
  });
  process.exit(1);
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

console.log('✅ Cloudinary configured successfully');

// Configure multer storage for general images
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'app-images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov'],
    transformation: [
      { width: 1920, height: 1080, crop: 'limit', quality: 'auto' }
    ],
    resource_type: 'auto',
  },
});

// Configure multer storage specifically for avatars
const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'user-avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [
      {
        width: 400,
        height: 400,
        crop: 'fill',
        gravity: 'face',
        quality: 'auto',
        format: 'webp'
      }
    ],
    resource_type: 'image',
  },
});

// General upload configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images and videos are allowed'));
    }
  }
});

// Specific upload configuration for avatars
const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for avatars
  },
  fileFilter: (req, file, cb) => {
    console.log('🔍 File filter check:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      console.log('✅ File passed validation');
      return cb(null, true);
    } else {
      console.log('❌ File failed validation');
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed for avatars'));
    }
  }
});

// Helper function to delete from Cloudinary using URL
const deleteFromCloudinary = async (imageUrl) => {
  try {
    if (!imageUrl) return null;
    
    console.log('🗑️ Attempting to delete from Cloudinary:', imageUrl);
    const publicId = extractPublicId(imageUrl);
    console.log('📝 Extracted public ID:', publicId);
    
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('✅ Delete result:', result);
    return result;
  } catch (error) {
    console.error('❌ Error deleting from Cloudinary:', error);
    throw error;
  }
};

// Helper function to extract public ID from Cloudinary URL
const extractPublicId = (url) => {
  try {
    // Handle both secure and non-secure URLs
    // Example: https://res.cloudinary.com/cloudname/image/upload/v1234567890/folder/filename.jpg
    const urlParts = url.split('/');
    const uploadIndex = urlParts.findIndex(part => part === 'upload');
    
    if (uploadIndex === -1) {
      throw new Error('Invalid Cloudinary URL format');
    }
    
    // Get everything after 'upload/v{version}/' or 'upload/'
    const pathAfterUpload = urlParts.slice(uploadIndex + 1);
    
    // Remove version if present (starts with 'v' followed by numbers)
    const startIndex = pathAfterUpload[0] && pathAfterUpload[0].match(/^v\d+$/) ? 1 : 0;
    
    // Join the remaining parts and remove file extension
    const publicIdWithExtension = pathAfterUpload.slice(startIndex).join('/');
    const publicId = publicIdWithExtension.replace(/\.[^/.]+$/, '');
    
    return publicId;
  } catch (error) {
    console.error('❌ Error extracting public ID from URL:', url, error);
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    return filename.split('.')[0];
  }
};

module.exports = {
  cloudinary,
  upload,
  avatarUpload,
  deleteFromCloudinary,
  extractPublicId
};