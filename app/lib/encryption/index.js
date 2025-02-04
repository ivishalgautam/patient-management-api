import bcrypt from "bcrypt";
import constants from "../constants/index.js";

const verify = (data, hash) => {
  return bcrypt.compareSync(data, hash);
};

const encrypt = (data) => {
  const salt = bcrypt.genSaltSync(constants.bcrypt.SALT_ROUNDS);
  return bcrypt.hashSync(data, salt);
};

export default {
  verify: verify,
  encrypt: encrypt,
};
