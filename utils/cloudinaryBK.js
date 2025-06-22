// utils/cloudinary.js
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Configure multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'app-images', // Organize images in folders
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov'],
    transformation: [
      { width: 1920, height: 1080, crop: 'limit', quality: 'auto' }
    ],
    resource_type: 'auto', // Handles both images and videos
  },
});

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

// Helper function to delete from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
};

// Helper function to extract public ID from Cloudinary URL
const extractPublicId = (url) => {
  const parts = url.split('/');
  const filename = parts[parts.length - 1];
  return filename.split('.')[0];
};

module.exports = {
  cloudinary,
  upload,
  deleteFromCloudinary,
  extractPublicId
};

// routes/images.js
const express = require('express');
const router = express.Router();
const { upload, deleteFromCloudinary, extractPublicId } = require('../utils/cloudinary');
// Assuming you have a database model for images
// const Image = require('../models/Image'); // Replace with your actual model

// Upload single image
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const imageData = {
      title: req.body.title || '',
      description: req.body.description || '',
      url: req.file.path,
      publicId: req.file.filename,
      resourceType: req.file.resource_type,
      format: req.file.format,
      width: req.file.width,
      height: req.file.height,
      bytes: req.file.bytes,
      uploadedAt: new Date()
    };

    // Save to database (replace with your actual database logic)
    // const savedImage = await Image.create(imageData);
    
    res.status(201).json({
      message: 'File uploaded successfully',
      data: imageData
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Upload multiple images
router.post('/upload-multiple', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedImages = [];
    
    for (const file of req.files) {
      const imageData = {
        title: req.body.title || '',
        description: req.body.description || '',
        url: file.path,
        publicId: file.filename,
        resourceType: file.resource_type,
        format: file.format,
        width: file.width,
        height: file.height,
        bytes: file.bytes,
        uploadedAt: new Date()
      };
      
      // Save to database
      // const savedImage = await Image.create(imageData);
      uploadedImages.push(imageData);
    }

    res.status(201).json({
      message: 'Files uploaded successfully',
      data: uploadedImages
    });
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get all images
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Replace with your actual database query
    // const images = await Image.find()
    //   .sort({ uploadedAt: -1 })
    //   .skip(skip)
    //   .limit(limit);
    
    // const total = await Image.countDocuments();
    
    const mockImages = []; // Replace with actual data
    
    res.json({
      data: mockImages,
      pagination: {
        page,
        limit,
        total: 0, // Replace with actual total
        pages: Math.ceil(0 / limit)
      }
    });
  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

// Get single image
router.get('/:id', async (req, res) => {
  try {
    // const image = await Image.findById(req.params.id);
    // if (!image) {
    //   return res.status(404).json({ error: 'Image not found' });
    // }
    
    // res.json({ data: image });
    res.status(404).json({ error: 'Image not found' });
  } catch (error) {
    console.error('Get image error:', error);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

// Update image metadata
router.put('/:id', async (req, res) => {
  try {
    const { title, description } = req.body;
    
    // const updatedImage = await Image.findByIdAndUpdate(
    //   req.params.id,
    //   { title, description, updatedAt: new Date() },
    //   { new: true }
    // );
    
    // if (!updatedImage) {
    //   return res.status(404).json({ error: 'Image not found' });
    // }
    
    // res.json({ 
    //   message: 'Image updated successfully',
    //   data: updatedImage 
    // });
    res.status(404).json({ error: 'Image not found' });
  } catch (error) {
    console.error('Update image error:', error);
    res.status(500).json({ error: 'Failed to update image' });
  }
});

// Delete image
router.delete('/:id', async (req, res) => {
  try {
    // const image = await Image.findById(req.params.id);
    // if (!image) {
    //   return res.status(404).json({ error: 'Image not found' });
    // }

    // Delete from Cloudinary
    // await deleteFromCloudinary(image.publicId);
    
    // Delete from database
    // await Image.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Delete multiple images
router.delete('/bulk', async (req, res) => {
  try {
    const { imageIds } = req.body;
    
    if (!imageIds || !Array.isArray(imageIds)) {
      return res.status(400).json({ error: 'Invalid image IDs' });
    }

    // const images = await Image.find({ _id: { $in: imageIds } });
    
    // Delete from Cloudinary
    // const deletePromises = images.map(image => 
    //   deleteFromCloudinary(image.publicId)
    // );
    // await Promise.all(deletePromises);
    
    // Delete from database
    // await Image.deleteMany({ _id: { $in: imageIds } });
    
    res.json({ message: 'Images deleted successfully' });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Failed to delete images' });
  }
});

module.exports = router;

// middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files' });
    }
  }

  if (err.message === 'Only images and videos are allowed') {
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({ error: 'Something went wrong!' });
};

module.exports = errorHandler;

// app.js (main application file)
const express = require('express');
const cors = require('cors');
const imageRoutes = require('./routes/images');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/images', imageRoutes);

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});