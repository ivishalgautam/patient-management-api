"use strict";
import constants from "../../lib/constants/index.js";
import { DataTypes, Deferrable, QueryTypes } from "sequelize";

let DoctorModel = null;

const init = async (sequelize) => {
  DoctorModel = sequelize.define(
    constants.models.DOCTOR_TABLE,
    {
      id: {
        allowNull: false,
        primaryKey: true,
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
      },
      specialization: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "",
      },
      experience_years: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      about: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: "",
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await DoctorModel.sync({ alter: true });
};

const create = async (req, user_id, { transaction }) => {
  return await DoctorModel.create(
    {
      user_id: user_id,
      specialization: req.body.specialization,
      experience_years: req.body.experience_years,
      about: req.body.about,
    },
    { transaction }
  );
};

const get = async () => {
  let query = `
  SELECT
      dr.id,
      usr.fullname, usr.avatar, usr.gender
    FROM ${constants.models.DOCTOR_TABLE} dr
    LEFT JOIN ${constants.models.USER_TABLE} usr ON usr.id = dr.user_id
  `;
  return await DoctorModel.sequelize.query(query, {
    type: QueryTypes.SELECT,
    raw: true,
  });
};

const getById = async (req, id) => {
  return await DoctorModel.findOne({
    where: {
      id: req?.params?.id || id,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  return await DoctorModel.findByPk(req?.params?.id || id);
};

const getByUserId = async (req, id) => {
  return await DoctorModel.findOne({
    where: {
      user_id: req?.user_data?.id || id,
    },
    raw: true,
  });
};

const update = async (req, id, { transaction }) => {
  const [, rows] = await DoctorModel.update(
    {
      specialization: req.body.specialization,
      experience_years: req.body.experience_years,
      about: req.body.about,
    },
    {
      where: {
        id: req?.params?.id || id,
      },
      returning: true,
      plain: true,
      raw: true,
    },
    { transaction }
  );

  return rows;
};

const updateByUserId = async (req, id, { transaction }) => {
  const [, rows] = await DoctorModel.update(
    {
      specialization: req.body.specialization,
      experience_years: req.body.experience_years,
      about: req.body.about,
    },
    {
      where: {
        user_id: req?.params?.id || id,
      },
      returning: true,
      plain: true,
      raw: true,
    },
    { transaction }
  );

  return rows;
};

const deleteById = async (req, id) => {
  return await DoctorModel.destroy({
    where: {
      id: req?.params?.id || id,
    },
    returning: true,
    raw: true,
  });
};

export default {
  init: init,
  create: create,
  get: get,
  getById: getById,
  getByPk: getByPk,
  getByUserId: getByUserId,
  update: update,
  deleteById: deleteById,
  updateByUserId: updateByUserId,
};
