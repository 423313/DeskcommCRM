# Prospecção nativa

Em **CRM → Prospecção**, um administrador configura a chave Apify, pesquisa empresas no Brasil por segmento/região e consulta dados comerciais. O adaptador usa o mesmo Actor Google Maps dos fluxos existentes. Não depende de n8n nem grava em Airtable.

A busca é paga pelo saldo da conta Apify: limite de até 100 empresas e teto de US$ 0,50 a US$ 10 por execução. A quantidade pode ser menor. O enriquecimento consulta e-mails comerciais e redes do site, sem buscar pessoas físicas ou decisores. Chave cifrada por `fn_encrypt_oauth`, indisponível aos papéis do navegador. Não existe chave obrigatória no `.env`.

## Campanha

Depois da pesquisa, defina agente, conexão, funil, etapa de entrada, etapa de qualificados, oferta, critérios, ritmo e referência real da avaliação de legítimo interesse. O agente precisa estar publicado, automático, com a ferramenta `crm_move_lead_stage` e acesso ao funil. Ele precisa atender o canal selecionado ou ser membro do roteador com continuidade ativa. O roteador pode encaminhar uma mudança de assunto para outro agente.

A ativação cria contatos e negócios usando os handlers existentes. Telefones e identificadores de empresa são únicos por organização; contatos anteriores são preservados. Uma preparação interrompida deve ser retomada com a mesma configuração. A fila começa após um minuto e envia somente a primeira abordagem. Respostas passam pelo atendimento normal; a qualificação exige os critérios definidos pelo operador e só é contada quando a etapa do negócio muda. Encontrar uma empresa não significa qualificá-la.

Há uma campanha ativa por organização, até 50 tentativas em 24 horas no conjunto das campanhas, e intervalo mínimo de cinco minutos. Falhas e envios incertos consomem o limite. A janela do número, modo de teste, versão do agente, fechamento do atendimento, recusa, pausa e intervenção humana continuam ativos. Pausar interrompe novas abordagens; uma transmissão já iniciada pode concluir.

## Operação e recuperação

- Scheduler chama `/api/v1/cron/prospecting` a cada minuto, com segredo interno. Atualize a imagem do scheduler junto da aplicação. Em desenvolvimento, `pnpm dev:crons` inclui a mesma rota.
- Busca sem confirmação nunca é repetida automaticamente: confira as execuções da Apify antes de iniciar outra.
- Envio incerto não é reenviado automaticamente. O resultado e o link do Inbox ficam na campanha para revisão.
- Erro de envio pausa a campanha. Retome depois de corrigir o agente, conexão ou atendimento; candidatos que falharam permanecem em revisão.
- Novas extrações são iniciadas manualmente. Não há recarga automática de listas ou sequência de insistência para quem não respondeu.

## Sistema vivo

Entrada: administrador e pesquisa → `prospecting_campaigns/candidates`. Saída: `createContactHandler`, `createLeadHandler`, `sendMessageHandler` e turno do agente no Inbox. Comandos emitem `prospecting.changed`; cadastro e atendimento conservam as atividades canônicas. Resultados, erros e próximos envios aparecem em `/app/prospecting`, registrado no catálogo de navegação. A falha pausa a fila e exige revisão, e o resultado da conversa altera o estado exibido. A continuidade humana e IA usa o Inbox existente. Não responder não inicia novas insistências automaticamente; o operador revisa o histórico para decidir o próximo passo.

Mapa: `docs/architecture/prospeccao-nativa.architecture.json`.

### Anonimização e nova extração

A anonimização canônica do contato também limpa telefone, endereço, e-mails,
links e enriquecimento do candidato e o retira da fila. Tokens pseudônimos,
restritos ao servidor e nunca devolvidos pela API, impedem reimportar a mesma
origem ou telefone na organização. A exclusão de dados no provedor de busca
segue o processo próprio desse provedor.
