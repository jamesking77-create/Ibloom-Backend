const multer = require("multer");
const { sendIndividualEmail, sendEmail } = require("../utils/emailService");
const MailHistory = require("../models/MailHistory");
const Booking = require("../models/Bookings");

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit per file
  },
  fileFilter: (req, file, cb) => {
    // Optional: Add file type restrictions
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  },
});

const sendIndividualMail = async (req, res) => {
  try {
    const { to, subject, message, customerName } = req.body;
    console.log("Received form data:", req.body);
    console.log("Received files:", req.files);

    if (!to || !subject || !message) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Process uploaded files
    let processedAttachments = [];
    let attachmentData = [];

    if (req.files && req.files.length > 0) {
      processedAttachments = processUploadedFiles(req.files);

      // Prepare attachment data for database storage
      attachmentData = req.files.map((file) => ({
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date(),
      }));

      console.log(`Processed ${processedAttachments.length} attachments`);
    }

    // Send the email
    await sendIndividualEmail({
      to,
      subject,
      message,
      customerName,
      attachments: processedAttachments,
    });

    // Save to mail history
    const mailHistoryRecord = new MailHistory({
      type: "individual",
      subject: subject,
      message: message,
      senderEmail: req.user?.email || "system@yourcompany.com", // Get from authenticated user
      recipientEmail: to,
      recipientName: customerName,
      attachmentCount: attachmentData.length,
      attachments: attachmentData,
      status: "sent",
      sentAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedRecord = await mailHistoryRecord.save();
    console.log("Mail history saved:", savedRecord._id);

    res.status(200).json({
      message: "Email sent successfully",
      to,
      subject,
      customerName,
      attachmentCount: processedAttachments.length,
      sentAt: new Date().toISOString(),
      historyId: savedRecord._id,
    });
  } catch (error) {
    console.error("Mailer error:", error.message);

    // Try to save failed email to history
    try {
      const failedRecord = new MailHistory({
        type: "individual",
        subject: req.body.subject || "Failed Email",
        message: req.body.message || "",
        senderEmail: req.user?.email || "system@yourcompany.com",
        recipientEmail: req.body.to,
        recipientName: req.body.customerName,
        attachmentCount: req.files ? req.files.length : 0,
        attachments: req.files
          ? req.files.map((file) => ({
              filename: file.originalname,
              size: file.size,
              mimeType: file.mimetype,
              uploadedAt: new Date(),
            }))
          : [],
        status: "failed",
        errorMessage: error.message,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await failedRecord.save();
    } catch (historyError) {
      console.error("Failed to save error to history:", historyError);
    }

    res.status(500).json({
      message: "Failed to send email",
      error: error.message,
    });
  }
};

const sendBroadcastMail = async (req, res) => {
  try {
    const { subject, message, recipients } = req.body;
    console.log("Received broadcast data:", req.body);

    if (!subject || !message || !recipients) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    let parsedRecipients;
    try {
      parsedRecipients =
        typeof recipients === "string" ? JSON.parse(recipients) : recipients;
    } catch (error) {
      return res.status(400).json({ message: "Invalid recipients format" });
    }

    let processedAttachments = [];
    let attachmentData = [];

    if (req.files && req.files.length > 0) {
      processedAttachments = processUploadedFiles(req.files);

      // Prepare attachment data for database storage
      attachmentData = req.files.map((file) => ({
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date(),
      }));
    }

    const results = [];
    const errors = [];
    const recipientDetails = [];

    // Send emails and track results
    for (const recipient of parsedRecipients) {
      try {
        await sendIndividualEmail({
          to: recipient.email,
          subject,
          message,
          customerName: recipient.customerName,
          attachments: processedAttachments,
        });

        results.push({ email: recipient.email, status: "sent" });
        recipientDetails.push({
          email: recipient.email,
          name: recipient.customerName,
          status: "sent",
          errorMessage: null,
          sentAt: new Date(),
        });
      } catch (error) {
        errors.push({
          email: recipient.email,
          status: "failed",
          error: error.message,
        });
        recipientDetails.push({
          email: recipient.email,
          name: recipient.customerName,
          status: "failed",
          errorMessage: error.message,
          sentAt: null,
        });
      }
    }

    // Determine overall status
    let overallStatus = "sent";
    if (errors.length === parsedRecipients.length) {
      overallStatus = "failed";
    } else if (errors.length > 0) {
      overallStatus = "partial";
    }

    // Save broadcast to mail history
    const mailHistoryRecord = new MailHistory({
      type: "broadcast",
      subject: subject,
      message: message,
      senderEmail: req.user?.email || "system@yourcompany.com",
      recipientCount: parsedRecipients.length,
      recipients: recipientDetails,
      attachmentCount: attachmentData.length,
      attachments: attachmentData,
      status: overallStatus,
      errorMessage:
        errors.length > 0 ? `${errors.length} recipients failed` : null,
      sentAt: results.length > 0 ? new Date() : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedRecord = await mailHistoryRecord.save();
    console.log("Broadcast history saved:", savedRecord._id);

    res.status(200).json({
      message: "Broadcast completed",
      totalRecipients: parsedRecipients.length,
      successful: results.length,
      failed: errors.length,
      sentAt: new Date().toISOString(),
      historyId: savedRecord._id,
      details: {
        successful: results,
        failed: errors,
      },
    });
  } catch (error) {
    console.error("Broadcast error:", error.message);

    // Try to save failed broadcast to history
    try {
      const failedRecord = new MailHistory({
        type: "broadcast",
        subject: req.body.subject || "Failed Broadcast",
        message: req.body.message || "",
        senderEmail: req.user?.email || "system@yourcompany.com",
        recipientCount: 0,
        recipients: [],
        attachmentCount: req.files ? req.files.length : 0,
        attachments: req.files
          ? req.files.map((file) => ({
              filename: file.originalname,
              size: file.size,
              mimeType: file.mimetype,
              uploadedAt: new Date(),
            }))
          : [],
        status: "failed",
        errorMessage: error.message,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await failedRecord.save();
    } catch (historyError) {
      console.error("Failed to save broadcast error to history:", historyError);
    }

    res.status(500).json({
      message: "Failed to send broadcast email",
      error: error.message,
    });
  }
};

const sendContactMail = async (req, res) => {
  try {
    const { to, subject, html, from } = req.body;

    if (!to || !subject || !html || !from || !from.name || !from.email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Validate email formats (basic regex)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to) || !emailRegex.test(from.email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    await sendEmail({
      to,
      subject,
      message: html,
      customerName: from.name,
      attachments: [],
    });

    res.status(200).json({
      message: "Email sent successfully",
      to,
      subject,
      from,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Contact mail error:", error.message);
    res.status(500).json({
      message: "Failed to send email",
      error: error.message,
    });
  }
};

// NEW: Get mail history endpoint
const getMailHistory = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      senderEmail,
      startDate,
      endDate,
    } = req.query;

    // Build filter query
    const filter = {};

    if (type && ["individual", "broadcast"].includes(type)) {
      filter.type = type;
    }

    if (status && ["sent", "failed", "pending", "partial"].includes(status)) {
      filter.status = status;
    }

    if (senderEmail) {
      filter.senderEmail = new RegExp(senderEmail, "i");
    }

    if (startDate || endDate) {
      filter.sentAt = {};
      if (startDate) {
        filter.sentAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.sentAt.$lte = new Date(endDate);
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get total count for pagination
    const totalCount = await MailHistory.countDocuments(filter);

    // Fetch mail history with pagination
    const mailHistory = await MailHistory.find(filter)
      .sort({ createdAt: -1 }) // Most recent first
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // Use lean() for better performance

    // Get statistics
    const stats = await getMailStats(req.user?.email);

    res.status(200).json({
      success: true,
      data: {
        history: mailHistory,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          hasNextPage: skip + parseInt(limit) < totalCount,
          hasPrevPage: parseInt(page) > 1,
        },
        stats,
      },
    });
  } catch (error) {
    console.error("Get mail history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch mail history",
      error: error.message,
    });
  }
};

// NEW: Get mail statistics
const getMailStats = async (userEmail = null) => {
  try {
    const today = new Date();
    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Build base filter (optionally filter by user)
    const baseFilter = userEmail ? { senderEmail: userEmail } : {};

    // Get stats using aggregation pipeline for better performance
    const [todayStats, monthStats, lastEmail, totalBookings] =
      await Promise.all([
        // Emails sent today
        MailHistory.aggregate([
          {
            $match: {
              ...baseFilter,
              sentAt: { $gte: startOfDay },
              status: { $in: ["sent", "partial"] },
            },
          },
          {
            $group: {
              _id: null,
              individualCount: {
                $sum: { $cond: [{ $eq: ["$type", "individual"] }, 1, 0] },
              },
              broadcastCount: {
                $sum: {
                  $cond: [
                    { $eq: ["$type", "broadcast"] },
                    "$recipientCount",
                    0,
                  ],
                },
              },
            },
          },
        ]),

        // Emails sent this month
        MailHistory.aggregate([
          {
            $match: {
              ...baseFilter,
              sentAt: { $gte: startOfMonth },
              status: { $in: ["sent", "partial"] },
            },
          },
          {
            $group: {
              _id: null,
              individualCount: {
                $sum: { $cond: [{ $eq: ["$type", "individual"] }, 1, 0] },
              },
              broadcastCount: {
                $sum: {
                  $cond: [
                    { $eq: ["$type", "broadcast"] },
                    "$recipientCount",
                    0,
                  ],
                },
              },
            },
          },
        ]),

        // Last email sent
        MailHistory.findOne(
          { ...baseFilter, status: { $in: ["sent", "partial"] } },
          { sentAt: 1, type: 1, subject: 1 }
        ).sort({ sentAt: -1 }),

        // Get total bookings count (total recipients available)
        Booking.countDocuments({
          email: { $exists: true, $ne: "" }, // Only count bookings with valid emails
          // Add any other filters you need (e.g., active bookings only)
        }),
      ]);

    const emailsSentToday =
      (todayStats[0]?.individualCount || 0) +
      (todayStats[0]?.broadcastCount || 0);
    const emailsSentThisMonth =
      (monthStats[0]?.individualCount || 0) +
      (monthStats[0]?.broadcastCount || 0);

    return {
      totalRecipients: totalBookings || 0,
      emailsSentToday,
      emailsSentThisMonth,
      lastEmailSent: lastEmail?.sentAt || null,
      lastEmailSubject: lastEmail?.subject || null,
      lastEmailType: lastEmail?.type || null,
    };
  } catch (error) {
    console.error("Error getting mail stats:", error);
    return {
      totalRecipients: 0,
      emailsSentToday: 0,
      emailsSentThisMonth: 0,
      lastEmailSent: null,
      lastEmailSubject: null,
      lastEmailType: null,
    };
  }
};

// Process uploaded files from multer
const processUploadedFiles = (files) => {
  const processedAttachments = [];

  files.forEach((file) => {
    try {
      // Convert buffer to base64 for email service
      const base64Content = file.buffer.toString("base64");

      processedAttachments.push({
        filename: file.originalname,
        content: base64Content,
        contentType: file.mimetype,
        encoding: "base64",
        size: file.size,
        cid: Date.now().toString() + Math.random(), // Generate unique CID
      });

      console.log(
        `Successfully processed file: ${file.originalname} (${file.size} bytes)`
      );
    } catch (error) {
      console.error(
        `Failed to process file ${file.originalname}:`,
        error.message
      );
    }
  });

  return processedAttachments;
};

module.exports = {
  sendIndividualMail,
  sendBroadcastMail,
  sendContactMail,
  getMailHistory,
  getMailStats,
};

// const { sendIndividualEmail } = require("../utils/emailService");

// const sendIndividualMail = async (req, res) => {
//   try {
//     const { to, subject, message, customerName, attachments } = req.body;
//     console.log("body",req.body);

//     if (!to || !subject || !message) {
//       return res.status(400).json({ message: "Missing required fields" });
//     }

//     await sendIndividualEmail({
//       to,
//       subject,
//       message,
//       customerName,
//       attachments,
//     });

//     res.status(200).json({
//       message: "Email sent successfully",
//       to,
//       subject,
//       customerName,
//       sentAt: new Date().toISOString(),
//     });
//   } catch (error) {
//     console.error("Mailer error:", error.message);
//     res
//       .status(500)
//       .json({ message: "Failed to send email", error: error.message });
//   }
// };

// module.exports = { sendIndividualMail };
