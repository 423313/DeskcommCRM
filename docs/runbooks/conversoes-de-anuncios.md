# Conversões de anúncios pelo CRM

## Operação

1. Em **Configurações → Conversões**, conecte a plataforma que trouxe o contato.
2. Configure a captura da origem. Anúncio direto para WhatsApp precisa fornecer o identificador real do clique; o caminho Google existente usa `gclid` e referência na mensagem. UTMs de site permitem identificar campanha, mas não substituem o identificador aceito pela API de conversões.
3. No funil, marque o negócio como ganho e preencha valor positivo e moeda. O consumidor `conversoes.venda` acompanha tanto `lead.won` quanto `lead.stage_changed`.
4. A tela mostra vendas aceitas e pendências. Depois de corrigir uma pendência, clique **Verificar ou tentar novamente**. Esse comando emite `ad_conversion.retry_requested`; não repete eventos comerciais nem notificações de ganho.

Falhas temporárias ficam visíveis e são tentadas novamente. No Data Manager, o protocolo fica no registro de envio: passagens seguintes consultam esse protocolo, sem repetir a ingestão. Após 24 horas sem conclusão, a pendência pede consulta manual. Reprocessar uma pendência com protocolo consulta novamente. Rejeição explícita de processamento libera uma nova tentativa após corrigir a causa.

Uma resposta HTTP de sucesso não basta: a Meta precisa confirmar `events_received`; no caminho Google anterior, o resultado por item precisa estar presente e sem falha parcial; no Data Manager, a consulta precisa confirmar `SUCCESS`. Isso comprova recebimento/processamento, **não** atribuição à campanha. Confira a atribuição no gerenciador de anúncios.

Eventos enviados com código de teste da Meta ficam como pendência de teste e não elevam o contador de vendas aceitas. Desative o código e só reporte vendas reais verificadas.

## Google: duas formas de conexão

- Conexões existentes permanecem na Google Ads API. O token de desenvolvedor continua necessário para esse caminho.
- Novas autorizações usam Data Manager. Use o mesmo aplicativo OAuth configurado na instalação, habilite a Data Manager API no projeto Google Cloud e autorize o escopo `https://www.googleapis.com/auth/datamanager`. Não precisa de developer token para essa API.
- A tela oferece **Autorizar nova integração do Google** para migrar uma conexão anterior de forma explícita. Conta e ação continuam sendo informadas pela tela. A escolha da API faz parte do `state` assinado; o callback grava a API junto do refresh token cifrado.
- A conexão deve ter permissão sobre a conta/ação escolhida. Se ela for alterada enquanto houver protocolo pendente, restaure o destino original para consultar esse protocolo. Não há reenvio automático para outra conta.

Configuração de instalação já existente: `GOOGLE_ADS_OAUTH_CLIENT_ID` e `GOOGLE_ADS_OAUTH_CLIENT_SECRET`; `GOOGLE_ADS_DEVELOPER_TOKEN` é específico do caminho anterior. Não há variável nova obrigatória.

Fontes oficiais consultadas em 24/09/2026 UTC:

- [Importação pela Google Ads API](https://developers.google.com/google-ads/api/docs/conversions/upload-offline): `partial_failure=true` e inspeção por item.
- [Restrições de acesso a uploads antigos](https://developers.google.com/google-ads/api/docs/deprecations): a elegibilidade histórica depende do uso anterior do recurso.
- [Ingestão Data Manager](https://developers.google.com/data-manager/api/reference/rest/v1/events/ingest) e [consulta do protocolo](https://developers.google.com/data-manager/api/reference/rest/v1/requestStatus/retrieve).

## Escopo desta entrega

Correção e evolução da integração já distribuída no núcleo. Reutiliza contatos, funil, eventos e configuração por organização. Não cria outro CRM nem transforma o envio em requisito para o atendimento.

Esta entrega usa a origem já capturada no contato e o evento de venda `Purchase`. Captura web completa para Meta, `gbraid`/`wbraid`, atribuição por nova jornada de cliente antigo, eventos por etapa, conversões otimizadas por dados pessoais e painéis de ROAS são evoluções separadas. Não são anunciados como implementados.

## Contratos e verificação

Migration 0397 adiciona API da conexão e protocolo do envio, preserva RLS/grants existentes e impede rebaixar `sent` numa execução atrasada. A RPC de reprocessamento só é executável por `service_role`; a rota exige administrador, MFA pelo guard canônico e bloqueia suporte somente leitura. Organização vem da sessão. A RPC usa lock no registro e evita dois pedidos pendentes simultâneos.

- Unitários: `conversoes-entrega-confiavel`, `conversoes-de-anuncio`, `conversao-reprocessar-rota`, `google-ads-conversoes` e `google-ads-cartao-sem-credenciais`.
- Banco: `tests/invariants/conversoes-reprocessamento-isolado.test.ts` e vocabulário banco/TypeScript.
- Navegador: `tests/e2e/conversoes-reprocessamento.spec.ts`, registrado no CI. Exige Supabase local e app construído. Não faz chamada real a contas de anúncios.
- Piloto externo necessário antes de ativar em uma instalação: clique real → mensagem recebida → negócio ganho → recibo/processamento → diagnóstico e atribuição na plataforma. Eventos e credenciais sintéticos dos testes não provam essa jornada externa.

### Living System Checklist

1. Entrada: eventos do funil e botão de reprocessamento.
2. Saída: transportes em `lib/plataformas-de-anuncio/`.
3. Registro: `ad_conversion_dispatches`, `event_log` e `ad_conversion.retry_requested` na auditoria.
4. Tela: `/app/settings/conversoes`, origem, pendência e próximo passo.
5. Porta: navegação existente de Configurações → Conversões.
6. Recuperação: retentativa transitória, consulta de protocolo e ação manual após 24 horas.
7. Configuração: formulários existentes, escolha explícita da nova autorização e explicação quando faltam credenciais.
8. Continuidade: ganho pelo humano ou pelas capacidades existentes alimenta o mesmo consumidor; falha de anúncios não interfere no atendimento.
9. Retorno: resultado altera o registro e a pendência; pedido manual volta ao mesmo consumidor, com a mesma identidade de venda.
10. Mapa: `docs/architecture/conversoes-de-anuncios.architecture.json`.
