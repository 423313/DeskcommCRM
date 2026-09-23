---
impacto: capacidade_nova
secao: adicionado
titulo: WhatsApp oficial pelo Datafy, um canal opcional que vem desligado
---

Dá para conectar um número oficial do WhatsApp pelo **Datafy**, parceiro
homologado pela Meta. A empresa cola só o token de acesso. O sistema descobre
sozinho o número e a conta, confere o token antes de gravar e passa a enviar e
receber mensagens por esse número.

**O canal vem desligado, e quem não o liga não vê nada.** Não aparece aba, a
rota de conexão não responde e o webhook recusa entregas. Para ligar, ponha
`DATAFY_ENABLED=true` no `.env` e reinicie o app. Depois cada empresa conecta o
próprio número em **Conexões**, na aba que passa a aparecer.

- **Dois passos na tela.** Primeiro o token, e com ele o CRM já envia. Depois,
  no painel do provedor, cole a URL de webhook que a tela mostra e ative a
  assinatura. Por fim, cole no CRM o segredo que o painel mostrar. Sem esse
  segredo o CRM envia, mas recusa tudo o que chega, e a tela avisa isso.
- **Credencial guardada cifrada**, por empresa. Ela não volta à tela depois de
  gravada.
- **Mesmas regras do WhatsApp oficial:** janela de 24 horas e custo por
  mensagem. Por enquanto, este canal ainda não gerencia os modelos aprovados, e
  por isso não envia modelo fora da janela. O atendimento dentro da janela
  funciona normalmente. Imagem e áudio recebidos do cliente também ficam para a
  próxima versão.

Trabalho de @vgamkt, recortado do PR #1130.
