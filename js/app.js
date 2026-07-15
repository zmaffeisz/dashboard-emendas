import { store } from "./state/store.js";
import * as contratosModule from "./modules/contratos/contratos.service.js";

export const appArchitecture = {
  mode: "static-vanilla",
  legacyScripts: true,
  store,
  contratosModule
};

window.ContratosModule = contratosModule;
