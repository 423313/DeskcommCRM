---
impacto: atencao
secao: corrigido
titulo: Automação com condição "contém" passa a funcionar nas tags
---
Numa automação, a condição "contém" sobre tags só disparava quando o texto digitado era idêntico à tag, maiúsculas incluídas: a regra "tag adicionada contém Google" não rodava para a tag "google" nem para "Google Ads". Agora "contém" vale por tag e não diferencia maiúsculas, igual ao que o mesmo operador já fazia em campos de texto. Atenção: regras que já existem passam a disparar em mais casos — uma condição "contém vip" agora também pega a tag "vip ouro". Se alguma regra sua dependia da igualdade exata, revise a condição. Crédito: @rafaelbatistazz.
