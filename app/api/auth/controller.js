"use strict";

import { beginTransaction } from "../../db/transaction.js";
import hash from "../../lib/encryption/index.js";
import table from "../../db/models.js";
import authToken from "../../helpers/auth.js";
import { userSchema } from "../../validation-schemas/user.schema.js";
import { patientSchema } from "../../validation-schemas/patient.schema.js";
import { doctorSchema } from "../../validation-schemas/doctor.schema.js";
import { loginSchema } from "../../validation-schemas/login.schema.js";
import { credentialGenerator } from "../../helpers/credential-generator.js";
import { resolvePracticeForPatient } from "../../lib/practice.js";

const verifyUserCredentials = async (req, res) => {
  const validateBody = loginSchema.parse(req.body);
  // Use the validated values (defaults, coercions) from here on.
  Object.assign(req.body, validateBody);
  const role = req.body.role;

  let userData = await table.UserModel.getByUsername(req);
  if (!userData || (role && role !== userData.role)) {
    return res.code(404).send({ status: false, message: "User not found!" });
  }

  if (!userData.is_active) {
    return res.code(400).send({
      status: false,
      message: "User not active. Please contact administrator!",
    });
  }
  let passwordIsValid = hash.verify(req.body.password, userData.password);
  if (!passwordIsValid) {
    return res
      .code(400)
      .send({ status: false, message: "Invalid credentials" });
  }

  const [jwtToken, expiresIn] = authToken.generateAccessToken(userData);
  const refreshToken = authToken.generateRefreshToken(userData);

  return res.send({
    status: true,
    token: jwtToken,
    expire_time: Date.now() + expiresIn,
    refresh_token: refreshToken,
    user_data: authToken.sanitizeUser(userData),
  });
};

const createNewUser = async (req, res) => {
  const transaction = await beginTransaction(req);
  let generatedPassword;

  try {
    const validateUserData = userSchema.parse(req.body);
    // Use the validated values (defaults, coercions) from here on.
    Object.assign(req.body, validateUserData);
    // Public self-registration may only create patients.
    if (validateUserData.role !== "patient") {
      await transaction.rollback();
      return res.code(403).send({
        status: false,
        message: "Only patients can self-register.",
      });
    }

    if (validateUserData.role === "patient") {
      const patientNumber = await table.PatientSequenceModel.next({ transaction });

      const { username, password } = credentialGenerator(
        patientNumber,
        validateUserData.fullname,
        validateUserData.mobile_number,
      );
      req.body.username = username;
      req.body.password = password;
      generatedPassword = password;
    }

    const data = await table.UserModel.create(req, { transaction });
    if (!data)
      return res.code(400).send({ message: "Error while registering." });

    if (data.role === "patient") {
      const validatePatientData = patientSchema.parse(req.body);
      // Use the validated values (defaults, coercions) from here on.
      Object.assign(req.body, validatePatientData);
      const practiceId = await resolvePracticeForPatient({
        clinicId: req.body.clinic_id,
        transaction,
      });
      await table.PatientModel.create(req, data.id, { transaction, practiceId });
    }

    if (data.role === "doctor") {
      const validateDoctorData = doctorSchema.parse(req.body);
      // Use the validated values (defaults, coercions) from here on.
      Object.assign(req.body, validateDoctorData);
      await table.DoctorModel.create(req, data.id, { transaction });
    }

    const [jwtToken, expiresIn] = authToken.generateAccessToken(data);
    const refreshToken = authToken.generateRefreshToken(data);

    await transaction.commit();
    return res.send({
      status: true,
      token: jwtToken,
      expire_time: Date.now() + expiresIn,
      refresh_token: refreshToken,
      user_data: data,
      // Shown once; the patient logs in later with username + this password.
      temporary_password: generatedPassword,
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const verifyRefreshToken = async (req, res) => {
  return authToken.verifyRefreshToken(req, res);
};

export default {
  verifyUserCredentials: verifyUserCredentials,
  createNewUser: createNewUser,
  verifyRefreshToken: verifyRefreshToken,
};
