"use strict";
// Bumping users.token_version invalidates every access/refresh token issued
// to that user (password change, deactivation).
export async function up({ context: queryInterface }) {
  await queryInterface.addColumn("users", "token_version", {
    type: "INTEGER",
    allowNull: false,
    defaultValue: 0,
  });
}

export async function down({ context: queryInterface }) {
  await queryInterface.removeColumn("users", "token_version");
}
