const { sendIndividualEmail } = require("../utils/emailService");

const sendIndividualMail = async (req, res) => {
  try {
    const { to, subject, message, customerName, attachments } = req.body;
    console.log("body",req.body);

    if (!to || !subject || !message) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await sendIndividualEmail({
      to,
      subject,
      message,
      customerName,
      attachments,
    });

    res.status(200).json({
      message: "Email sent successfully",
      to,
      subject,
      customerName,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Mailer error:", error.message);
    res
      .status(500)
      .json({ message: "Failed to send email", error: error.message });
  }
};

module.exports = { sendIndividualMail };
