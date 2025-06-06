export const credentialGenerator = (patientNumber, fullname, mobile_number) => {
  const username = `ddss${patientNumber}`;
  const password =
    String(fullname.substring(0, 4)).toLowerCase() + mobile_number.slice(-4);

  return { username, password };
};
