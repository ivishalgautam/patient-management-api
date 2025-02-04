"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import slugify from "slugify";
import { deleteFile } from "../../helpers/file.js";
import { sequelize } from "../../db/postgres.js";
import { serviceSchema } from "../../validation-schemas/service.schema.js";

const { NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateProcedureData = serviceSchema.parse(req.body);
    const procedure = await table.ProcedureModel.getByPk(
      0,
      req.body.procedure_id
    );
    if (!procedure)
      return res
        .code(404)
        .send({ status: false, message: "Procedure not found." });

    let slug = slugify(req.body.name, { lower: true });
    req.body.slug = slug;

    const data = await table.ServiceModel.create(req, { transaction });

    await transaction.commit();
    res.send({ status: true, data: data, message: "Service created." });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateById = async (req, res) => {
  try {
    let slug = "";
    if (req.body.name) {
      slug = slugify(req.body?.name, { lower: true });
      req.body.slug = slug;
    }

    const record = await table.ServiceModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Service not found!" });
    }

    res.send({
      status: true,
      data: await table.ServiceModel.update(req),
      message: "Service updated.",
    });
  } catch (error) {
    throw error;
  }
};

const getBySlug = async (req, res) => {
  try {
    const record = await table.ServiceModel.getBySlug(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Service not found!" });
    }

    res.send({
      status: true,
      data: await table.ServiceModel.getBySlug(req),
    });
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.ServiceModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Service not found!" });
    }

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const getByProcedureId = async (req, res) => {
  try {
    const record = await table.ProcedureModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Procedure not found!" });
    }

    res.send({
      status: true,
      data: await table.ServiceModel.getByProcedureId(req),
    });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.ServiceModel.get(req);
    res.send({ status: true, data: data });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = sequelize.transaction();

  try {
    const record = await table.ServiceModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Service not found!" });

    const isServiceDeleted = await table.ServiceModel.deleteById(
      req,
      req.params.id,
      { transaction }
    );

    if (isServiceDeleted) {
      deleteFile(record?.image);
    }

    await transaction.commit();
    res.send({ status: true, message: "Service deleted." });
  } catch (error) {
    await (await transaction).rollback();
    throw error;
  }
};

export default {
  create: create,
  get: get,
  updateById: updateById,
  deleteById: deleteById,
  getBySlug: getBySlug,
  getById: getById,
  getByProcedureId: getByProcedureId,
};
