---
impacto: capacidade_nova
secao: corrigido
titulo: A importação de contatos fecha a conta
---

Ao importar uma planilha, o resultado dizia quantos contatos entraram, quantos
eram repetidos e quantas linhas deram erro — e às vezes esses números não
somavam o total do arquivo. As linhas que faltavam eram repetições dentro da
própria planilha, que sumiam sem aparecer em lugar nenhum.

Numa importação real de 647 clientes, o resumo dizia "500 linhas, 487
duplicadas, 0 erros" e não dizia nada sobre as outras 13. Sem fechar a conta não
dá para saber se o resto era repetido ou se o resto se perdeu — e a diferença
entre as duas é ligar para 13 clientes ou não.

Agora toda linha aparece em algum número.

Junto, um caso que criava contato duplicado: duas grafias do mesmo telefone na
mesma planilha (com e sem o nono dígito) entravam as duas. O sistema já sabia
reconhecê-las como o mesmo número ao comparar com a base; agora usa a mesma
régua dentro do arquivo.
