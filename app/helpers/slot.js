import moment from "moment";

export const createSlots = (startTime, endTime, intervalInMinute) => {
  if (!startTime)
    throw new Error("Start time argument is required to create slots.");
  if (!endTime)
    throw new Error("End time argument is required to create slots.");
  if (!intervalInMinute)
    throw new Error("Interval argument is required to create slots.");

  const slots = [];
  const startMoment = moment(startTime, "HH:mm:ss");
  const endMoment = moment(endTime, "HH:mm:ss");

  if (startMoment.isSameOrAfter(endMoment)) {
    throw new Error("Start time must be before end time.");
  }

  let current = startMoment.clone();

  while (current.isBefore(endMoment)) {
    const nextSlot = current.clone().add(intervalInMinute, "minutes");
    if (nextSlot.isAfter(endMoment)) break;

    slots.push(current.format("HH:mm:ss"));
    current.add(intervalInMinute, "minutes");
  }

  return slots;
};
