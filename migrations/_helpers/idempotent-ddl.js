"use strict";
// Ported from the reference project. Lets a migration converge on the
// desired end state when an object already exists (e.g. a database that was
// patched by hand), instead of failing with "relation already exists".

export async function tableExists(queryInterface, table) {
  try {
    await queryInterface.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

export async function columnExists(queryInterface, table, column) {
  if (!(await tableExists(queryInterface, table))) return false;
  const desc = await queryInterface.describeTable(table);
  return Object.prototype.hasOwnProperty.call(desc, column);
}

export async function createTableIfNotExists(queryInterface, table, columns, options) {
  if (await tableExists(queryInterface, table)) return;
  await queryInterface.createTable(table, columns, options);
}

export async function indexExists(queryInterface, indexName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = :indexName`,
    { replacements: { indexName } },
  );
  return rows.length > 0;
}

export async function addIndexIfNotExists(queryInterface, table, fields, options = {}) {
  const indexName = options.name || `${table}_${fields.join("_")}`;
  if (await indexExists(queryInterface, indexName)) return;
  await queryInterface.addIndex(table, fields, { ...options, name: indexName });
}
