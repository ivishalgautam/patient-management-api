"use strict";
import constants from "../../lib/constants/index.js";
import table from "../../db/models.js";
import moment from "moment";
import crypto from "crypto";
import { sendOtp } from "../../helpers/interaktApi.js";

const create = async (req, res) => {
  const user = await table.UserModel.getById(
    req,
    req.user_data?.id || req.decoded.user.id
  );
  const otp = crypto.randomInt(100000, 999999);
  const record = await table.OtpModel.getByUserId(user?.id);

  const resp = await sendOtp({
    country_code: user.country_code,
    first_name: user.first_name,
    last_name: user.last_name,
    mobile_number: user.mobile_number,
    otp: otp,
  });

  if (resp.data.result) {
    if (record) {
      await table.OtpModel.update({
        user_id: req.user_data?.id || req.decoded.user.id,
        otp: otp,
      });
    } else {
      await table.OtpModel.create({
        user_id: req.user_data?.id || req.decoded.user.id,
        otp: otp,
      });
    }
  }

  res.send({ status: true, message: "Otp sent" });
};

const verify = async (req, res) => {
  try {
    const record = await table.OtpModel.getByUserId(
      req.user_data?.id || req.decoded.user.id
    );

    if (!record) {
      return res
        .code(constants.http.status.NOT_FOUND)
        .send({ message: "OTP not found!" });
    }

    const isExpired = moment(record.created_at).add(5, "minutes").isBefore();
    if (isExpired) {
      await table.OtpModel.deleteByUserId(
        req.user_data?.id || req.decoded.user.id
      );
      return res
        .code(400)
        .send({ status: false, message: "Please resend OTP!" });
    }

    if (record.otp != req.params.otp) {
      return res.code(400).send({ status: false, message: "Incorrect otp!" });
    }

    await table.OtpModel.deleteByUserId(
      req.user_data?.id || req.decoded.user.id
    );

    await table.UserModel.verify({
      user_id: req.user_data?.id || req.decoded.user.id,
      status: true,
    });

    res.send({ status: true, message: "Otp verified." });
  } catch (error) {
    console.error(error);
    res
      .code(constants.http.status.INTERNAL_SERVER_ERROR)
      .send({ status: false, error });
  }
};

export default {
  create: create,
  verify: verify,
};
