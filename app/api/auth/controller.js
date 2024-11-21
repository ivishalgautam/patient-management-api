"use strict";

import hash from "../../lib/encryption/index.js";
import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import authToken from "../../helpers/auth.js";
import { userSchema } from "../../validation-schemas/user.schema.js";
import { patientSchema } from "../../validation-schemas/patient.schema.js";
import { doctorSchema } from "../../validation-schemas/doctor.schema.js";
import { loginSchema } from "../../validation-schemas/login.schema.js";

const verifyUserCredentials = async (req, res) => {
  const validateBody = loginSchema.parse(req.body);

  try {
    let userData = await table.UserModel.getByUsername(req);
    if (!userData) {
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
      user_data: userData,
    });
  } catch (error) {
    throw error;
  }
};

const createNewUser = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const validateUserData = userSchema.parse(req.body);

    const data = await table.UserModel.create(req, { transaction });
    if (!data)
      return res.code(400).send({ message: "Error while registering." });

    if (data.role === "patient") {
      const validatePatientData = patientSchema.parse(req.body);
      await table.PatientModel.create(req, data.id, { transaction });
    }

    if (data.role === "doctor") {
      const validateDoctorData = doctorSchema.parse(req.body);
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
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const verifyRefreshToken = async (req, res) => {
  try {
    return authToken.verifyRefreshToken(req, res);
  } catch (error) {
    throw error;
  }
};

export default {
  verifyUserCredentials: verifyUserCredentials,
  createNewUser: createNewUser,
  verifyRefreshToken: verifyRefreshToken,
};
