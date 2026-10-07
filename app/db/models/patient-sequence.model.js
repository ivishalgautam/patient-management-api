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
    { createdAt: "created_at", updatedAt: "updated_at" },
  );

};

const update = async (value, { transaction }) => {
  const [, rows] = await PatientSequenceModel.update(
    {
      value: value,
    },
    { where: { id: "patient" }, returning: true, plain: true, transaction },
  );

  return rows;
};

const get = async () => {
  return await PatientSequenceModel.findOne({
    where: { id: "patient" },
    raw: true,
  });
};

// Next patient number (ddss<N>). Concurrency-safe: Postgres sequence.
const next = async ({ transaction } = {}) => {
  const [[row]] = await PatientSequenceModel.sequelize.query(
    `SELECT nextval('patient_number_seq')::int AS value`,
    { transaction },
  );
  return row.value;
};

export default { init: init, update: update, get: get, next: next };
