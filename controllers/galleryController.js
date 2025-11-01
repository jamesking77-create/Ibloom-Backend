const galleryService = require("../services/galleryService");

/**
 * @desc Get all gallery items with pagination
 * @route GET /api/gallery?page=1&limit=50&type=image
 */
exports.getGallery = async (req, res) => {
  try {
    const { page, limit, type, sortBy, sortOrder } = req.query;
    
    const result = await galleryService.getAllMedia({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      type,
      sortBy,
      sortOrder,
    });

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Fetch gallery error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch gallery",
    });
  }
};

/**
 * @desc Upload one or more media files
 * @route POST /api/gallery/upload
 */
exports.uploadMedia = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded",
      });
    }

    const uploadedBy = req.user?._id;
    if (!uploadedBy) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const result = await galleryService.uploadMedia(req.files, uploadedBy);

    // Return appropriate status based on results
    const statusCode = result.failCount > 0 ? 207 : 201; // 207 = Multi-Status

    res.status(statusCode).json({
      success: result.successCount > 0,
      data: result.successful,
      failed: result.failed,
      message: `Uploaded ${result.successCount} of ${result.total} files`,
      stats: {
        total: result.total,
        successful: result.successCount,
        failed: result.failCount,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Upload failed",
    });
  }
};

/**
 * @desc Delete a media item
 * @route DELETE /api/gallery/:id
 */
exports.deleteMedia = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id; // Optional: enforce ownership

    await galleryService.deleteMedia(id, userId);

    res.status(200).json({
      success: true,
      message: "Media deleted successfully",
    });
  } catch (error) {
    console.error("Delete error:", error);
    const statusCode = error.message.includes("not found") ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to delete media",
    });
  }
};

/**
 * @desc Bulk delete media items
 * @route DELETE /api/gallery/bulk
 */
exports.bulkDeleteMedia = async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No media IDs provided",
      });
    }

    const userId = req.user?._id;
    const results = await galleryService.bulkDeleteMedia(ids, userId);

    const successCount = results.filter(r => r.success).length;

    res.status(200).json({
      success: successCount > 0,
      message: `Deleted ${successCount} of ${ids.length} items`,
      results,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Bulk delete failed",
    });
  }
};
