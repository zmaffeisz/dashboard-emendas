import { store } from "./state/store.js";
import * as contratosModule from "./modules/contratos/contratos.service.js";
import { createFinanceiroWorkspace } from "./modules/contratos/financeiro.workspace.js?v=20260929-2";

export const appArchitecture = {
  mode: "static-vanilla",
  legacyScripts: true,
  store,
  contratosModule
};

window.ContratosModule = contratosModule;
window.ContratosFinanceiro = createFinanceiroWorkspace(window.ctFinanceiroAdapter);
