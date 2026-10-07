"use strict";

import { beginTransaction } from "../../db/transaction.js";
import table from "../../db/models.js";
import { cleanupFiles } from "../../helpers/cleanup-files.js";
import { credentialGenerator } from "../../helpers/credential-generator.js";
import hash from "../../lib/encryption/index.js";
import authToken from "../../helpers/auth.js";
import { resolvePracticeForPatient } from "../../lib/practice.js";
import { can } from "../../lib/permissions.js";
import { PERMISSION_KEYS } from "../../lib/constants/permissions.js";
import { doctorSchema } from "../../validation-schemas/doctor.schema.js";
import { userSchema } from "../../validation-schemas/user.schema.js";

// Editing or deleting another user: patients need the patient permission,
// staff/doctors need users.manage. Your own account is always editable.
const mayManageUser = (ctx, target, patientPermission) =>
  target.id === ctx.userId ||
  can(ctx, target.role === "patient" ? patientPermission : "users.manage");

// Which roles each caller role may create.
const CREATABLE_ROLES = {
  admin: ["admin", "doctor", "staff", "patient"],
  doctor: ["staff", "patient"],
  staff: ["patient"],
  patient: [],
};

const create = async (req, res) => {
  const { role } = req.user_data;
  const validateUserData = userSchema.parse(req.body);
  // Use the validated values (defaults, coercions) from here on.
  Object.assign(req.body, validateUserData);
  const newRole = validateUserData.role;
  const needed = newRole === "patient" ? "patients.create" : "users.manage";
  if (!CREATABLE_ROLES[role]?.includes(newRole) || !can(req.ctx, needed)) {
    return res.code(403).send({
      status: false,
      message: "You don't have permission to create this type of user.",
    });
  }
  if (newRole === "doctor") {
    Object.assign(req.body, doctorSchema.parse(req.body));
  }

  // Reads first: holding a transaction while other queries wait for a pooled
  // connection deadlocks the pool under concurrent requests.
  let doctorRecord = null;
  if ((newRole === "patient" && role === "doctor") || newRole === "staff") {
    doctorRecord =
      role === "admin"
        ? await table.DoctorModel.getById(0, req.body.doctor_id)
        : await table.DoctorModel.getByUserId(req);
    if (newRole === "staff" && !doctorRecord) {
      return res.code(404).send({ status: false, message: "Doctor not found." });
    }
  }
  let practiceId = null;
  let generatedPassword;
  if (newRole === "patient") {
    practiceId = await resolvePracticeForPatient({
      practiceId: req.user_data.practice_id,
      clinicId: req.body.clinic_id,
    });
    const patientNumber = await table.PatientSequenceModel.next();
    const { username, password } = credentialGenerator(
      patientNumber,
      validateUserData.fullname,
      validateUserData.mobile_number,
    );
    req.body.username = username;
    req.body.password = password;
    generatedPassword = password;
  }

  const transaction = await beginTransaction(req);
  try {
    const data = await table.UserModel.create(req, { transaction });

    if (newRole === "doctor") {
      await table.DoctorModel.create(req, data.id, { transaction });
    }
    if (newRole === "patient") {
      const patient = await table.PatientModel.create(req, data.id, {
        transaction,
        practiceId,
      });
      if (role === "doctor" && doctorRecord) {
        await table.DoctorPatientMapModel.create(doctorRecord.id, patient.id, { transaction });
      }
      if (role === "staff") {
        await table.ClinicPatientMapModel.create(patient.id, req.body.clinic_id, { transaction });
      }
    }
    if (newRole === "staff") {
      await table.StaffModel.create(doctorRecord.id, data.id, { transaction });
    }

    await transaction.commit();
    return res.send({
      status: true,
      message: "User created",
      user: data,
      // Only for generated patient credentials; shown once to the staff.
      ...(generatedPassword ? { temporary_password: generatedPassword } : {}),
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const update = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const record = await table.UserModel.findAuthUserById(req.params.id);
    if (!record) {
      await transaction.rollback();
      return res.code(404).send({ status: false, message: "User not exists" });
    }
    if (!mayManageUser(req.ctx, record, "patients.edit")) {
      await transaction.rollback();
      return res.code(403).send({
        status: false,
        message: "You don't have permission to edit this user.",
      });
    }

    const user = await table.UserModel.update(req, 0, { transaction });
    if (user.role === "doctor") {
      await table.DoctorModel.updateByUserId(req, user.id, {
        transaction,
      });
    }
    if (user.role === "patient") {
      await table.PatientModel.updateByUserId(req, user.id, {
        transaction,
      });
    }

    if (user && req.body.password) {
      req.body.new_password = req.body.password;
      await table.UserModel.updatePassword(req, req.user_data.id);
      await table.UserModel.bumpTokenVersion(req.params.id);
    }

    await transaction.commit();
    return res.send({ status: true, message: "Updated" });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateStatus = async (req, res) => {
  const record = await table.UserModel.getByPk(req);
  if (!record) {
    return res.code(404).send({ status: false, message: "User not exists" });
  }
  const data = await table.UserModel.updateStatus(
    req.params.id,
    req.body.is_active,
  );
  if (!req.body.is_active) {
    await table.UserModel.bumpTokenVersion(req.params.id);
  }

  res.send({
    status: true,
    message: data?.is_active ? "Customer Active." : "Customer Inactive.",
  });
};

const deleteById = async (req, res) => {
  const transaction = await beginTransaction(req);
  try {
    const filesToDelete = [];
    const record = await table.UserModel.findAuthUserById(req.params.id);
    if (!record) {
      await transaction.rollback();
      return res.code(404).send({ status: false, message: "User not exists" });
    }
    if (record.id === req.ctx.userId || !mayManageUser(req.ctx, record, "patients.delete")) {
      await transaction.rollback();
      return res.code(403).send({
        status: false,
        message: "You don't have permission to delete this user.",
      });
    }
    if (record.avatar) filesToDelete.push(record.avatar);
    const role = record.role;

    if (role === "patient") {
      const patientRecord = await table.PatientModel.getByUserId(record.id);
      if (patientRecord) {
        const examinationRecord =
          await table.ComprehensiveExaminationModel.getByPatientId(
            0,
            patientRecord.id,
          );
        if (examinationRecord) {
          filesToDelete.push(...examinationRecord.gallery);
        }
      }
    }

    if (role !== "patient") {
      // Staff/doctor accounts are deactivated, never removed: their
      // treatments, payments and notes must survive.
      await table.UserModel.softDelete(record.id, { transaction });
      await transaction.commit();
      return res.send({
        status: true,
        data: authToken.sanitizeUser(record),
        message: "Users deleted.",
      });
    }

    if (filesToDelete.length) {
      await cleanupFiles(filesToDelete);
    }

    await table.UserModel.deleteById(req, 0, { transaction });
    await transaction.commit();
    return res.send({
      status: true,
      data: authToken.sanitizeUser(record),
      message: "Users deleted.",
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const get = async (req, res) => {
  return res.send({ status: true, data: await table.UserModel.get(req) });
};

const getById = async (req, res) => {
  const record = await table.UserModel.getById(req);
  if (!record) {
    return res.code(404).send({ status: false, message: "User not exists" });
  }

  delete record.password;
  delete record.reset_password_token;
  delete record.confirmation_token;

  return res.send({ status: true, data: record });
};

const getPatientById = async (req, res) => {
  const record = await table.PatientModel.getById(req);
  if (!record) {
    return res
      .code(404)
      .send({ status: false, message: "Patient not exists" });
  }

  return res.send({ status: true, data: record });
};

const updatePassword = async (req, res) => {
  // Only the account owner changes their own password here.
  if (req.params.id !== req.user_data.id) {
    return res.code(403).send({
      status: false,
      message: "You can only change your own password.",
    });
  }

  const record = await table.UserModel.findAuthUserById(req.params.id);
  if (!record) {
    return res.code(404).send({ status: false, message: "User not exists" });
  }

  if (!req.body.old_password || !hash.verify(req.body.old_password, record.password)) {
    return res.code(400).send({
      status: false,
      message: "Incorrect password. Please enter a valid password",
    });
  }
  if (!req.body.new_password) {
    return res.code(400).send({ status: false, message: "New password is required." });
  }

  await table.UserModel.updatePassword(req);
  await table.UserModel.bumpTokenVersion(record.id);

  // Old tokens are now revoked; hand back fresh ones for this session.
  const fresh = await table.UserModel.findAuthUserById(record.id);
  const [token, expiresIn] = authToken.generateAccessToken(fresh);
  return res.send({
    status: true,
    message: "Password changed successfully!",
    token,
    expire_time: Date.now() + expiresIn,
    refresh_token: authToken.generateRefreshToken(fresh),
  });
};

const checkUsername = async (req, res) => {
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
};

const getUser = async (req, res) => {
  const record = await table.UserModel.getByPk(0, req.user_data.id);
  if (!record) {
    return res.code(401).send({ status: false, message: "invalid token" });
  }

  return res.send({
    ...authToken.sanitizeUser(req.user_data),
    permissions: req.ctx.isPlatformAdmin ? PERMISSION_KEYS : req.ctx.permissions,
  });
};

const resetPassword = async (req, res) => {
  const token = await table.UserModel.getByResetToken(req);
  if (!token) {
    return res.code(401).send({ status: false, message: "invalid url" });
  }

  await table.UserModel.updatePassword(req, token.id);
  return res.send({
    status: true,
    message: "Password reset successfully!",
  });
};

const getMyPatients = async (req, res) => {
  res.send({
    status: true,
    data: await table.DoctorPatientMapModel.get(req),
  });
};

const getMyStaff = async (req, res) => {
  res.send({
    status: true,
    data: await table.ClinicStaffMapModel.get(req),
  });
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
