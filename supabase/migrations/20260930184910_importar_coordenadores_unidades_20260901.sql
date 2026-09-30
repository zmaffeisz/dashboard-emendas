-- Produção: qpvgpfwuurqcqprnpxua. Fonte: Tabela coordenadores unidades.xlsx,
-- Planilha1 A3:F40 (atualizada em 01/09/2026), correções do usuário em 30/09/2026.
-- SAME reutilizado; Saúde Mental é unidade própria dentro do Palácio da Saúde.
create temp table stg_coordenadores_unidades (
  unidade_id bigint, unidade_nome text, pessoa_nome text, pessoa_email text,
  unidade_email text, telefone text, endereco text
) on commit drop;
insert into stg_coordenadores_unidades values
(2,'UBS Angélica','Cristina Aparecida Medeiros Bueno','cribueno@sorocaba.sp.gov.br','csangelica@sorocaba.sp.gov.br','3223-3113 / 3223-4870','Rua Gabriel de Lara, 255'),
(3,'UBS Aparecidinha','Silvana Aparecida Sanavio','ssanavio@sorocaba.sp.gov.br','csaparecidinha@sorocaba.sp.gov.br','3225-2759 / 3225-3896','Rua Joaquim Machado, 62'),
(4,'UBS Barão','Thais Molinari Ferraresi','tferraresi@sorocaba.sp.gov.br','csbarao@sorocaba.sp.gov.br','3233-1559 / 3234-5621','Rua Afonso Muraro, 41'),
(5,'UBS Barcelona','Silvia Helena Janolla','sjanolla@sorocaba.sp.gov.br','csbarcelona@sorocaba.sp.gov.br','3227-4346 / 3227-9102','Rua Colômbia, 253'),
(7,'UBS Brigadeiro Tobias','Elisângela Souza','EGSouza@sorocaba.sp.gov.br','csbrigadeirotobias@sorocaba.sp.gov.br','3236-6005 / 3236-6789','Rua Ana Gomes Correa, 55'),
(8,'UBS Cajuru do Sul','Josemara Oliveira Cordeiro','Jcordeiro@sorocaba.sp.gov.br','cscajuru@sorocaba.sp.gov.br','3333-2525/2520/2521/2523','Avenida Paraná , 3719'),
(9,'UBS Carandá','Natalia Campos Barnabé','nbarnabe@sorocaba.sp.gov.br','ubscaranda@sorocaba.sp.gov.br','5704-6115','R: José Jesus Infanti 240'),
(13,'UBS Cerrado','Roselene Benites Florentino','rbflorentino@sorocaba.sp.gov.br','cscerrado@sorocaba.sp.gov.br','3221-7445 / 3202-4691','Rua Visconde do Rio Branco, 885'),
(17,'UBS Éden','Aline Porto Miranda Maranho','Amaranho@sorocaba.sp.gov.br','cseden@sorocaba.sp.gov.br','3225-3105 / 3225-4566','Rua Salvador Leite Marques, 933'),
(20,'UBS Escola','Katy Suzane Renosto','krenosto@sorocaba.sp.gov.br','csescola@sorocaba.sp.gov.br','3232-9150 / 3234-5777','Avenida Comendador Pereira Inácio, 500'),
(21,'UBS Fiori','Caroline Abes Sant''ana','caroline.abes@sorocaba.sp.gov.br','csfiore@sorocaba.sp.gov.br','3235-7171','Rua André Manente, s/n'),
(23,'UBS Habiteto','Edineia de Oliveira','EdiOliveira@sorocaba.sp.gov.br','cshabiteto@sorocaba.sp.gov.br','3226-9520/21/22/24/26/26','Rua Horácio Blazeck (esq. av. Chico Xavier)'),
(24,'UBS Haro','Gisele Unterkircher Ribeiro','giribeiro@sorocaba.sp.gov.br','csvlharo@sorocaba.sp.gov.br','3227-2370 / 3227-2247','Rua Aristides Silva Lobo, 379'),
(25,'UBS Hortência','Sérgio Antonio Francisco','sfrancisco@sorocaba.sp.gov.br','csvlortencia@sorocaba.sp.gov.br','3227-5438 / 3227-4592','Rua Teodoro Kaisel, 677'),
(27,'UBS Laranjeiras','Helio Galindo Bispo Mariano','HMariano@sorocaba.sp.gov.br','cslaranjeiras@sorocaba.sp.gov.br','3226-9191- 3226-9190 ou 94','Rua Sônia Bernuncio, 24'),
(28,'UBS Lopes Oliveira','Eunice da Silva Santos','eussantos@sorocaba.sp.gov.br','ubslopesdeoliveira@sorocaba.sp.gov.br','3231-4604/3223-2228','Rua Riusaku kanizawa, 795'),
(29,'UBS Márcia Mendes','Alessandra Terezinha Torrubia','atorrubia@sorocaba.sp.gov.br','csmarciamendes@sorocaba.sp.gov.br','3221-3984 / 3202-8977','Rua José Augusto Rabello Júnior, 91'),
(30,'UBS Maria do Carmo','Jacqueline Domingues Lameu Sarazar','jsarazar@sorocaba.sp.gov.br','csmariadocarmo@sorocaba.sp.gov.br','3232-6520 / 3234-5623','Rua Joaquim Ferreira Barbosa, 727'),
(31,'UBS Maria Eugênia','Adriana Rebouças Dos Santos','adrisantos@sorocaba.sp.gov.br','csmariaeugenia@sorocaba.sp.gov.br','3226-1370 / 3226-4631','Rua Mario Romano, 264'),
(32,'UBS Mineirão','Rogério Simão','Rogsimao@sorocaba.sp.gov.br','csmineirao@sorocaba.sp.gov.br','3233-7165 / 3234-5624','Rua Tenente Érico de Oliveira, 110'),
(33,'UBS Nova Esperança','Valter Moreira de Oliveira Junior','vmjunior@sorocaba.sp.gov.br','csnovaesperanca@sorocaba.sp.gov.br','3221-1214 / 3222-6404','Rua Paula Mayer Cattani, 689'),
(34,'UBS Nova Sorocaba','Luciara Neres Dos Santos','lnsantos@sorocaba.sp.gov.br','csnovasorocaba@sorocaba.sp.gov.br','3223-2488 / 3223-2001','Avenida Americana, 351'),
(42,'UBS Paineiras','Graziela Monteiro de Almeida Moreira','gralmeida@sorocaba.sp.gov.br','cspaineiras@sorocaba.sp.gov.br','3226-7178 / 3226-4176','Rua Elisa Stefani Ramos, 130'),
(48,'UBS Rodrigo','Rosangela Aparecida Cunha','rcunha@sorocaba.sp.gov.br','usfridrigo@sorocaba.sp.gov.br','3223-3131','Rua Alpheu de Castro Santos, 220'),
(49,'UBS Sabiá','Josenilda Rodrigues Ferreira','JFerreira@sorocaba.sp.gov.br','cssabia@sorocaba.sp.gov.br','3233-0974 / 3234-5661','Rua Dionizio Bueno Sampaio, 91'),
(55,'UBS Santana','Patricia Torres Salviano','psalviano@sorocaba.sp.gov.br','csvlsantana@sorocaba.sp.gov.br','3233-1160 / 3234-5620','Rua Deodoro Reis, 150'),
(56,'UBS São Bento','Marcia Cristina Almeida Lourencio','mcalmeida@sorocaba.sp.gov.br','cssaobento@sorocaba.sp.gov.br','3223-2359 / 3223-1365','RUA Gualberto Moreira, 1501'),
(58,'UBS São Guilherme','Guilherme Fernandes Feitosa','gffeitosa@sorocaba.sp.gov.br','cssaoguilherme@sorocaba.sp.gov.br','3239-8964 / 3239-9116','Rua Belmiro Moreira Soares, 1100'),
(59,'UBS Simus','Carolina Condotta Bakaukas','cbakaukas@sorocaba.sp.gov.br','csjdsimus@sorocaba.sp.gov.br','3221-1177 / 3202-6845','Alameda dos Lírios, 327'),
(60,'UBS Sorocaba I','Karine Mendonça Lopes','kmendonca@sorocaba.sp.gov.br','cssorocaba1@sorocaba.sp.gov.br','3221-7922 / 3202-6900','Avenida Américo Figueiredo, 3171'),
(73,'UBS Ulisses','Cristyane Almeida de Aguiar Melo','camelo@sorocaba.sp.gov.br','csulisses@sorocaba.sp.gov.br','3239-5016 / 3239-9563','Rua Ferdinando Irineu Corrá, S/N'),
(80,'UBS Vitória Régia','Eunice de Andrade Pereira da Silva','eusilva@sorocaba.sp.gov.br','csvitoriaregia@sorocaba.sp.gov.br','3226-1001 / 3226-4683','Rua Francisco Silva Martins, 35'),
(82,'UBS Wanel Ville','Raquel Inácia Domingos','rdomingos@sorocaba.sp.gov.br','cswanelville@sorocaba.sp.gov.br','3202-1662 / 3202-2109','Rua Alexandre Caldini, 442'),
(50,'SAD','Fernanda Figueira Leal','fleal@sorocaba.sp.gov.br','adacamados@sorocaba.sp.gov.br','3238 – 2772','Rua da Penha, 1176'),
(47,'Policlínica Municipal','Gabriela Ayres dos Santos Libio','gabriela.Ayreslibio@sorocaba.sp.gov.br','gestaopoliclinica@sorocaba.sp.gov.br','3219 – 2200','Rua Senador Roberto Simonsen, s/n'),
(51,'SAME','Cinthya Maria Rohloff Koyama','CKoyama@sorocaba.sp.gov.br','clinicadst@sorocaba.sp.gov.br','3232-2200 / 32348800','Rua Manoel Lopes, 220'),
(null,'Saúde Mental – Palácio','Eline Araújo Vitor','evitor@sorocaba.sp.gov.br','s.mental@sorocaba.sp.gov.br','3238-2792  / 991310143','Rua da Penha, 1176'),
(38,'PA Laranjeiras','Erica Juliana Leonor','ejleonor@sorocaba.sp.gov.br','palaranjeiras@sorocaba.sp.gov.br','3226-9191','R. Sônia Bernuncio, 24');
do $$
declare r record; v_unidade bigint; v_pessoa bigint; v_total integer;
begin
  for r in select * from stg_coordenadores_unidades loop
    v_unidade:=r.unidade_id;
    if v_unidade is not null then
      if not exists(select 1 from public.unidades where id=v_unidade and nome=r.unidade_nome and ativo is true) then
        raise exception 'Unidade divergente: % (%)',r.unidade_nome,v_unidade;
      end if;
    else
      select id into v_unidade from public.unidades where nome=r.unidade_nome;
      if v_unidade is null then
        insert into public.unidades(nome,ativo,revisado) values(r.unidade_nome,true,true) returning id into v_unidade;
      end if;
    end if;
    select count(*),min(id) into v_total,v_pessoa from public.pessoas
      where lower(btrim(email))=lower(r.pessoa_email) or lower(btrim(nome))=lower(r.pessoa_nome)
      or (r.pessoa_email='ejleonor@sorocaba.sp.gov.br' and id=15 and nome='Erica Leonor');
    if v_total>1 then raise exception 'Pessoa ambígua: %',r.pessoa_nome; end if;
    if v_pessoa is null then
      insert into public.pessoas(nome,email,cargo,ativo,revisado)
        values(r.pessoa_nome,r.pessoa_email,'Coordenador(a) de unidade',true,true) returning id into v_pessoa;
    else
      -- Completa cadastro reutilizado sem reescrever fiscalizações/termos guardados.
      update public.pessoas set nome=r.pessoa_nome,email=r.pessoa_email,
        cargo=coalesce(nullif(cargo,''),'Coordenador(a) de unidade'),revisado=true where id=v_pessoa;
    end if;
    update public.unidades set coordenador_id=v_pessoa,email=r.unidade_email,
      telefone=r.telefone,endereco=r.endereco,revisado=true where id=v_unidade;
  end loop;
end;
$$;
notify pgrst,'reload schema';
