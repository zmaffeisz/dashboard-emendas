export function assertNotaFiscalSemDuplicidade(notaFiscal) {
  if (!notaFiscal || !Array.isArray(notaFiscal.vinculos)) return true;
  const ids = notaFiscal.vinculos.map((vinculo) => vinculo.id).filter(Boolean);
  return new Set(ids).size === ids.length;
}
