const Booking = require("../models/Bookings");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit"); // Add this import

// Email configuration
const transporter = nodemailer.createTransport({
  // Replace with your email service provider
  service: "gmail", // or your preferred service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Admin notification email addresses
const ADMIN_EMAILS = [
  process.env.ADMIN_EMAIL || "admin@youreventcompany.com",
  // Add more admin emails here if needed
  // 'admin2@youreventcompany.com',
];

// Helper function to format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(amount);
};

// Helper function to calculate formatted prices
const calculateFormattedPricing = (itemsSubtotal, taxRate = 0.075) => {
  const taxAmount = itemsSubtotal * taxRate;
  const totalAmount = itemsSubtotal + taxAmount;

  return {
    itemsSubtotal,
    taxAmount,
    totalAmount,
    formatted: {
      subtotal: formatCurrency(itemsSubtotal),
      tax: formatCurrency(taxAmount),
      total: formatCurrency(totalAmount),
    },
  };
};

// Get all bookings
const getBookings = async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });

    const pagination = {
      currentPage: 1,
      totalPages: Math.ceil(bookings.length / 10),
      totalItems: bookings.length,
      itemsPerPage: 10,
    };

    // Calculate statistics
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const thisWeekBookings = bookings.filter(
      (b) => new Date(b.createdAt) >= oneWeekAgo
    );
    const thisMonthBookings = bookings.filter(
      (b) => new Date(b.createdAt) >= oneMonthAgo
    );

    const totalRevenue = bookings
      .filter((b) => b.status === "confirmed")
      .reduce((acc, b) => {
        const amount =
          b.pricing?.totalAmount ||
          parseFloat(b.amount?.replace(/[₦,]/g, "") || 0);
        return acc + amount;
      }, 0);

    const stats = {
      thisWeek: thisWeekBookings.length,
      thisMonth: thisMonthBookings.length,
      totalRevenue: totalRevenue,
    };

    res.status(200).json({ bookings, pagination, stats });
  } catch (error) {
    console.error("Get bookings error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch bookings", error: error.message });
  }
};

// Create a new booking
const createBooking = async (req, res) => {
  try {
    console.log(
      "Creating booking with data:",
      JSON.stringify(req.body, null, 2)
    );
    console.log("=== DEBUGGING BOOKING CREATION ===");
    console.log("req.body exists:", !!req.body);
    console.log("req.body type:", typeof req.body);
    console.log("req.body keys:", Object.keys(req.body || {}));
    console.log("Raw request body:", JSON.stringify(req.body, null, 2));
    console.log("Content-Type header:", req.headers["content-type"]);
    console.log("=====================================");

    // Check if body is empty or malformed
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error("❌ Request body is empty or undefined");
      return res.status(400).json({
        message: "Request body is empty or malformed",
        received: req.body,
      });
    }

    // Validate required fields
    const { customer, eventSchedule, services, pricing } = req.body;

    if (
      !customer?.personalInfo?.name ||
      !customer?.personalInfo?.email ||
      !customer?.personalInfo?.phone
    ) {
      return res.status(400).json({
        message: "Missing required customer information",
      });
    }

    if (!eventSchedule?.startDate || !eventSchedule?.endDate) {
      return res.status(400).json({
        message: "Missing required event schedule information",
      });
    }

    if (!services || services.length === 0) {
      return res.status(400).json({
        message: "At least one service must be selected",
      });
    }

    // Generate unique booking ID if not provided
    if (!req.body.bookingId) {
      req.body.bookingId = "BK" + Date.now().toString().slice(-6);
    }

    // Ensure proper pricing calculation
    if (pricing) {
      const calculatedPricing = calculateFormattedPricing(
        pricing.itemsSubtotal || 0,
        pricing.taxRate || 0.075
      );
      req.body.pricing = {
        ...pricing,
        ...calculatedPricing,
        totalItems: services.reduce(
          (sum, service) => sum + service.quantity,
          0
        ),
        totalServices: services.length,
        currency: pricing.currency || "NGN",
      };
    }

    // Set validation flags
    req.body.validation = {
      hasCustomerInfo: !!(
        customer?.personalInfo?.name && customer?.personalInfo?.email
      ),
      hasEventSchedule: !!(eventSchedule?.startDate && eventSchedule?.endDate),
      hasServices: services && services.length > 0,
      hasPricing: !!pricing?.totalAmount,
    };

    // Set business data defaults
    req.body.businessData = {
      ...req.body.businessData,
      deliveryRequired: customer?.eventDetails?.delivery === "yes",
      setupRequired: customer?.eventDetails?.installation === "yes",
    };

    // Create the booking
    const booking = new Booking(req.body);
    await booking.save();

    console.log("Booking created successfully:", booking._id);

    // Send emails in parallel (don't block the response)
    const emailPromises = [
      sendBookingConfirmationEmail(booking),
      sendAdminNotificationEmail(booking),
    ];

    // Execute all email sending in background
    Promise.all(emailPromises)
      .then(() => {
        console.log("All notification emails sent successfully");
      })
      .catch((emailError) => {
        console.error("Failed to send some notification emails:", emailError);
      });

    res.status(201).json(booking);
  } catch (error) {
    console.error("Create booking error:", error);
    res.status(500).json({
      message: "Failed to create booking",
      error: error.message,
    });
  }
};

// Get single booking by ID
const getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    res.status(200).json(booking);
  } catch (error) {
    console.error("Get booking by ID error:", error);
    res.status(500).json({
      message: "Failed to fetch booking",
      error: error.message,
    });
  }
};

// Update booking status
const updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (
      !["pending_confirmation", "confirmed", "cancelled", "pending"].includes(
        status
      )
    ) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const oldStatus = booking.status;
    booking.status = status;
    await booking.save();

    console.log(
      `Booking ${booking.bookingId} status updated from ${oldStatus} to ${status}`
    );

    // Send status update email to customer (background)
    sendStatusUpdateEmail(booking, oldStatus, status).catch((emailError) => {
      console.error("Failed to send status update email:", emailError);
    });

    res.status(200).json({ status: booking.status });
  } catch (error) {
    console.error("Update booking status error:", error);
    res.status(500).json({
      message: "Failed to update status",
      error: error.message,
    });
  }
};

// Update booking payment
const updateBookingPayment = async (req, res) => {
  try {
    const { paymentStatus, amountPaid } = req.body;

    if (!["unpaid", "partial", "paid"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status" });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    booking.paymentStatus = paymentStatus;
    booking.amountPaid = amountPaid || 0;
    await booking.save();

    console.log(
      `Booking ${booking.bookingId} payment updated: ${paymentStatus}, amount: ${amountPaid}`
    );

    res.status(200).json({
      paymentStatus: booking.paymentStatus,
      amountPaid: booking.amountPaid,
    });
  } catch (error) {
    console.error("Update booking payment error:", error);
    res.status(500).json({
      message: "Failed to update payment",
      error: error.message,
    });
  }
};

// Update booking items/services
const updateBookingItems = async (req, res) => {
  try {
    const { items, services, amount } = req.body;

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Update services if provided (new format)
    if (services) {
      booking.services = services;

      // Recalculate pricing
      const itemsSubtotal = services.reduce(
        (sum, service) => sum + service.subtotal,
        0
      );
      const calculatedPricing = calculateFormattedPricing(itemsSubtotal);

      booking.pricing = {
        ...booking.pricing,
        ...calculatedPricing,
        totalItems: services.reduce(
          (sum, service) => sum + service.quantity,
          0
        ),
        totalServices: services.length,
      };
    }

    // Update legacy items format if provided
    if (items) {
      booking.items = items;
    }

    // Update amount if provided
    if (amount) {
      if (typeof amount === "number") {
        booking.pricing = booking.pricing || {};
        booking.pricing.totalAmount = amount;
        booking.pricing.formatted = booking.pricing.formatted || {};
        booking.pricing.formatted.total = formatCurrency(amount);
      } else {
        booking.amount = amount;
      }
    }

    await booking.save();

    console.log(`Booking ${booking.bookingId} items updated`);

    res.status(200).json({
      items: booking.items,
      services: booking.services,
      amount: booking.amount || booking.pricing?.formatted?.total,
      pricing: booking.pricing,
    });
  } catch (error) {
    console.error("Update booking items error:", error);
    res.status(500).json({
      message: "Failed to update items",
      error: error.message,
    });
  }
};

// Generate and send invoice
const generateInvoice = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const { invoiceData } = req.body;

    // Generate invoice number if not provided
    const invoiceNumber =
      invoiceData?.invoiceNumber || `INV-${booking.bookingId}`;

    // Update booking with invoice information
    booking.invoiceGenerated = true;
    booking.invoiceNumber = invoiceNumber;
    booking.lastInvoiceUpdate = new Date();

    await booking.save();

    // Send invoice email
    try {
      await sendInvoiceEmail(booking, invoiceData);
      booking.invoiceSentAt = new Date();
      await booking.save();
    } catch (emailError) {
      console.error("Failed to send invoice email:", emailError);
      return res.status(500).json({
        message: "Invoice generated but failed to send email",
        error: emailError.message,
      });
    }

    console.log(
      `Invoice ${invoiceNumber} generated and sent for booking ${booking.bookingId}`
    );

    res.status(200).json({
      message: "Invoice generated and sent successfully",
      invoiceNumber,
      sentTo: booking.customer.personalInfo.email,
    });
  } catch (error) {
    console.error("Generate invoice error:", error);
    res.status(500).json({
      message: "Failed to generate invoice",
      error: error.message,
    });
  }
};

// NEW: Send invoice by email with PDF attachment
const sendInvoiceByEmail = async (req, res) => {
  try {
    const { invoiceData, customerEmail, customerName } = req.body;

    if (!invoiceData || !customerEmail) {
      return res.status(400).json({
        message: "Missing required fields: invoiceData and customerEmail",
      });
    }

    console.log("Sending invoice email to:", customerEmail);
    console.log("Invoice data received:", invoiceData);

    // Generate PDF buffer from invoice data
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // Send email with PDF attachment
    await sendInvoiceEmailWithPDF(
      customerEmail,
      customerName,
      invoiceData,
      pdfBuffer
    );

    // Optionally update booking record if bookingId is provided
    if (invoiceData.bookingId) {
      try {
        const booking = await Booking.findById(invoiceData.bookingId);
        if (booking) {
          booking.invoiceGenerated = true;
          booking.invoiceNumber = invoiceData.invoiceNumber;
          booking.invoiceSentAt = new Date();
          booking.lastInvoiceUpdate = new Date();
          await booking.save();
          console.log(
            `Updated booking ${invoiceData.bookingId} with invoice info`
          );
        }
      } catch (updateError) {
        console.warn("Failed to update booking record:", updateError);
        // Don't fail the whole operation if booking update fails
      }
    }

    res.status(200).json({
      message: "Invoice sent successfully",
      sentTo: customerEmail,
      invoiceNumber: invoiceData.invoiceNumber,
    });
  } catch (error) {
    console.error("Failed to send invoice email:", error);
    res.status(500).json({
      message: "Failed to send invoice",
      error: error.message,
    });
  }
};

// NEW: Delete booking
const deleteBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Store booking info for potential notification
    const bookingInfo = {
      bookingId: booking.bookingId,
      customerName: booking.customer?.personalInfo?.name,
      customerEmail: booking.customer?.personalInfo?.email,
      eventType: booking.customer?.eventDetails?.eventType,
      eventDate: booking.eventSchedule?.startDate,
    };

    await Booking.findByIdAndDelete(req.params.id);

    console.log(`Booking ${bookingInfo.bookingId} deleted successfully`);

    // Optionally send cancellation email to customer
    if (bookingInfo.customerEmail) {
      sendBookingDeletionEmail(bookingInfo).catch((emailError) => {
        console.error(
          "Failed to send deletion notification email:",
          emailError
        );
      });
    }

    res.status(200).json({
      message: "Booking deleted successfully",
      deletedBookingId: bookingInfo.bookingId,
    });
  } catch (error) {
    console.error("Delete booking error:", error);
    res.status(500).json({
      message: "Failed to delete booking",
      error: error.message,
    });
  }
};

// Generate PDF from invoice data
const generateInvoicePDF = async (invoiceData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      // Collect PDF data
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on("error", reject);

      // Add content to PDF
      generatePDFContent(doc, invoiceData);

      // Finalize the PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// Generate PDF content
const generatePDFContent = (doc, invoiceData) => {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 50;

  // Colors
  const primaryColor = "#4F46E5";
  const grayColor = "#6B7280";
  const darkColor = "#1F2937";

  // Header
  doc
    .fontSize(32)
    .fillColor(primaryColor)
    .text("INVOICE", margin, margin, { align: "left" });

  // Invoice details (top right)
  const headerY = margin;
  doc
    .fontSize(10)
    .fillColor(darkColor)
    .text(`Invoice #: ${invoiceData.invoiceNumber}`, pageWidth - 200, headerY)
    .text(
      `Issue Date: ${new Date(invoiceData.issueDate).toLocaleDateString()}`,
      pageWidth - 200,
      headerY + 15
    )
    .text(
      `Due Date: ${new Date(invoiceData.dueDate).toLocaleDateString()}`,
      pageWidth - 200,
      headerY + 30
    );

  // Company logo placeholder
  doc
    .rect(pageWidth - 130, headerY + 50, 80, 80)
    .fillColor("#E5E7EB")
    .fill();

  doc
    .fontSize(12)
    .fillColor("#9CA3AF")
    .text("LOGO", pageWidth - 110, headerY + 85);

  let currentY = headerY + 150;

  // From and To sections
  doc
    .fontSize(12)
    .fillColor(darkColor)
    .font("Helvetica-Bold")
    .text("From:", margin, currentY);

  doc
    .font("Helvetica")
    .fontSize(14)
    .text(invoiceData.company.name, margin, currentY + 20)
    .fontSize(10)
    .text(invoiceData.company.address, margin, currentY + 40)
    .text(
      `${invoiceData.company.city}, ${invoiceData.company.state}`,
      margin,
      currentY + 55
    )
    .text(invoiceData.company.country, margin, currentY + 70)
    .text(invoiceData.company.phone, margin, currentY + 90)
    .text(invoiceData.company.email, margin, currentY + 105);

  // Bill To section
  const billToX = pageWidth / 2 + 50;
  doc
    .fontSize(12)
    .fillColor(darkColor)
    .font("Helvetica-Bold")
    .text("Bill To:", billToX, currentY);

  doc
    .font("Helvetica")
    .fontSize(14)
    .text(invoiceData.customer.name, billToX, currentY + 20)
    .fontSize(10)
    .text(invoiceData.customer.email, billToX, currentY + 40)
    .text(invoiceData.customer.phone, billToX, currentY + 55)
    .text(invoiceData.customer.address, billToX, currentY + 75);

  currentY += 150;

  // Event Details Box
  doc
    .rect(margin, currentY, pageWidth - 2 * margin, 80)
    .fillColor("#F3F4F6")
    .fill();

  doc
    .fontSize(12)
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .text("Event Details", margin + 15, currentY + 15);

  const eventY = currentY + 35;
  const eventCol1 = margin + 15;
  const eventCol2 = pageWidth / 2 + 25;

  doc
    .fontSize(9)
    .fillColor(darkColor)
    .font("Helvetica")
    .text(`Type: ${invoiceData.event.type}`, eventCol1, eventY)
    .text(
      `Date: ${new Date(invoiceData.event.date).toLocaleDateString()}`,
      eventCol2,
      eventY
    )
    .text(`Time: ${invoiceData.event.time}`, eventCol1, eventY + 15)
    .text(`Guests: ${invoiceData.event.guests}`, eventCol2, eventY + 15)
    .text(`Location: ${invoiceData.event.location}`, eventCol1, eventY + 30, {
      width: pageWidth - 2 * margin - 30,
    });

  currentY += 100;

  // Services Table
  const allServices = [
    ...invoiceData.services,
    ...invoiceData.additionalServices.filter((s) => s.total > 0),
  ];

  if (allServices.length > 0) {
    // Table header
    doc
      .fontSize(12)
      .fillColor(primaryColor)
      .font("Helvetica-Bold")
      .text("Services", margin, currentY);

    currentY += 25;

    // Simple table layout
    allServices.forEach((service, index) => {
      doc
        .fontSize(10)
        .fillColor(darkColor)
        .font("Helvetica-Bold")
        .text(`${service.name} (Qty: ${service.quantity})`, margin, currentY)
        .font("Helvetica")
        .text(
          `₦${service.total.toLocaleString("en-NG", {
            minimumFractionDigits: 2,
          })}`,
          pageWidth - 150,
          currentY,
          { align: "right" }
        );

      if (service.description) {
        currentY += 15;
        doc
          .fontSize(8)
          .fillColor(grayColor)
          .text(service.description, margin, currentY, {
            width: pageWidth - 2 * margin - 150,
          });
      }

      currentY += 25;
    });
  }

  // Totals section
  currentY += 20;
  const totalsX = pageWidth - 300;

  doc
    .fontSize(10)
    .fillColor(darkColor)
    .font("Helvetica")
    .text("Subtotal:", totalsX, currentY)
    .text(
      `₦${invoiceData.subtotal.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
      })}`,
      totalsX + 150,
      currentY,
      { align: "right" }
    )

    .text(
      `Tax (${(invoiceData.taxRate * 100).toFixed(1)}%):`,
      totalsX,
      currentY + 20
    )
    .text(
      `₦${invoiceData.tax.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
      })}`,
      totalsX + 150,
      currentY + 20,
      { align: "right" }
    );

  // Total line
  doc
    .moveTo(totalsX, currentY + 35)
    .lineTo(totalsX + 250, currentY + 35)
    .strokeColor(darkColor)
    .lineWidth(2)
    .stroke();

  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("Total:", totalsX, currentY + 45)
    .text(
      `₦${invoiceData.total.toLocaleString("en-NG", {
        minimumFractionDigits: 2,
      })}`,
      totalsX + 150,
      currentY + 45,
      { align: "right" }
    );

  // Deposit info if required
  if (invoiceData.requiresDeposit) {
    doc
      .fontSize(11)
      .fillColor("#EA580C")
      .font("Helvetica-Bold")
      .text("Deposit Required (50%):", totalsX, currentY + 70)
      .text(
        `₦${invoiceData.depositAmount.toLocaleString("en-NG", {
          minimumFractionDigits: 2,
        })}`,
        totalsX + 150,
        currentY + 70,
        { align: "right" }
      );
  }

  currentY += 120;

  // Notes and Terms
  if (invoiceData.notes || invoiceData.terms) {
    if (invoiceData.notes) {
      doc
        .fontSize(12)
        .fillColor(primaryColor)
        .font("Helvetica-Bold")
        .text("Notes", margin, currentY);

      doc
        .fontSize(10)
        .fillColor(darkColor)
        .font("Helvetica")
        .text(invoiceData.notes, margin, currentY + 20, {
          width: pageWidth - 2 * margin,
        });

      currentY += 60;
    }

    if (invoiceData.terms) {
      doc
        .fontSize(12)
        .fillColor(primaryColor)
        .font("Helvetica-Bold")
        .text("Terms & Conditions", margin, currentY);

      doc
        .fontSize(9)
        .fillColor(grayColor)
        .font("Helvetica")
        .text(invoiceData.terms, margin, currentY + 20, {
          width: pageWidth - 2 * margin,
        });
    }
  }

  // Footer
  const footerY = pageHeight - 100;
  doc
    .fontSize(12)
    .fillColor(darkColor)
    .font("Helvetica-Bold")
    .text("Thank you for your business!", margin, footerY, {
      align: "center",
      width: pageWidth - 2 * margin,
    });

  doc
    .fontSize(8)
    .fillColor(grayColor)
    .font("Helvetica")
    .text(
      `Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
      margin,
      footerY + 20,
      { align: "center", width: pageWidth - 2 * margin }
    );
};

// Enhanced email sending function for invoices with PDF
const sendInvoiceEmailWithPDF = async (
  customerEmail,
  customerName,
  invoiceData,
  pdfBuffer
) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: customerEmail,
    subject: `💰 Invoice ${invoiceData.invoiceNumber} - Your Event Booking`,
    html: generateInvoiceEmailHTML(customerName, invoiceData),
    attachments: [
      {
        filename: `Invoice-${invoiceData.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  };

  await transporter.sendMail(mailOptions);
  console.log(`Invoice email with PDF sent to: ${customerEmail}`);
};

// Generate HTML content for invoice email with PDF attachment
const generateInvoiceEmailHTML = (customerName, invoiceData) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%); color: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 28px;">💰 Invoice Ready</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your event booking invoice is attached</p>
      </div>

      <!-- Greeting -->
      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
        <h2 style="color: #1F2937; margin-top: 0;">Hello ${customerName}! 👋</h2>
        <p style="margin: 0;">Thank you for choosing our services! Please find your invoice attached for your upcoming event booking.</p>
      </div>

      <!-- Invoice Summary -->
      <div style="background: white; border: 2px solid #E5E7EB; border-radius: 10px; padding: 25px; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h3 style="color: #4F46E5; margin-top: 0; display: flex; align-items: center;">
          📄 Invoice Summary
        </h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Invoice Number:</td>
            <td style="padding: 12px 0; font-weight: bold;">${
              invoiceData.invoiceNumber
            }</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Issue Date:</td>
            <td style="padding: 12px 0;">${new Date(
              invoiceData.issueDate
            ).toLocaleDateString()}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Due Date:</td>
            <td style="padding: 12px 0; color: #DC2626; font-weight: bold;">${new Date(
              invoiceData.dueDate
            ).toLocaleDateString()}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Event Type:</td>
            <td style="padding: 12px 0;">${invoiceData.event.type}</td>
          </tr>
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 12px 0; font-weight: bold; color: #6B7280;">Event Date:</td>
            <td style="padding: 12px 0;">${new Date(
              invoiceData.event.date
            ).toLocaleDateString()}</td>
          </tr>
          <tr style="background: #F0FDF4;">
            <td style="padding: 15px 0; font-weight: bold; color: #166534; font-size: 16px;">Total Amount:</td>
            <td style="padding: 15px 0; font-weight: bold; color: #059669; font-size: 20px;">₦${invoiceData.total.toLocaleString(
              "en-NG",
              { minimumFractionDigits: 2 }
            )}</td>
          </tr>
          ${
            invoiceData.requiresDeposit
              ? `
          <tr style="background: #FEF3C7;">
            <td style="padding: 12px 0; font-weight: bold; color: #92400E;">Deposit Required:</td>
            <td style="padding: 12px 0; font-weight: bold; color: #D97706;">₦${invoiceData.depositAmount.toLocaleString(
              "en-NG",
              { minimumFractionDigits: 2 }
            )}</td>
          </tr>
          `
              : ""
          }
        </table>
      </div>

      <!-- Payment Instructions -->
      <div style="background: #EFF6FF; border: 2px solid #DBEAFE; border-radius: 10px; padding: 25px; margin-bottom: 25px;">
        <h3 style="color: #1E40AF; margin-top: 0; display: flex; align-items: center;">
          💳 Payment Instructions
        </h3>
        <div style="color: #1E3A8A;">
          <p style="margin-bottom: 15px;"><strong>Payment Methods Accepted:</strong></p>
          <ul style="margin: 0; padding-left: 20px;">
            <li style="margin-bottom: 8px;">Bank Transfer (Preferred)</li>
            <li style="margin-bottom: 8px;">Online Payment via our portal</li>
            <li style="margin-bottom: 8px;">Cash payment (upon delivery)</li>
            <li style="margin-bottom: 8px;">Mobile money transfers</li>
          </ul>
          <div style="background: white; padding: 15px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #3B82F6;">
            <p style="margin: 0; font-weight: bold; color: #1E40AF;">Bank Details:</p>
            <p style="margin: 5px 0 0 0; font-size: 14px;">
              Account Name: ${invoiceData.company.name}<br>
              Bank: [Your Bank Name]<br>
              Account Number: [Your Account Number]<br>
              Reference: ${invoiceData.invoiceNumber}
            </p>
          </div>
        </div>
      </div>

      <!-- Important Notes -->
      <div style="background: #FEF2F2; border: 2px solid #FECACA; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
        <h3 style="color: #DC2626; margin-top: 0;">⚠️ Important Notes</h3>
        <ul style="color: #7F1D1D; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 8px;">Payment is due by <strong>${new Date(
            invoiceData.dueDate
          ).toLocaleDateString()}</strong></li>
          <li style="margin-bottom: 8px;">Late payments may incur additional fees</li>
          ${
            invoiceData.requiresDeposit
              ? '<li style="margin-bottom: 8px;">A deposit is required to secure your booking</li>'
              : ""
          }
          <li style="margin-bottom: 8px;">Please quote the invoice number when making payment</li>
          <li style="margin-bottom: 8px;">Contact us immediately if you have any questions</li>
        </ul>
      </div>

      <!-- Next Steps -->
      <div style="background: #F0FDF4; border: 2px solid #BBF7D0; border-radius: 10px; padding: 20px; margin-bottom: 25px;">
        <h3 style="color: #15803D; margin-top: 0;">📋 What's Next?</h3>
        <ol style="color: #166534; padding-left: 20px; margin: 0;">
          <li style="margin-bottom: 10px;">Review the attached invoice carefully</li>
          <li style="margin-bottom: 10px;">Make payment by the due date specified</li>
          <li style="margin-bottom: 10px;">Send us payment confirmation</li>
          <li style="margin-bottom: 10px;">We'll confirm and schedule your event setup</li>
          <li style="margin-bottom: 10px;">Enjoy your amazing event! 🎉</li>
        </ol>
      </div>

      <!-- Contact Information -->
      <div style="background: #F8FAFC; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 20px;">
        <h3 style="color: #374151; margin-top: 0;">📞 Need Help?</h3>
        <p style="margin: 10px 0; color: #6B7280;">Our team is here to assist you with any questions about your invoice or booking.</p>
        <div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-top: 15px;">
          <a href="mailto:${
            invoiceData.company.email
          }" style="color: #4F46E5; text-decoration: none; font-weight: bold;">
            📧 ${invoiceData.company.email}
          </a>
          <a href="tel:${
            invoiceData.company.phone
          }" style="color: #4F46E5; text-decoration: none; font-weight: bold;">
            📱 ${invoiceData.company.phone}
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align: center; padding: 20px; background: #F8FAFC; border-radius: 8px; border-top: 3px solid #4F46E5;">
        <p style="margin: 0; color: #6B7280; font-size: 16px; font-weight: bold;">
          Thank you for choosing ${invoiceData.company.name}!
        </p>
        <p style="margin: 10px 0 0 0; color: #9CA3AF; font-size: 12px;">
          This email was sent automatically. Please save this email and the attached invoice for your records.
        </p>
        <p style="margin: 5px 0 0 0; color: #9CA3AF; font-size: 12px;">
          Invoice generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
        </p>
      </div>
    </body>
    </html>
  `;
};

// Send booking deletion notification email
const sendBookingDeletionEmail = async (bookingInfo) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: bookingInfo.customerEmail,
    subject: `❌ Booking Cancelled - ${bookingInfo.bookingId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Booking Cancelled</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #DC2626 0%, #EF4444 100%); color: white; padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
          <h1 style="margin: 0; font-size: 28px;">❌ Booking Cancelled</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">We regret to inform you</p>
        </div>

        <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="color: #1F2937; margin-top: 0;">Hello ${
            bookingInfo.customerName
          }! 👋</h2>
          <p>We regret to inform you that your booking has been cancelled.</p>
        </div>

        <div style="background: white; border: 2px solid #E5E7EB; border-radius: 8px; padding: 25px; margin-bottom: 25px;">
          <h3 style="color: #DC2626; margin-top: 0;">📋 Cancelled Booking Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Booking ID:</td>
              <td style="padding: 8px 0;">${bookingInfo.bookingId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Event Type:</td>
              <td style="padding: 8px 0;">${bookingInfo.eventType || "N/A"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Event Date:</td>
              <td style="padding: 8px 0;">${
                bookingInfo.eventDate
                  ? new Date(bookingInfo.eventDate).toLocaleDateString()
                  : "N/A"
              }</td>
            </tr>
          </table>
        </div>

        <div style="background: #EFF6FF; border: 2px solid #DBEAFE; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
          <h3 style="color: #1E40AF; margin-top: 0;">💬 Need Assistance?</h3>
          <p>If you have any questions about this cancellation or would like to discuss rebooking, please don't hesitate to contact us.</p>
        </div>

        <div style="text-align: center; padding: 20px; background: #F8FAFC; border-radius: 8px;">
          <p style="margin: 0; color: #6B7280; font-size: 14px;">
            Questions? Contact us at <a href="mailto:${
              process.env.EMAIL_USER
            }" style="color: #4F46E5;">${process.env.EMAIL_USER}</a>
          </p>
        </div>
      </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
  console.log(
    `Deletion notification email sent to: ${bookingInfo.customerEmail}`
  );
};

// All your existing email functions remain the same...
const sendBookingConfirmationEmail = async (booking) => {
  const customerEmail = booking.customer.personalInfo.email;
  const customerName = booking.customer.personalInfo.name;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: customerEmail,
    subject: `Booking Confirmation - ${booking.bookingId}`,
    html: generateCustomerConfirmationHTML(booking, customerName),
  };

  await transporter.sendMail(mailOptions);
  console.log(`Confirmation email sent to customer: ${customerEmail}`);
};

const sendAdminNotificationEmail = async (booking) => {
  const adminEmailPromises = ADMIN_EMAILS.map((adminEmail) => {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: adminEmail,
      subject: `🚨 NEW BOOKING ALERT - ${booking.bookingId}`,
      html: generateAdminNotificationHTML(booking),
    };

    return transporter.sendMail(mailOptions);
  });

  await Promise.all(adminEmailPromises);
  console.log(`Admin notification emails sent to: ${ADMIN_EMAILS.join(", ")}`);
};

const sendStatusUpdateEmail = async (booking, oldStatus, newStatus) => {
  const customerEmail = booking.customer.personalInfo.email;
  const customerName = booking.customer.personalInfo.name;

  let subject, message, color;

  switch (newStatus) {
    case "confirmed":
      subject = `✅ Booking Confirmed - ${booking.bookingId}`;
      message = "Great news! Your booking has been confirmed.";
      color = "#10B981";
      break;
    case "cancelled":
      subject = `❌ Booking Cancelled - ${booking.bookingId}`;
      message = "We regret to inform you that your booking has been cancelled.";
      color = "#EF4444";
      break;
    default:
      subject = `📋 Booking Update - ${booking.bookingId}`;
      message = `Your booking status has been updated to: ${newStatus}`;
      color = "#F59E0B";
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: customerEmail,
    subject: subject,
    html: generateStatusUpdateHTML(
      booking,
      customerName,
      message,
      color,
      newStatus
    ),
  };

  await transporter.sendMail(mailOptions);
  console.log(`Status update email sent to: ${customerEmail}`);
};

const sendInvoiceEmail = async (booking, invoiceData) => {
  const customerEmail = booking.customer.personalInfo.email;
  const customerName = booking.customer.personalInfo.name;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: customerEmail,
    subject: `💰 Invoice ${invoiceData.invoiceNumber} - ${booking.bookingId}`,
    html: generateInvoiceHTML(booking, customerName, invoiceData),
  };

  await transporter.sendMail(mailOptions);
  console.log(`Invoice email sent to: ${customerEmail}`);
};

// HTML Email Templates (keeping your existing ones)
const generateCustomerConfirmationHTML = (booking, customerName) => {
  const services = booking.services || [];
  const servicesHTML = services
    .map(
      (service) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #E5E7EB;">${
        service.name
      }</td>
      <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: center;">${
        service.quantity
      }</td>
      <td style="padding: 8px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(
        service.subtotal
      )}</td>
    </tr>
  `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Confirmation</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 28px;">🎉 Booking Confirmed!</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Thank you for choosing our services</p>
      </div>

      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #1F2937; margin-top: 0;">Hello ${customerName}! 👋</h2>
        <p>We've received your event booking request and our team is excited to help make your event spectacular!</p>
        <p><strong>Your booking is currently pending confirmation.</strong> Our team will review the details and get back to you within 24 hours.</p>
      </div>

      <div style="background: white; border: 2px solid #E5E7EB; border-radius: 8px; padding: 25px; margin-bottom: 25px;">
        <h3 style="color: #4F46E5; margin-top: 0; display: flex; align-items: center;">
          📋 Booking Details
        </h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Booking ID:</td>
            <td style="padding: 8px 0;">${booking.bookingId}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Event Type:</td>
            <td style="padding: 8px 0;">${
              booking.customer.eventDetails.eventType
            }</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Date & Time:</td>
            <td style="padding: 8px 0;">${
              booking.eventSchedule.formatted?.fullSchedule
            }</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Location:</td>
            <td style="padding: 8px 0;">${
              booking.customer.eventDetails.location
            }</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Guests:</td>
            <td style="padding: 8px 0;">${
              booking.customer.eventDetails.numberOfGuests
            } people</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Total Amount:</td>
            <td style="padding: 8px 0; font-weight: bold; color: #10B981; font-size: 18px;">${
              booking.pricing?.formatted?.total
            }</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Status:</td>
            <td style="padding: 8px 0;"><span style="background: #FEF3C7; color: #92400E; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">PENDING CONFIRMATION</span></td>
          </tr>
        </table>
      </div>

      ${
        services.length > 0
          ? `
        <div style="background: white; border: 2px solid #E5E7EB; border-radius: 8px; padding: 25px; margin-bottom: 25px;">
          <h3 style="color: #4F46E5; margin-top: 0;">🛍️ Selected Services</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #F9FAFB;">
                <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #E5E7EB;">Service</th>
                <th style="padding: 12px 8px; text-align: center; border-bottom: 2px solid #E5E7EB;">Qty</th>
                <th style="padding: 12px 8px; text-align: right; border-bottom: 2px solid #E5E7EB;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${servicesHTML}
            </tbody>
          </table>
        </div>
      `
          : ""
      }

      <div style="background: #EFF6FF; border: 2px solid #DBEAFE; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
        <h3 style="color: #1E40AF; margin-top: 0;">📞 What happens next?</h3>
        <ul style="color: #1F2937; padding-left: 20px;">
          <li style="margin-bottom: 8px;">Our team will review your booking within 24 hours</li>
          <li style="margin-bottom: 8px;">We'll confirm availability and send you a detailed invoice</li>
          <li style="margin-bottom: 8px;">Once confirmed, we'll coordinate delivery and setup details</li>
          <li style="margin-bottom: 8px;">You'll receive updates via email and phone</li>
        </ul>
      </div>

      <div style="background: #FEF2F2; border: 2px solid #FECACA; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
        <h3 style="color: #DC2626; margin-top: 0;">⚠️ Important Notes</h3>
        <ul style="color: #7F1D1D; padding-left: 20px;">
          <li style="margin-bottom: 8px;">A refundable deposit will be required for equipment safety</li>
          <li style="margin-bottom: 8px;">Final pricing may vary based on specific requirements</li>
          <li style="margin-bottom: 8px;">Cancellation policy applies as per terms and conditions</li>
        </ul>
      </div>

      <div style="text-align: center; padding: 20px; background: #F8FAFC; border-radius: 8px;">
        <p style="margin: 0; color: #6B7280; font-size: 14px;">
          Questions? Contact us at <a href="mailto:${
            process.env.EMAIL_USER
          }" style="color: #4F46E5;">${process.env.EMAIL_USER}</a>
        </p>
        <p style="margin: 10px 0 0 0; color: #9CA3AF; font-size: 12px;">
          This email was sent automatically. Please do not reply to this email.
        </p>
      </div>
    </body>
    </html>
  `;
};

// Continue with your existing generateAdminNotificationHTML, generateStatusUpdateHTML, and generateInvoiceHTML functions...
// (keeping them as they were)
// Add this at the end of your bookingController.js file before module.exports

// Helper function to format date time range for emails
const formatDateTimeRange = (eventSchedule) => {
  if (!eventSchedule) return "N/A";

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return "";
    const [hours, minutes] = timeString.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const startDate = formatDate(eventSchedule.startDate);
  const endDate = formatDate(eventSchedule.endDate);
  const startTime = formatTime(eventSchedule.startTime);
  const endTime = formatTime(eventSchedule.endTime);

  if (!eventSchedule.isMultiDay) {
    return `${startDate} • ${startTime} - ${endTime}`;
  } else {
    return `${startDate} ${startTime} - ${endDate} ${endTime}`;
  }
};

// Complete generateStatusUpdateHTML function
const generateStatusUpdateHTML = (
  booking,
  customerName,
  message,
  color,
  newStatus
) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Status Update</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, ${color} 0%, ${color}CC 100%); color: white; padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 28px;">📋 Booking Status Update</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your booking status has been updated</p>
      </div>

      <div style="background: #F8FAFC; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #1F2937; margin-top: 0;">Hello ${customerName}! 👋</h2>
        <p style="font-size: 16px;">${message}</p>
      </div>

      <div style="background: white; border: 2px solid #E5E7EB; border-radius: 8px; padding: 25px; margin-bottom: 25px;">
        <h3 style="color: #4F46E5; margin-top: 0;">📋 Booking Details</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Booking ID:</td>
            <td style="padding: 8px 0;">${booking.bookingId}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Event Type:</td>
            <td style="padding: 8px 0;">${
              booking.customer?.eventDetails?.eventType || "N/A"
            }</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Date & Time:</td>
            <td style="padding: 8px 0;">${formatDateTimeRange(
              booking.eventSchedule
            )}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Status:</td>
            <td style="padding: 8px 0;"><span style="background: ${color}20; color: ${color}; padding: 6px 12px; border-radius: 20px; font-size: 14px; font-weight: bold;">${newStatus.toUpperCase()}</span></td>
          </tr>
        </table>
      </div>

      <div style="text-align: center; padding: 20px; background: #F8FAFC; border-radius: 8px;">
        <p style="margin: 0; color: #6B7280; font-size: 14px;">
          Questions? Contact us at <a href="mailto:${
            process.env.EMAIL_USER
          }" style="color: #4F46E5;">${process.env.EMAIL_USER}</a>
        </p>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  getBookings,
  createBooking,
  getBookingById,
  updateBookingStatus,
  updateBookingPayment,
  updateBookingItems,
  generateInvoice,
  sendInvoiceByEmail, // NEW: Add this export
  deleteBooking, // NEW: Add this export
};
