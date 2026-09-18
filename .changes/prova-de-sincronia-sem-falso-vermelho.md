---
impacto: nada_mudou
secao: corrigido
titulo: A prova de sincronia do kit para de acusar chave inocente sob carga
---
A prova de sincronia do `hostgator-setup-kit/test-validators.sh` confere se toda chave prometida no `.env.hostgator.example` é gravada pelo `install.sh`. Sob máquina saturada, ela às vezes acusava uma ou duas chaves que o `install.sh` grava, e a cada rodada eram chaves diferentes, sobre os mesmos arquivos.

A causa era a checagem por chave. Cada chave era conferida por um `printf | grep -qx` próprio, ou seja, um processo por chave, e qualquer falha desse processo era lida como "chave ausente". Agora a pertença é respondida dentro do próprio shell, sem abrir processo, e não tem como falhar sozinha. A assinatura das rodadas registradas na issue #1153 confirma isso: cada uma acusou uma ou duas chaves espalhadas, enquanto uma lista truncada perde a cauda e, para deixar de fora aquelas chaves, teria de acusar de 14 a 54 ao mesmo tempo.

A lista também é contada duas vezes, desenho de @webtecnica no PR #1207: a lista do pipeline e uma contagem direta no `install.sh`, as duas por chave única. Se divergirem, o resultado é inconclusivo, nunca "chave faltando". Contar por chave única evita outro falso vermelho: um `envq` repetido em dois ramos de um `if` é uma chave só. O piso fixo de 30 chaves saiu. Nada muda para quem instala pelo kit.
