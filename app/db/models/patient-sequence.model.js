"use strict";

import { DataTypes } from "sequelize";

let PatientSequenceModel = null;

const init = async (sequelize) => {
  PatientSequenceModel = sequelize.define(
    "patient_sequences",
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      value: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    },
    { createdAt: "created_at", updatedAt: "updated_at" }
  );

  await PatientSequenceModel.sync({ alter: true });
  await PatientSequenceModel.findOrCreate({
    where: { id: "patient" },
    defaults: { value: 0 },
  });
};

const update = async (value, { transaction }) => {
  const [rowCount, rows] = await PatientSequenceModel.update(
    {
      value: value,
    },
    { where: { id: "patient" }, returning: true, plain: true, transaction }
  );

  return rows;
};

const get = async () => {
  return await PatientSequenceModel.findOne({
    where: { id: "patient" },
    raw: true,
  });
};

export default { init: init, update: update, get: get };
