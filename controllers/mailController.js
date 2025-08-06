const multer = require("multer");
const { sendIndividualEmail } = require("../utils/emailService");

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

    if (req.files && req.files.length > 0) {
      processedAttachments = processUploadedFiles(req.files);
      console.log(`Processed ${processedAttachments.length} attachments`);
    }

    await sendIndividualEmail({
      to,
      subject,
      message,
      customerName,
      attachments: processedAttachments,
    });

    res.status(200).json({
      message: "Email sent successfully",
      to,
      subject,
      customerName,
      attachmentCount: processedAttachments.length,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Mailer error:", error.message);
    res
      .status(500)
      .json({ message: "Failed to send email", error: error.message });
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
    if (req.files && req.files.length > 0) {
      processedAttachments = processUploadedFiles(req.files);
    }

    const results = [];
    const errors = [];

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
      } catch (error) {
        errors.push({
          email: recipient.email,
          status: "failed",
          error: error.message,
        });
      }
    }

    res.status(200).json({
      message: "Broadcast completed",
      totalRecipients: parsedRecipients.length,
      successful: results.length,
      failed: errors.length,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Broadcast error:", error.message);
    res
      .status(500)
      .json({
        message: "Failed to send broadcast email",
        error: error.message,
      });
  }
};

module.exports = {
  sendIndividualMail,
  sendBroadcastMail,
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
