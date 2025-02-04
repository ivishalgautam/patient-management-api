"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable } from "sequelize";

let OtpModel = null;

const init = async (sequelize) => {
  OtpModel = sequelize.define(
    constants.models.OTP_TABLE,
    {
      id: {
        primaryKey: true,
        allowNull: false,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        onDelete: "CASCADE",
        references: {
          model: constants.models.USER_TABLE,
          key: "id",
          deferrable: Deferrable.INITIALLY_IMMEDIATE,
        },
        validate: {
          isUUID: true,
        },
      },
      otp: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await OtpModel.sync({ alter: true });
};

const create = async ({ user_id, otp }) => {
  return await OtpModel.create({
    user_id: user_id,
    otp: otp,
  });
};

const update = async ({ user_id, otp }) => {
  return await OtpModel.update(
    {
      otp: otp,
    },
    {
      where: {
        user_id: user_id,
      },
      returning: true,
      raw: true,
    }
  );
};

const getByUserId = async (user_id) => {
  return await OtpModel.findOne({
    where: {
      user_id: user_id,
    },
    order: [["created_at", "DESC"]],
    limit: 1,
    raw: true,
    plain: true,
  });
};

const deleteByUserId = async (user_id) => {
  return await OtpModel.destroy({
    where: { user_id: user_id },
  });
};

export default {
  init: init,
  create: create,
  update: update,
  getByUserId: getByUserId,
  deleteByUserId: deleteByUserId,
};
