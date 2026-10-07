"use strict";
import { QueryTypes } from "sequelize";
import { sequelize } from "./postgres.js";

// Thin helpers for raw, parameterised SQL (named :params).
export const select = (sql, replacements = {}, { transaction } = {}) =>
  sequelize.query(sql, { replacements, transaction, type: QueryTypes.SELECT });

export const one = async (sql, replacements = {}, options = {}) =>
  (await select(sql, replacements, options))[0] ?? null;

export const exec = (sql, replacements = {}, { transaction } = {}) =>
  sequelize.query(sql, { replacements, transaction });

export const withTransaction = (fn) => sequelize.transaction(fn);
