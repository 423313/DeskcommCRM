---
impacto: nada_mudou
secao: corrigido
titulo: A guarda da release confere a identidade do PR de origem, e não o nome do autor do commit
---
O passo que decide se um push para a `main` corta tag de release conferia o NOME de autor do commit — campo de texto que quem commita escolhe, e que era um literal dentro do próprio `release.yml`. Agora ele pergunta à API do GitHub quem abriu o PR de origem daquele merge, e só corta a tag quando o PR foi aberto pelo bot do App da release ou quando o head do PR é um branch `release/*` do repositório de cima, que é o caminho por onde um corte legítimo passa. Um commit que se apresente com o nome do bot num PR de outra pessoa passa a ser recusado, e o passo da guarda fica vermelho em vez de criar a tag em silêncio. A contagem de fragmentos apagados também passou a pedir `--find-renames`, para que renomear um fragmento não seja lido como fragmento consumido. Nada muda na operação de quem já roda o DeskcommCRM numa VPS.
