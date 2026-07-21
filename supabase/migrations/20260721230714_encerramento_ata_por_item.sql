-- O status de contratos continua representando o encerramento integral da ATA.
-- Estes campos registram o encerramento seletivo de cada item da ata.
alter table public.atas_itens
  add column if not exists data_encerramento date,
  add column if not exists motivo_encerramento text;
