"use strict";
import constants from "../../lib/constants/index.js";
import hash from "../../lib/encryption/index.js";
import { DataTypes, QueryTypes } from "sequelize";
import { Op } from "sequelize";
import moment from "moment";

let UserModel = null;
const init = async (sequelize) => {
  UserModel = sequelize.define(
    constants.models.USER_TABLE,
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
      },
      fullname: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      country_code: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      mobile_number: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true,
        },
        unique: {
          msg: "Mobile number already in use!",
        },
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isEmail: true,
        },
        unique: {
          msg: "Email address already in use!",
        },
      },
      gender: {
        type: DataTypes.ENUM({
          values: ["male", "female", "other"],
        }),
        allowNull: false,
        validate: {
          isIn: [["male", "female", "other"]],
        },
      },
      dob: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        validate: {
          isDate: true,
        },
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: {
          msg: "Username already in use!",
        },
        validate: {
          notEmpty: true,
          is: { args: /^[0-9A-Za-z]{3,16}$/, msg: "Enter valid username!" },
        },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      role: {
        type: DataTypes.ENUM({
          values: ["admin", "patient", "doctor"],
        }),
        allowNull: false,
        validate: {
          isIn: [["admin", "patient", "doctor"]],
        },
      },
      reset_password_token: {
        type: DataTypes.STRING,
      },
      confirmation_token: {
        type: DataTypes.STRING,
      },
    },
    {
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  await UserModel.sync({ alter: true });
};

const create = async (req, { transaction }) => {
  const hash_password = hash.encrypt(req.body.password);
  const data = await UserModel.create(
    {
      username: req.body.username,
      password: hash_password,
      fullname: req.body?.fullname,
      email: req.body?.email,
      mobile_number: req.body?.mobile_number,
      country_code: req.body?.country_code,
      role: req.body?.role,
      gender: req.body?.gender,
      dob: req.body?.dob,
    },
    { transaction }
  );

  delete data.dataValues.password;
  delete data.dataValues.reset_password_token;
  delete data.dataValues.confirmation_token;

  return data.dataValues;
};

const get = async (req) => {
  const whereConditions = ["usr.role != 'admin'"];
  const queryParams = {};
  const q = req.query.q ? req.query.q : null;
  const roles = req.query.role ? req.query.role.split(".") : null;

  if (q) {
    whereConditions.push(
      `(usr.fullname ILIKE :query OR usr.email ILIKE :query)`
    );
    queryParams.query = `%${q}%`;
  }

  if (roles?.length) {
    whereConditions.push(`usr.role = any(:roles)`);
    queryParams.roles = `{${roles.join(",")}}`;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : null;
  const offset = (page - 1) * limit;

  let whereClause = "";
  if (whereConditions.length) {
    whereClause = `WHERE ${whereConditions.join(" AND ")}`;
  }

  const query = `
  SELECT 
    usr.id, usr.fullname, usr.username, usr.mobile_number, usr.email, usr.role, usr.is_active, usr.created_at
  FROM ${constants.models.USER_TABLE} usr
  ${whereClause}
  ORDER BY usr.created_at DESC
  LIMIT :limit OFFSET :offset
  `;

  const countQuery = `
  SELECT 
    COUNT(usr.id) OVER()::integer as total
  FROM ${constants.models.USER_TABLE} usr
  ${whereClause}
  LIMIT :limit OFFSET :offset
  `;

  const users = await UserModel.sequelize.query(query, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  const count = await UserModel.sequelize.query(countQuery, {
    replacements: { ...queryParams, limit, offset },
    type: QueryTypes.SELECT,
    raw: true,
  });

  return { users, total: count?.[0]?.total ?? 0 };
};

const getById = async (req, user_id) => {
  return await UserModel.findOne({
    where: {
      id: req?.params?.id || user_id,
    },
    raw: true,
  });
};

const getByPk = async (req, id) => {
  const data = await UserModel.findByPk(req?.params?.id || id);

  delete data.dataValues.password;
  delete data.dataValues.reset_password_token;
  delete data.dataValues.confirmation_token;

  return data.dataValues;
};

const getByUsername = async (req, record = undefined) => {
  const data = await UserModel.findOne({
    where: {
      username: req?.body?.username || record?.user?.username,
    },
  });

  return data;
};

const update = async (req) => {
  return await UserModel.update(
    {
      username: req.body?.username,
      fullname: req.body?.fullname,
      email: req.body?.email,
      mobile_number: req.body?.mobile_number,
      country_code: req.body?.country_code.replace(/\s/g, ""),

      role: req.body?.role,
    },
    {
      where: {
        id: req.params.id,
      },
      plain: true,
    }
  );
};

const updatePassword = async (req, user_id) => {
  const hash_password = hash.encrypt(req.body.new_password);
  return await UserModel.update(
    {
      password: hash_password,
    },
    {
      where: {
        id: req.params?.id || user_id,
      },
    }
  );
};

const deleteById = async (req, user_id) => {
  return await UserModel.destroy({
    where: {
      id: req?.params?.id || user_id,
    },
    returning: true,
    raw: true,
  });
};

const countUser = async (last_30_days = false) => {
  let where_query;
  if (last_30_days) {
    where_query = {
      createdAt: {
        [Op.gte]: moment()
          .subtract(30, "days")
          .format("YYYY-MM-DD HH:mm:ss.SSSZ"),
      },
    };
  }
  return await UserModel.findAll({
    where: where_query,
    attributes: [
      "role",
      [
        UserModel.sequelize.fn("COUNT", UserModel.sequelize.col("role")),
        "total",
      ],
    ],
    group: "role",
    raw: true,
  });
};

const getByEmailId = async (req) => {
  return await UserModel.findOne({
    where: {
      email: req.body.email,
    },
  });
};

const getByResetToken = async (req) => {
  return await UserModel.findOne({
    where: {
      reset_password_token: req.params.token,
    },
  });
};

const getByUserIds = async (user_ids) => {
  return await UserModel.findAll({
    where: {
      id: {
        [Op.in]: user_ids,
      },
    },
  });
};

const updateStatus = async (id, status) => {
  const [rowCount, rows] = await UserModel.update(
    {
      is_active: status,
    },
    {
      where: {
        id: id,
      },
      plain: true,
      raw: true,
    }
  );

  return rows;
};

export default {
  init: init,
  create: create,
  get: get,
  getById: getById,
  getByPk: getByPk,
  getByUsername: getByUsername,
  update: update,
  updatePassword: updatePassword,
  deleteById: deleteById,
  countUser: countUser,
  getByEmailId: getByEmailId,
  getByResetToken: getByResetToken,
  getByUserIds: getByUserIds,
  updateStatus: updateStatus,
};