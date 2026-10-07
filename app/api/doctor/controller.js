"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
const { NOT_FOUND } = constants.http.status;

const getById = async (req, res) => {
  const record = await table.DoctorModel.getByPk(req);
  if (!record) {
    return res
      .code(NOT_FOUND)
      .send({ status: false, message: "Doctor not found!" });
  }

  res.send({ status: true, data: record });
};

const get = async (req, res) => {
  res.send({ status: true, data: await table.DoctorModel.get(req) });
};

export default {
  getById: getById,
  get: get,
};
