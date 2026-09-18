---
impacto: nada_mudou
secao: corrigido
titulo: O CI passa a provar que a imagem publicada extrai texto de PDF
---

Nada muda na sua VPS: nenhuma variável nova, nenhuma migration, nenhum comando. O que muda é o que o pipeline mede antes de a imagem sair — depois que a imagem do app sobe, o job extrai um PDF de amostra DENTRO dela, pelo mesmo caminho que a rota usa, e reprova se o texto não vier.

Uma imagem publicada podia ler PDF de texto como "sem texto": a extração morre dentro dela antes de o arquivo ser aberto, e nenhum job do pipeline media isso. Os testes de extração rodam pelo repositório, onde a peça que falta na imagem existe; o gate de boot só exige que o app suba. O app sobe — a extração é que não funciona, e isso só aparecia quando alguém mandava um PDF de verdade. Enquanto o empacotamento não levar essa peça para a imagem, este passo fica vermelho de propósito: é ele dizendo no CI, na hora de publicar, o que hoje só aparecia no atendimento. Crédito: @webtecnica.
