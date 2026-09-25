---
impacto: capacidade_nova
secao: alterado
titulo: Em "Cadastro", a tela avisa quando a troca de modo ainda não chegou ao servidor
---

Trocar o modo em /admin/cadastro valia na hora para as regras do CRM, mas o cadastro direto do Supabase desta VPS só acompanhava na próxima atualização — o kit sincroniza no install e no update.sh. Enquanto isso a tela dizia um modo e o servidor direto continuava aceitando (ou recusando) conta do jeito antigo, sem ninguém perceber. Agora /admin/cadastro confere o que o GoTrue da VPS está aplicando e mostra um aviso quando ele difere do modo gravado no banco, com o comando para aplicar já (bash hostgator-setup-kit/update.sh). Se não der para perguntar ao GoTrue, não há aviso — e nada é corrigido sozinho: avisar é a regra.

Contribuição de @webtecnica (#1668).
