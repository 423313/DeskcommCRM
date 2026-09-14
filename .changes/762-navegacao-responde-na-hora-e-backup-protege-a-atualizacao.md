---
impacto: capacidade_nova
secao: adicionado
titulo: A navegação responde na hora, e a atualização para quando o backup falha
---

Clicar numa aba do menu deixou de parecer que a tela travou. Uma barra fina
aparece no topo no instante do clique e acompanha o carregamento, então você
sabe que o sistema ouviu — antes, entre o clique e a página aparecer não havia
sinal nenhum, e a reação natural era clicar de novo.

As telas de dentro do sistema também abrem mais rápido: as consultas que toda
página precisa fazer (quem é você, de qual empresa, quais conexões estão fora do
ar) passaram a ser feitas ao mesmo tempo em vez de uma esperando a outra, e
deixaram de ser repetidas dentro da mesma página. No banco, as buscas de
histórico por contato e por conexão ganharam índices — quem tem muita mensagem
guardada sente a diferença nas telas de conversa e no expurgo de dados da LGPD.

O `update.sh` ficou mais cuidadoso com os seus dados. Quando o backup preventivo
falha, a atualização agora PARA: se você estiver acompanhando pelo terminal, ela
pergunta e só segue se você digitar `CONTINUAR`; se for o agente do servidor
atualizando sozinho, ela cancela e avisa. Antes ela esperava oito segundos e
seguia sem backup. O `restore.sh` passou a devolver também as sessões do
WhatsApp guardadas no backup, não só o banco — restaurar deixou de exigir parear
o QR Code de novo.

E duas portas ficaram mais firmes: subir imagem para cabeçalho de modelo do
WhatsApp agora confere o conteúdo do arquivo, não o rótulo que o navegador
mandou (um SVG renomeado para `.png` entrava e agora é recusado), e passou a
exigir permissão de atendente; as rotas internas de manutenção comparam a senha
de acesso em tempo constante.

Contribuição de @maugarciasa.
