---
impacto: nada_mudou
secao: corrigido
titulo: A credencial do App da Meta passa a viver na instalação, e não no servidor
---
O App Secret que assina as mensagens recebidas e o código que o painel da Meta usa para confirmar o endereço do webhook passam a ser guardados na própria instalação, e não mais apenas no arquivo de configuração do servidor. Quem já tem os dois no arquivo continua funcionando sem tocar em nada: o sistema procura primeiro na instalação e usa o arquivo como reserva. O código de confirmação passa a ser sorteado pelo servidor, em vez de escolhido por quem instala, e é mostrado uma única vez. Nada muda para quem já está no ar.
