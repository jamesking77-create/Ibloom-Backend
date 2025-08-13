// utils/pdfGenerator.js
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate a PDF quote document
 * @param {Object} quote - The quote object from database
 * @returns {Buffer} - PDF buffer
 */
const generateQuotePDF = async (quote) => {
  return new Promise((resolve, reject) => {
    try {
      // Create a new PDF document
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Quote ${quote.quoteId}`,
          Author: 'Your Company Name',
          Subject: 'Service Quote',
          Keywords: 'quote, service, pricing'
        }
      });

      // Buffer to store PDF data
      const buffers = [];
      
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Company header
      addCompanyHeader(doc);
      
      // Quote information
      addQuoteInfo(doc, quote);
      
      // Customer information
      addCustomerInfo(doc, quote);
      
      // Items/Services table
      addItemsTable(doc, quote);
      
      // Pricing summary
      addPricingSummary(doc, quote);
      
      // Terms and conditions
      addTermsAndConditions(doc, quote);
      
      // Footer
      addFooter(doc);

      // Finalize the PDF
      doc.end();

    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Add company header to PDF
 */
const addCompanyHeader = (doc) => {
  // Company logo (if you have one)
  // doc.image('path/to/logo.png', 50, 45, { width: 100 });
  
  // Company name and details
  doc.fontSize(24)
     .font('Helvetica-Bold')
     .fillColor('#2c3e50')
     .text('Your Company Name', 50, 50);
  
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#7f8c8d')
     .text('123 Business Street', 50, 80)
     .text('City, State 12345', 50, 92)
     .text('Phone: (555) 123-4567', 50, 104)
     .text('Email: info@yourcompany.com', 50, 116)
     .text('Website: www.yourcompany.com', 50, 128);

  // Quote title
  doc.fontSize(20)
     .font('Helvetica-Bold')
     .fillColor('#2c3e50')
     .text('SERVICE QUOTE', 400, 50, { align: 'right' });

  // Add a horizontal line
  doc.strokeColor('#bdc3c7')
     .lineWidth(1)
     .moveTo(50, 150)
     .lineTo(545, 150)
     .stroke();
};

/**
 * Add quote information section
 */
const addQuoteInfo = (doc, quote) => {
  const startY = 170;
  
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .fillColor('#2c3e50')
     .text('Quote Information', 50, startY);
  
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#34495e')
     .text(`Quote ID: ${quote.quoteId}`, 50, startY + 20)
     .text(`Date: ${new Date(quote.createdAt).toLocaleDateString()}`, 50, startY + 35)
     .text(`Status: ${quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}`, 50, startY + 50)
     .text(`Category: ${quote.categoryName}`, 50, startY + 65);

  if (quote.response && quote.response.validUntil) {
    doc.text(`Valid Until: ${new Date(quote.response.validUntil).toLocaleDateString()}`, 50, startY + 80);
  }
};

/**
 * Add customer information section
 */
const addCustomerInfo = (doc, quote) => {
  const startY = 170;
  const customer = quote.customer;
  
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .fillColor('#2c3e50')
     .text('Customer Information', 300, startY);
  
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#34495e')
     .text(`Name: ${customer.name}`, 300, startY + 20)
     .text(`Email: ${customer.email}`, 300, startY + 35)
     .text(`Phone: ${customer.phone}`, 300, startY + 50);

  if (customer.company) {
    doc.text(`Company: ${customer.company}`, 300, startY + 65);
  }

  if (customer.eventType) {
    doc.text(`Event Type: ${customer.eventType}`, 300, startY + 80);
  }

  if (customer.eventDate) {
    doc.text(`Event Date: ${new Date(customer.eventDate).toLocaleDateString()}`, 300, startY + 95);
  }

  if (customer.guestCount) {
    doc.text(`Guest Count: ${customer.guestCount}`, 300, startY + 110);
  }
};

/**
 * Add items/services table
 */
const addItemsTable = (doc, quote) => {
  const startY = 300;
  let currentY = startY;

  // Table header
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .fillColor('#2c3e50')
     .text('Items/Services', 50, currentY);

  currentY += 25;

  // Table headers
  const headers = ['Description', 'Qty', 'Unit Price', 'Total'];
  const columnWidths = [280, 60, 80, 80];
  const columnX = [50, 330, 390, 470];

  // Header background
  doc.rect(50, currentY, 495, 20)
     .fillColor('#ecf0f1')
     .fill();

  // Header text
  doc.fontSize(10)
     .font('Helvetica-Bold')
     .fillColor('#2c3e50');

  headers.forEach((header, i) => {
    doc.text(header, columnX[i], currentY + 6, { width: columnWidths[i], align: 'left' });
  });

  currentY += 20;

  // Table rows
  doc.font('Helvetica')
     .fillColor('#34495e');

  quote.items.forEach((item, index) => {
    const rowY = currentY + (index * 25);
    
    // Alternate row background
    if (index % 2 === 0) {
      doc.rect(50, rowY, 495, 25)
         .fillColor('#f8f9fa')
         .fill();
    }

    doc.fontSize(9)
       .fillColor('#34495e')
       .text(item.name, columnX[0], rowY + 8, { width: columnWidths[0] })
       .text(item.quantity.toString(), columnX[1], rowY + 8, { width: columnWidths[1], align: 'center' })
       .text(`$${(item.unitPrice || 0).toFixed(2)}`, columnX[2], rowY + 8, { width: columnWidths[2], align: 'right' })
       .text(`$${(item.totalPrice || 0).toFixed(2)}`, columnX[3], rowY + 8, { width: columnWidths[3], align: 'right' });

    if (item.description) {
      doc.fontSize(8)
         .fillColor('#7f8c8d')
         .text(item.description, columnX[0], rowY + 18, { width: columnWidths[0] });
    }
  });

  return currentY + (quote.items.length * 25) + 20;
};

/**
 * Add pricing summary
 */
const addPricingSummary = (doc, quote) => {
  if (!quote.response) return;

  const response = quote.response;
  const startY = 500; // Adjust based on table height
  
  // Summary box
  doc.rect(350, startY, 195, 120)
     .strokeColor('#bdc3c7')
     .stroke();

  doc.fontSize(12)
     .font('Helvetica-Bold')
     .fillColor('#2c3e50')
     .text('Quote Summary', 360, startY + 10);

  const summaryY = startY + 35;
  doc.fontSize(10)
     .font('Helvetica')
     .fillColor('#34495e');

  // Subtotal
  doc.text('Subtotal:', 360, summaryY)
     .text(`$${response.subtotal.toFixed(2)}`, 480, summaryY, { align: 'right' });

  // Discount (if applicable)
  if (response.discount > 0) {
    doc.text('Discount:', 360, summaryY + 15)
       .text(`-$${response.discount.toFixed(2)}`, 480, summaryY + 15, { align: 'right' });
  }

  // Delivery fee (if applicable)
  if (response.deliveryFee > 0) {
    doc.text('Delivery Fee:', 360, summaryY + 30)
       .text(`$${response.deliveryFee.toFixed(2)}`, 480, summaryY + 30, { align: 'right' });
  }

  // Setup fee (if applicable)
  if (response.setupFee > 0) {
    doc.text('Setup Fee:', 360, summaryY + 45)
       .text(`$${response.setupFee.toFixed(2)}`, 480, summaryY + 45, { align: 'right' });
  }

  // Tax (if applicable)
  if (response.tax > 0) {
    doc.text('Tax:', 360, summaryY + 60)
       .text(`$${response.tax.toFixed(2)}`, 480, summaryY + 60, { align: 'right' });
  }

  // Total line
  doc.strokeColor('#2c3e50')
     .lineWidth(1)
     .moveTo(360, summaryY + 80)
     .lineTo(535, summaryY + 80)
     .stroke();

  // Final total
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .fillColor('#27ae60')
     .text('TOTAL:', 360, summaryY + 90)
     .text(`$${response.finalTotal.toFixed(2)}`, 480, summaryY + 90, { align: 'right' });
};

/**
 * Add terms and conditions
 */
const addTermsAndConditions = (doc, quote) => {
  const startY = 650;
  
  doc.fontSize(12)
     .font('Helvetica-Bold')
     .fillColor('#2c3e50')
     .text('Terms & Conditions', 50, startY);

  let terms = '';
  if (quote.response && quote.response.terms) {
    terms = quote.response.terms;
  } else {
    terms = `• This quote is valid for 30 days from the date issued.
• A 50% deposit is required to secure your booking.
• Final payment is due on the day of service.
• Cancellations made less than 48 hours before the event may incur charges.
• Prices are subject to change without notice.
• Additional charges may apply for changes made after confirmation.`;
  }

  doc.fontSize(9)
     .font('Helvetica')
     .fillColor('#34495e')
     .text(terms, 50, startY + 20, { width: 495, lineGap: 2 });

  // Custom message from response
  if (quote.response && quote.response.message) {
    doc.fontSize(10)
       .font('Helvetica-Italic')
       .fillColor('#7f8c8d')
       .text('Additional Notes:', 50, startY + 100)
       .text(quote.response.message, 50, startY + 115, { width: 495 });
  }
};

/**
 * Add footer
 */
const addFooter = (doc) => {
  const footerY = 750;
  
  doc.fontSize(8)
     .font('Helvetica')
     .fillColor('#95a5a6')
     .text('Thank you for choosing our services!', 50, footerY, { align: 'center', width: 495 })
     .text('For questions about this quote, please contact us using the information above.', 50, footerY + 12, { align: 'center', width: 495 });

  // Page number (if needed for multi-page documents)
  doc.text('Page 1', 50, footerY + 30, { align: 'center', width: 495 });
};

/**
 * Save PDF to file system (optional)
 * @param {Buffer} pdfBuffer - PDF buffer
 * @param {string} filename - File name
 * @returns {Promise<string>} - File path
 */
const savePDFToFile = async (pdfBuffer, filename) => {
  const uploadsDir = path.join(__dirname, '../uploads/quotes');
  
  // Ensure directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const filePath = path.join(uploadsDir, filename);
  
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, pdfBuffer, (err) => {
      if (err) reject(err);
      else resolve(filePath);
    });
  });
};

/**
 * Generate and save quote PDF
 * @param {Object} quote - Quote object
 * @param {boolean} saveToFile - Whether to save to file system
 * @returns {Object} - PDF buffer and file path (if saved)
 */
const generateAndSaveQuotePDF = async (quote, saveToFile = false) => {
  try {
    const pdfBuffer = await generateQuotePDF(quote);
    
    let filePath = null;
    if (saveToFile) {
      const filename = `quote-${quote.quoteId}-${Date.now()}.pdf`;
      filePath = await savePDFToFile(pdfBuffer, filename);
    }

    return {
      buffer: pdfBuffer,
      filePath: filePath,
      filename: `quote-${quote.quoteId}.pdf`
    };
    
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error('Failed to generate PDF: ' + error.message);
  }
};

module.exports = {
  generateQuotePDF,
  savePDFToFile,
  generateAndSaveQuotePDF
};