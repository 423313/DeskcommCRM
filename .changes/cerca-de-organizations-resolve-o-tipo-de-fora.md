---
impacto: nada_mudou
secao: corrigido
titulo: A cerca de `organizations` resolve o tipo do cliente admin que mora em outro arquivo
---
O gate que garante que toda escrita em `organizations` passa pelo cliente admin reconhecia o cliente injetado por parâmetro só quando o TIPO estava escrito no próprio arquivo — ou num `type` local. Três formas que o `tsc` aceita ficavam vermelhas com a escrita certa: o alias importado de outro módulo (`import type { Admin } from "@/lib/waha/ingest"`, que já é exportado no repositório), o membro que chega por `extends` de uma interface, e o cliente que uma função passa para outra dentro do mesmo arquivo, sem anotação no receptor.

Agora o resolvedor atravessa o `import` até o módulo que declara o tipo — dois arquivos, o que usa e o que declara — e segue a herança até a base. A passagem entre funções passou a ser provada pela CHAMADA: o parâmetro sem anotação de uma função local não exportada é aceito quando todas as chamadas visíveis a ele entregam um cliente admin. Todas, não uma: uma chamada correta com outra entregando o cliente de sessão mantém o vermelho, e função exportada continua fora do alcance, porque pode ser chamada de um arquivo que a varredura não vê.

Nada muda para quem opera: nenhum arquivo do repositório muda de veredito (a cerca já estava verde) e o que autoriza continua sendo o tipo, nunca o nome. O que muda é o atrito de quem escreve certo.
