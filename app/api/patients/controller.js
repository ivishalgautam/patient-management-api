"use strict";

import table from "../../db/models.js";

const get = async (req, res) => {
  try {
    res.send({ status: true, data: await table.PatientModel.get(req) });
  } catch (error) {
    throw error;
  }
};

export default {
  get: get,
};
