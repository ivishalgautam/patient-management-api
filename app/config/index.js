"use strict";
import "dotenv/config";

// Set the NODE_ENV to 'development' by default
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.PORT = process.env.PORT || 3001;

const config = {
  port: parseInt(process.env.PORT1, 10),
  // postgres creds
  pg_database_name: process.env.DRDIPTI_PG_DATABASE_NAME,
  pg_username: process.env.PG_USERNAME,
  pg_password: process.env.PG_PASSWORD,
  pg_host: process.env.PG_HOST,
  pg_dialect: process.env.DB_DIALECT,
  pg_port: 5432,

  // jwt secret key
  jwt_secret: process.env.JWT_SECRET,
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
  smtp_from_email: process.env.SMTP_EMAIL,
  smtp_port: parseInt(process.env.SMTP_PORT),
  smtp_host: process.env.SMTP_SERVER,
  smtp_password: process.env.SMTP_PASSWORD,

  clinic_id: process.env.CLINIC_ID,
  doctor_id: process.env.DOCTOR_ID,
  doctor_user_id: process.env.DOCTOR_USER_ID,
  procedure_id: process.env.PROCEDURE_ID,

  // waffly
  waffly_license: process.env.WAFFLY_LICENSE,
  waffly_api_key: process.env.WAFFLY_API_KEY,
  waffly_template_booking_confirm: process.env.WAFFLY_TEMPLATE_BOOKING_CONFIRM,
  waffly_template_24_hours_before_appointment:
    process.env.WAFFLY_TEMPLATE_24_HOURS_BEFORE_APPOINTMENT,
  waffly_template_2_hrs_before_appointment:
    process.env.WAFFLY_TEMPLATE_2_HRS_BEFORE_APPOINTMENT,
  waffly_template_1_hr_after_appointment:
    process.env.WAFFLY_TEMPLATE_1_HR_AFTER_APPOINTMENT,
  waffly_template_review_mesaage: process.env.WAFFLY_TEMPLATE_REVIEW_MESAAGE,
};

export default config;
