const { sendIndividualEmail } = require("../utils/emailService");
const axios = require("axios");

const sendIndividualMail = async (req, res) => {
  try {
    const { to, subject, message, customerName, attachments } = req.body;
    console.log("body", req.body);

    if (!to || !subject || !message) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Process attachments if they exist
    let processedAttachments = [];

    if (attachments && attachments.length > 0) {
      try {
        processedAttachments = await processAttachments(attachments);
      } catch (attachmentError) {
        console.error("Attachment processing error:", attachmentError);
        return res.status(400).json({
          message: "Failed to process attachments",
          error: attachmentError.message,
        });
      }
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

// Helper function to process attachments
const processAttachments = async (attachments) => {
  const processedAttachments = [];

  for (const attachment of attachments) {
    try {
      const downloadUrl = attachment.cloudinaryUrl || attachment.url;

      if (!downloadUrl) {
        console.warn(`No valid URL for attachment: ${attachment.name}`);
        continue;
      }

      if (downloadUrl.startsWith("blob:")) {
        console.warn(`Skipping blob URL for attachment: ${attachment.name}`);
        continue;
      }

      const response = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
        timeout: 30000, // 30 second timeout
      });

      const base64Content = Buffer.from(response.data).toString("base64");

      processedAttachments.push({
        filename: attachment.name,
        content: base64Content,
        contentType: attachment.type,
        encoding: "base64",
        size: attachment.size,
        cid: attachment.id?.toString(),
      });
    } catch (error) {
      console.error(
        `Failed to process attachment ${attachment.name}:`,
        error.message
      );
    }
  }

  return processedAttachments;
};

module.exports = { sendIndividualMail };

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
