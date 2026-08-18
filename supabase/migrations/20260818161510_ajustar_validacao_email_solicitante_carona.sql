alter table public.atas_execucao
  drop constraint if exists atas_execucao_email_solicitante_check;

alter table public.atas_execucao
  add constraint atas_execucao_email_solicitante_check
  check (
    email_solicitante is null
    or (
      origem_recurso = 'carona'
      and length(btrim(email_solicitante)) between 3 and 254
      and btrim(email_solicitante) like '%_@_%._%'
    )
  ) not valid;

alter table public.atas_execucao
  validate constraint atas_execucao_email_solicitante_check;
