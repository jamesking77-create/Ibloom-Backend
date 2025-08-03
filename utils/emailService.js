const nodemailer = require("nodemailer");

// Create reusable transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Function to send password reset email
const sendPasswordResetEmail = async (email, resetToken) => {
  const resetLink = `${process.env.CLIENT_URL}/resetPassword/${resetToken}`;

  // Log the email details for debugging
  console.log("Sending password reset email:", {
    to: email,
    resetLink,
    from: process.env.EMAIL_USER,
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Ibloom Password Reset Request",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <!-- Header with Logo -->
        <div style="text-align: center; padding-bottom: 20px;">
          <img src="https://sidmach.com/wp-content/uploads/2024/02/password.png alt="Ibloom Logo" style="max-width: 150px; height: auto;" />
        </div>

        <!-- Main Content -->
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
          <h2 style="color: #333333; font-size: 24px; margin-bottom: 20px;">Password Reset Request</h2>
          <p style="color: #666666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            Hello,
          </p>
          <p style="color: #666666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            You are receiving this email because you (or someone else) requested a password reset for your Ibloom account.
          </p>
          <p style="color: #666666; font-size: 16px; line-height: 1.5; margin-bottom: 30px;">
            Please click the button below to reset your password. This link will expire in 10 minutes.
          </p>
          
          <!-- Reset Button -->
          <div style="text-align: center;">
            <a href="${resetLink}" style="
              display: inline-block;
              padding: 12px 24px;
              font-size: 16px;
              font-weight: bold;
              color: #ffffff;
              background-color: #468E36;
              text-decoration: none;
              border-radius: 5px;
              box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            ">Reset Password</a>
          </div>
          
          <p style="color: #666666; font-size: 14px; line-height: 1.5; margin-top: 30px;">
            If you did not request this, please ignore this email, and your password will remain unchanged.
          </p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; padding-top: 20px; color: #999999; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Ibloom. All rights reserved.</p>
          <p>If you have any questions, contact us at <a href="mailto:support@ibloom.com" style="color: #468E36; text-decoration: none;">support@ibloom.com</a>.</p>
        </div>
      </div>
    `,
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("Error sending email:", {
          error: err.message,
          stack: err.stack,
          to: email,
        });
        reject(err);
      } else {
        console.log("Password reset email sent:", {
          to: email,
          messageId: info.messageId,
          response: info.response,
        });
        resolve(info);
      }
    });
  });
};

//Function to send indvividual emails
const sendIndividualEmail = async ({
  to,
  subject,
  message,
  customerName,
  attachments = [],
}) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p>Hello ${customerName || ""},</p>
        <div>${message}</div>
        <br />
        <p style="color: gray; font-size: 12px;">Sent via Ibloom Email Service</p>
      </div>
    `,
    attachments: attachments.map((att) => ({
      filename: att.name,
      path: att.url,
      contentType: att.type,
    })),
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("Error sending individual email:", {
          error: err.message,
          to,
        });
        reject(err);
      } else {
        console.log("Individual email sent:", {
          to,
          messageId: info.messageId,
          response: info.response,
        });
        resolve(info);
      }
    });
  });
};

module.exports = {
  sendPasswordResetEmail,
  sendIndividualEmail,
};
