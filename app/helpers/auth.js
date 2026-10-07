"use strict";

import config from "../config/index.js";
import table from "../db/models.js";
import jwt from "jsonwebtoken";

// Tokens carry only identifiers: { sub: user id, role, ver, typ }.
// `ver` must match users.token_version, so bumping it revokes every token.

const SENSITIVE_FIELDS = ["password", "reset_password_token", "confirmation_token"];

export function sanitizeUser(user) {
  if (!user) return user;
  const safe = { ...user };
  for (const field of SENSITIVE_FIELDS) delete safe[field];
  return safe;
}

const ttlMs = (token) => jwt.decode(token).exp * 1000 - Date.now();

function generateAccessToken(user) {
  const token = jwt.sign(
    { sub: user.id, role: user.role, ver: user.token_version ?? 0, typ: "access" },
    config.jwt_secret,
    { expiresIn: config.access_token_ttl },
  );
  return [token, ttlMs(token)];
}

function generateRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, ver: user.token_version ?? 0, typ: "refresh" },
    config.jwt_refresh_secret,
    { expiresIn: config.refresh_token_ttl },
  );
}

// Pre-revamp tokens embedded the whole user row: { user: { username, ... } }.
const legacyAllowed = () =>
  !!config.legacy_token_grace_until && Date.now() < config.legacy_token_grace_until.getTime();

async function resolveUser(decoded) {
  if (decoded.sub) {
    const user = await table.UserModel.findAuthUserById(decoded.sub);
    if (!user || (user.token_version ?? 0) !== (decoded.ver ?? 0)) return null;
    return user;
  }
  if (decoded.user?.username && legacyAllowed()) {
    return table.UserModel.getByUsername(null, decoded);
  }
  return null;
}

const unauthorized = (res, message = "Invalid token or token expired") =>
  res.code(401).send({ status: false, message });

const verifyToken = async (req, res) => {
  const authHeader = req.headers["authorization"];
  const cookieToken = req.cookies?.token;
  if (!authHeader && !cookieToken) return unauthorized(res, "unauthorized!");

  const token = authHeader
    ? authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader
    : cookieToken;
  if (!token) return unauthorized(res, "A token is required for authentication");

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt_secret);
  } catch {
    return unauthorized(res);
  }
  if (decoded.typ && decoded.typ !== "access") return unauthorized(res);

  const user = await resolveUser(decoded);
  if (!user || !user.is_active) return unauthorized(res);

  req.user_data = sanitizeUser(user);
  req.decoded = decoded;
  // Who is calling and which practice (tenant) they act for.
  req.ctx = {
    userId: user.id,
    role: user.role,
    practiceId: user.practice_id ?? null,
    isPlatformAdmin: user.role === "admin",
  };
};

// POST /auth/refresh { refresh_token } -> new access token and a rotated
// refresh token. The user is re-checked (active, token version).
const verifyRefreshToken = async (req, res) => {
  let decoded;
  try {
    decoded = jwt.verify(req.body?.refresh_token, config.jwt_refresh_secret);
  } catch {
    return res
      .code(401)
      .send({ status: false, message: "Invalid refresh token or a refresh token is expired" });
  }

  const user = decoded.sub
    ? await resolveUser(decoded)
    : legacyAllowed() && decoded.user?.username
      ? await table.UserModel.getByUsername(null, decoded)
      : null;
  if (!user || !user.is_active) {
    return res
      .code(401)
      .send({ status: false, message: "Invalid refresh token or a refresh token is expired" });
  }

  const [token, expiresIn] = generateAccessToken(user);
  return res.send({
    token,
    expire_time: Date.now() + expiresIn,
    refresh_token: generateRefreshToken(user),
  });
};

export default {
  verifyToken,
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  sanitizeUser,
};
