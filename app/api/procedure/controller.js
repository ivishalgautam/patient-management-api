"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import slugify from "slugify";
import { deleteFile } from "../../helpers/file.js";
import { sequelize } from "../../db/postgres.js";
import { procedureSchema } from "../../validation-schemas/procedure.schema.js";

const { BAD_REQUEST, NOT_FOUND } = constants.http.status;

const create = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const validateProcedureData = procedureSchema.parse(req.body);
    let slug = slugify(req.body.name, { lower: true });
    req.body.slug = slug;

    const data = await table.ProcedureModel.create(req, { transaction });

    await transaction.commit();
    res.send({ status: true, data: data });
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

    const record = await table.ProcedureModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Procedure not found!" });
    }

    if (req.body.name) {
      const slugExist = await table.ProcedureModel.getBySlug(
        req,
        req.body.slug
      );
      // Check if there's another Product with the same slug but a different ID
      if (slugExist && record?.id !== slugExist?.id)
        return res.code(BAD_REQUEST).send({
          status: false,
          message: "Procedure exist with this name!",
        });
    }
    res.send({
      status: true,
      data: await table.ProcedureModel.update(req),
    });
  } catch (error) {
    throw error;
  }
};

const getBySlug = async (req, res) => {
  try {
    const record = await table.ProcedureModel.getBySlug(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Procedure not found!" });
    }

    res.send({
      status: true,
      data: await table.ProcedureModel.getBySlug(req),
    });
  } catch (error) {
    throw error;
  }
};

const getById = async (req, res) => {
  try {
    const record = await table.ProcedureModel.getByPk(req);
    if (!record) {
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Procedure not found!" });
    }

    res.send({ status: true, data: record });
  } catch (error) {
    throw error;
  }
};

const get = async (req, res) => {
  try {
    const data = await table.ProcedureModel.get(req);
    res.send({ status: true, data: data, total: data?.[0]?.total });
  } catch (error) {
    throw error;
  }
};

const deleteById = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const record = await table.ProcedureModel.getByPk(req);
    if (!record)
      return res
        .code(NOT_FOUND)
        .send({ status: false, message: "Procedure not found!" });

    const isProcedureDeleted = await table.ProcedureModel.deleteById(
      req,
      req.params.id,
      {
        transaction,
      }
    );

    if (isProcedureDeleted) {
      deleteFile(record?.image);
    }

    await transaction.commit();
    res.send({ status: true, message: "Procedure deleted." });
  } catch (error) {
    await transaction.rollback();
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
};
