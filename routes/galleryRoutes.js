const express = require("express");
const router = express.Router();
const galleryController = require("../controllers/galleryController");
const upload = require("../middleware/multerUpload");
const authMiddleware = require("../middleware/auth");

// GET all gallery items (with pagination)
router.get("/", galleryController.getGallery);

// UPLOAD single or multiple files (requires auth)
router.post(
  "/upload",
  authMiddleware,
  upload.array("media", 20), // up to 20 files per upload
  galleryController.uploadMedia
);

// DELETE single item (requires auth)
router.delete("/:id", authMiddleware, galleryController.deleteMedia);

// BULK DELETE (requires auth)
router.delete("/", authMiddleware, galleryController.bulkDeleteMedia);

module.exports = router;