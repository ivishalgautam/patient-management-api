"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
const { NOT_FOUND } = constants.http.status;

const getById = async (req, res) => {
  try {
    const record = await table.DoctorModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Doctor not found!" });
    }

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

export default {
  getById: getById,
};
