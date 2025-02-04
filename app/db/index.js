"use strict";
import models from "./models.js";

let sequelize;

const init = async (sequelizeObj) => {
  sequelize = sequelizeObj;
  const modelsName = Object.keys(models);

  for (const modelName of modelsName) {
    try {
      await models[modelName].init(sequelize);
    } catch (error) {
      console.error(`Error initializing model ${modelName}:`, error);
    }
  }
};

export default {
  init,
};
