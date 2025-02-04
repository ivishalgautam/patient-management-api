import nodemailer from "nodemailer";

export const sendCredentials = async (template, mailTo) => {
  // Create a transporter object using SMTP transport
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_SERVER,
    port: process.env.SMTP_PORT,
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_EMAIL, // Your email
      pass: process.env.SMTP_PASSWORD, // Your password
    },
  });

  // Define email options
  const mailOptions = {
    from: process.env.SMTP_EMAIL, // Sender address
    to: mailTo, // List of receivers
    subject: "Credential Details For Onlineparts.shop", // Subject line
    html: template, // Rendered email template
  };

  // Send email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
    } else {
      console.log("Email sent:", info.response);
    }
  });
};
