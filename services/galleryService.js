const cloudinary = require("../config/cloudinary");
const Gallery = require("../models/gallery");
const fs = require("fs").promises;
const path = require("path");

/**
 * Upload multiple media files to Cloudinary
 * @param {Array} files - array of multer files
 * @param {ObjectId} userId - ID of the uploader
 */
exports.uploadMedia = async (files, userId) => {
  if (!files || !files.length) {
    throw new Error("No files provided");
  }

  const uploadPromises = files.map(async (file) => {
    try {
      // Determine resource type
      let resourceType = "auto";
      if (file.mimetype.startsWith("video/")) {
        resourceType = "video";
      } else if (file.mimetype.startsWith("image/")) {
        resourceType = "image";
      }

      // Upload to Cloudinary with optimized settings
      const uploadResult = await cloudinary.uploader.upload(file.path, {
        resource_type: resourceType,
        folder: "gallery_uploads",
        transformation: resourceType === "image" ? [
          { quality: "auto:good", fetch_format: "auto" }
        ] : undefined,
        eager: resourceType === "video" ? [
          { streaming_profile: "hd", format: "m3u8" }
        ] : undefined,
        eager_async: true,
      });

      // Extract metadata
      const mediaData = {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        type: uploadResult.resource_type,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: userId,
      };

      // Add dimensions if available
      if (uploadResult.width) mediaData.width = uploadResult.width;
      if (uploadResult.height) mediaData.height = uploadResult.height;
      if (uploadResult.duration) mediaData.duration = uploadResult.duration;

      // Save to database
      const savedMedia = await Gallery.create(mediaData);

      // Delete local file after successful upload
      try {
        await fs.unlink(file.path);
      } catch (unlinkErr) {
        console.error("Failed to delete local file:", unlinkErr);
      }

      return savedMedia;
    } catch (uploadError) {
      // Clean up local file on error
      try {
        await fs.unlink(file.path);
      } catch (unlinkErr) {
        console.error("Failed to delete local file:", unlinkErr);
      }
      
      throw new Error(`Failed to upload ${file.originalname}: ${uploadError.message}`);
    }
  });

  // Upload all files in parallel
  const results = await Promise.allSettled(uploadPromises);
  
  // Separate successful and failed uploads
  const successful = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);
  
  const failed = results
    .filter(r => r.status === "rejected")
    .map(r => r.reason.message);

  if (failed.length > 0) {
    console.warn("Some uploads failed:", failed);
  }

  if (successful.length === 0) {
    throw new Error("All uploads failed");
  }

  return {
    successful,
    failed,
    total: files.length,
    successCount: successful.length,
    failCount: failed.length,
  };
};

/**
 * Fetch all media with pagination and filtering
 */
exports.getAllMedia = async (options = {}) => {
  const {
    page = 1,
    limit = 50,
    type, // filter by type (image/video)
    userId, // filter by uploader
    sortBy = "createdAt",
    sortOrder = "desc",
  } = options;

  const query = {};
  if (type) query.type = type;
  if (userId) query.uploadedBy = userId;

  const skip = (page - 1) * limit;
  const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  const [items, total] = await Promise.all([
    Gallery.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .populate("uploadedBy", "name email")
      .lean(),
    Gallery.countDocuments(query),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Delete a media item by ID
 */
exports.deleteMedia = async (mediaId, userId = null) => {
  const media = await Gallery.findById(mediaId);
  
  if (!media) {
    throw new Error("Media not found");
  }

  // Optional: Check if user owns the media
  if (userId && media.uploadedBy.toString() !== userId.toString()) {
    throw new Error("Unauthorized to delete this media");
  }

  try {
    // Delete from Cloudinary
    const resourceType = media.type === "video" ? "video" : "image";
    await cloudinary.uploader.destroy(media.publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
  } catch (cloudinaryErr) {
    console.error("Cloudinary deletion error:", cloudinaryErr);
    // Continue with DB deletion even if Cloudinary fails
  }

  // Delete from database
  await media.deleteOne();

  return { success: true, message: "Media deleted successfully" };
};

/**
 * Bulk delete media items
 */
exports.bulkDeleteMedia = async (mediaIds, userId = null) => {
  const media = await Gallery.find({ _id: { $in: mediaIds } });
  
  if (!media.length) {
    throw new Error("No media found with provided IDs");
  }

  const deletePromises = media.map(async (item) => {
    // Optional: Check ownership
    if (userId && item.uploadedBy.toString() !== userId.toString()) {
      return { id: item._id, success: false, error: "Unauthorized" };
    }

    try {
      const resourceType = item.type === "video" ? "video" : "image";
      await cloudinary.uploader.destroy(item.publicId, {
        resource_type: resourceType,
        invalidate: true,
      });
      await item.deleteOne();
      return { id: item._id, success: true };
    } catch (err) {
      return { id: item._id, success: false, error: err.message };
    }
  });

  const results = await Promise.allSettled(deletePromises);
  return results.map(r => r.status === "fulfilled" ? r.value : { success: false });
};
