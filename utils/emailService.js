const nodemailer = require("nodemailer");

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587, // Changed from 465
  secure: false, // Changed from true
  auth: {
    user: process.env.EMAIL_USER, // jamesasuelimen77@gmail.com
    pass: process.env.EMAIL_PASSWORD, // Your Gmail App Password
  },
  tls: {
    rejectUnauthorized: true
  }
});

// Function to send password reset email
const sendPasswordResetEmail = async (email, resetToken) => {
  const resetLink = `${process.env.FRONTEND_URL}/resetPassword/${resetToken}`;

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

// FIXED: Function to send individual emails with proper attachment handling
const sendIndividualEmail = async ({
  to,
  subject,
  message,
  customerName,
  attachments = [],
}) => {
  console.log("=== EMAIL SERVICE DEBUG ===");
  console.log("Recipient:", to);
  console.log("Attachments received:", attachments.length);
  
  // Debug each attachment
  attachments.forEach((attachment, index) => {
    console.log(`Attachment ${index + 1}:`, {
      filename: attachment.filename,
      contentType: attachment.contentType,
      encoding: attachment.encoding,
      contentLength: attachment.content ? attachment.content.length : 0,
      size: attachment.size,
      hasContent: !!attachment.content,
      contentPreview: attachment.content ? attachment.content.substring(0, 50) + '...' : 'NO CONTENT'
    });
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
          <h2 style="color: #333333; margin-bottom: 20px;">Hello ${customerName || "Valued Customer"},</h2>
          <div style="color: #666666; line-height: 1.6; margin-bottom: 20px;">
            ${message.replace(/\n/g, '<br>')}
          </div>
          ${attachments.length > 0 ? `
            <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                📎 This email contains ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}
              </p>
            </div>
          ` : ''}
          <br />
          <p style="color: #999999; font-size: 12px; margin-top: 30px;">
            Sent via Ibloom Email Service
          </p>
        </div>
      </div>
    `,
    // CRITICAL FIX: Properly format attachments for nodemailer
    attachments: attachments.map((attachment, index) => {
      // Validate attachment before processing
      if (!attachment.content) {
        console.error(`❌ Attachment ${attachment.filename} has no content!`);
        return null;
      }

      console.log(`📎 Processing attachment ${index + 1}: ${attachment.filename}`);
      
      // Return properly formatted attachment for nodemailer
      return {
        filename: attachment.filename,        // ✅ Use 'filename' not 'name'
        content: attachment.content,          // ✅ Use base64 'content' not 'path'
        encoding: attachment.encoding || 'base64', // ✅ Specify encoding
        contentType: attachment.contentType,  // ✅ Use 'contentType' not 'type'
        // Optional: Add Content-ID for inline images
        ...(attachment.contentType && attachment.contentType.startsWith('image/') && {
          cid: attachment.cid || `image_${index}`
        })
      };
    }).filter(Boolean), // Remove null attachments
  };

  console.log("📧 Final mail options:", {
    to: mailOptions.to,
    subject: mailOptions.subject,
    attachmentCount: mailOptions.attachments.length,
    attachmentNames: mailOptions.attachments.map(a => a.filename)
  });

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("❌ Error sending individual email:", {
          error: err.message,
          to,
          attachmentCount: attachments.length
        });
        reject(err);
      } else {
        console.log("✅ Individual email sent:", {
          to,
          messageId: info.messageId,
          response: info.response,
          attachmentsSent: mailOptions.attachments.length
        });
        resolve(info);
      }
    });
  });
};


const sendEmail = async ({
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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
          <div style="color: #666666; line-height: 1.6; margin-bottom: 20px;">
            ${message.replace(/\n/g, '<br>')}
          </div>
          ${attachments.length > 0 ? `
            <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                📎 This email contains ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}
              </p>
            </div>
          ` : ''}
          <br />
          <p style="color: #999999; font-size: 12px; margin-top: 30px;">
            Sent via Ibloom Email Service
          </p>
        </div>
      </div>
    `,
    // CRITICAL FIX: Properly format attachments for nodemailer
    attachments: attachments.map((attachment, index) => {
      // Validate attachment before processing
      if (!attachment.content) {
        console.error(`Attachment ${attachment.filename} has no content!`);
        return null;
      }
      
      // Return properly formatted attachment for nodemailer
      return {
        filename: attachment.filename,       
        content: attachment.content,          
        encoding: attachment.encoding || 'base64', 
        contentType: attachment.contentType,  
        // Optional: Add Content-ID for inline images
        ...(attachment.contentType && attachment.contentType.startsWith('image/') && {
          cid: attachment.cid || `image_${index}`
        })
      };
    }).filter(Boolean), // Remove null attachments
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("Error sending individual email:", {
          error: err.message,
          to,
          attachmentCount: attachments.length
        });
        reject(err);
      } else {
        console.log("Individual email sent:", {
          to,
          messageId: info.messageId,
          response: info.response,
          attachmentsSent: mailOptions.attachments.length
        });
        resolve(info);
      }
    });
  });
};
module.exports = {
  sendPasswordResetEmail,
  sendIndividualEmail,
  sendEmail,
};