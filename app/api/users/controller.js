"use strict";

import table from "../../db/models.js";
import { sequelize } from "../../db/postgres.js";
import hash from "../../lib/encryption/index.js";
import { doctorSchema } from "../../validation-schemas/doctor.schema.js";
import { patientSchema } from "../../validation-schemas/patient.schema.js";
import { userSchema } from "../../validation-schemas/user.schema.js";

const create = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { role } = req.user_data;
    const validateUserData = userSchema.parse(req.body);

    const data = await table.UserModel.create(req, { transaction });
    if (!data)
      return res.code(400).send({ message: "Error while registering." });

    if (data.role === "doctor") {
      const validateDoctorData = doctorSchema.parse(req.body);
      await table.DoctorModel.create(req, data.id, { transaction });
    }

    if (data.role === "patient") {
      const validatePatientData = patientSchema.parse(req.body);
      const patient = await table.PatientModel.create(req, data.id, {
        transaction,
      });

      if (role === "doctor") {
        const drRecord = await table.DoctorModel.getByUserId(req);
        await table.DoctorPatientMapModel.create(drRecord.id, patient.id, {
          transaction,
        });
      }
      if (role === "staff") {
        await table.ClinicPatientMapModel.create(
          patient.id,
          req.body.clinic_id,
          {
            transaction,
          }
        );
      }
    }

    if (data.role === "staff") {
      let drRecord = null;

      if (role === "doctor")
        drRecord = await table.DoctorModel.getByUserId(req);
      if (role === "admin")
        drRecord = await table.DoctorModel.getById(0, req.body.doctor_id);

      if (!drRecord)
        return res
          .code(404)
          .send({ status: false, message: "Doctor not found." });

      await table.StaffModel.create(drRecord.id, data.id, {
        transaction,
      });
    }

    await transaction.commit();
    return res.send({
      status: true,
      message: "User created",
      user: data,
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const update = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const record = await table.UserModel.getByPk(req);
    if (!record) {
      return res.code(404).send({ status: false, message: "User not exists" });
    }

    const user = await table.UserModel.update(req, 0, { transaction });
    if (user.role === "doctor") {
      const doctor = await table.DoctorModel.updateByUserId(req, user.id, {
        transaction,
      });
    }
    if (user.role === "patient") {
      const patient = await table.PatientModel.updateByUserId(req, user.id, {
        transaction,
      });
    }

    if (user && req.body.password) {
      req.body.new_password = req.body.password;
      await table.UserModel.updatePassword(req, req.user_data.id);
    }

    await transaction.commit();
    return res.send({ status: true, message: "Updated" });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateStatus = async (req, res) => {
  try {
    const record = await table.UserModel.getByPk(req);
    if (!record) {
      return res.code(404).send({ status: false, message: "User not exists" });
    }
    const data = await table.UserModel.updateStatus(
      req.params.id,
      req.body.is_active
    );

    res.send({
      status: true,
      message: data?.is_active ? "Customer Active." : "Customer Inactive.",
    });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  try {
    const record = await table.UserModel.getByPk(req);
    if (record === 0) {
      return res.code(404).send({ status: false, message: "User not exists" });
    }

    await table.UserModel.deleteById(req);

    return res.send({ status: true, data: record, message: "Users deleted." });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    return res.send({ status: true, data: await table.UserModel.get(req) });
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.UserModel.getById(req);
    if (!record) {
      return res.code(404).send({ status: false, message: "User not exists" });
    }

    delete record.password;
    delete record.reset_password_token;
    delete record.confirmation_token;

    return res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const getPatientById = async (req, res) => {
  try {
    const record = await table.PatientModel.getById(req);
    if (!record) {
      return res
        .code(404)
        .send({ status: false, message: "Patient not exists" });
    }

    return res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const updatePassword = async (req, res) => {
  try {
    const record = await table.UserModel.getByPk(req);

    if (!record) {
      return res.code(404).send({ status: false, message: "User not exists" });
    }

    const verify_old_password = hash.verify(
      req.body.old_password,
      record.password
    );

    if (!verify_old_password) {
      return res.code(404).send({
        status: false,
        message: "Incorrect password. Please enter a valid password",
      });
    }

    await table.UserModel.updatePassword(req);
    return res.send({
      status: true,
      message: "Password changed successfully!",
    });
  } catch (error) {
    throw error;
  }
};

const checkUsername = async (req, res) => {
  try {
    const user = await table.UserModel.getByUsername(req);
    if (user) {
      return res.code(409).send({
        status: false,
        message: "username already exists try with different username",
      });
    }
    return res.send({
      status: true,
    });
  } catch (error) {
    throw error;
  }
};

const getUser = async (req, res) => {
  const record = await table.UserModel.getByPk(0, req.user_data.id);
  if (!record) {
    return res.code(401).send({ status: false, message: "invalid token" });
  }

  return res.send(req.user_data);
};

const resetPassword = async (req, res) => {
  try {
    const token = await table.UserModel.getByResetToken(req);
    if (!token) {
      return res.code(401).send({ status: false, message: "invalid url" });
    }

    await table.UserModel.updatePassword(req, token.id);
    return res.send({
      status: true,
      message: "Password reset successfully!",
    });
  } catch (error) {
    throw error;
  }
};

const getMyPatients = async (req, res) => {
  try {
    res.send({
      status: true,
      data: await table.DoctorPatientMapModel.get(req),
    });
  } catch (error) {
    throw error;
  }
};

const getMyStaff = async (req, res) => {
  try {
    res.send({
      status: true,
      data: await table.ClinicStaffMapModel.get(req),
    });
  } catch (error) {
    throw error;
  }
};

export default {
  create: create,
  update: update,
  deleteById: deleteById,
  get: get,
  getById: getById,
  checkUsername: checkUsername,
  updatePassword: updatePassword,
  getUser: getUser,
  resetPassword: resetPassword,
  updateStatus: updateStatus,
  getMyPatients: getMyPatients,
  getMyStaff: getMyStaff,
  getPatientById: getPatientById,
};
