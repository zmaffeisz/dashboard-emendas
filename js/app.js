import { store } from "./state/store.js";
import { createUnidadesCadastro } from "./modules/cadastros/unidades.js?v=20260930-1";
import * as contratosModule from "./modules/contratos/contratos.service.js";
import { createFinanceiroWorkspace } from "./modules/contratos/financeiro.workspace.js?v=20260929-2";

export const appArchitecture = {
  mode: "static-vanilla",
  legacyScripts: true,
  store,
  contratosModule
};

window.ContratosModule = contratosModule;
window.UnidadesCadastro = createUnidadesCadastro({
  sb, esc: _sanEsc, toast,
  podeEditar: () => !bloquearSeVisualiz('cadastros'),
  invalidar: () => { _unidadesAtivasCache = null; }
});
window.ContratosFinanceiro = createFinanceiroWorkspace(window.ctFinanceiroAdapter);
