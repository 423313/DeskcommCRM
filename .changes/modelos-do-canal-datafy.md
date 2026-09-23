---
impacto: capacidade_nova
secao: adicionado
titulo: Canal Datafy ganha a aba Modelos — criar e sincronizar modelos aprovados pela tela
---

Quem ligou o canal Datafy (`DATAFY_ENABLED=true`) passa a ver, na aba dele em **Conexões**, a sub-aba **Modelos**. Nela dá para **sincronizar** os modelos aprovados da conta e **criar** um modelo novo, que entra na fila de revisão da plataforma. O formulário é o mesmo do outro provedor parceiro: cabeçalho, corpo, rodapé, botões e exemplos.

Era o que faltava para atender **fora da janela de 24 horas**. Dentro da janela, texto livre passa. Fora dela, a Meta só aceita modelo aprovado, e até aqui este canal não tinha nenhum para oferecer.

- **O modelo sai pelo número do Datafy**, com a credencial dele, e nunca pelo número da Meta.
- **O resultado da revisão chega sozinho**: quando a plataforma aprova ou recusa, o aviso dela atualiza o modelo na lista, sem precisar clicar em Sincronizar.
- **Na conversa com a janela fechada**, o seletor oferece os modelos aprovados deste número e pede os valores de cada `{{1}}`.
- Sincronizar e criar é do **administrador**. Quem atende só consulta a lista.

Nada para fazer: quem não liga o canal não vê nada de novo. Editar e apagar um modelo ainda não estão na tela: isso continua sendo feito pelo painel do provedor.

Trabalho de @vgamkt, recortado do PR #1130.
