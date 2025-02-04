import axios from "axios";

export async function sendOtp({
  country_code,
  mobile_number,
  first_name,
  last_name,
  otp,
}) {
  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: "https://api.interakt.ai/v1/public/message/",
    headers: {
      Authorization: `Basic ${process.env.INTERACT_API_KEY}`,
      "Content-Type": "application/json",
    },
    data: JSON.stringify({
      countryCode: country_code,
      phoneNumber: mobile_number,
      callbackuserData: "Otp sent successfully.",
      type: "Template",
      template: {
        name: process.env.INTERACT_TEMPLATE_NAME,
        languageCode: "en",
        bodyValues: [`${first_name} ${last_name}`, otp],
      },
    }),
  };

  const resp = await axios(config);
  console.log(resp.data);
  return resp;
}
