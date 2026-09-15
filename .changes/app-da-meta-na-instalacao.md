---
impacto: capacidade_nova
secao: adicionado
titulo: O App da Meta passa a ser cadastrado pela tela de administração, sem editar o servidor
---
Para receber mensagens pelo número oficial da Meta, era preciso abrir o arquivo de configuração do servidor e escrever lá a chave secreta do aplicativo e um código de confirmação inventado por quem instalou.

Agora quem administra a instalação faz isso em **Admin › API Oficial (Meta)**: cola a chave secreta do aplicativo e o sistema gera sozinho o token de verificação, mostrado uma única vez, pronto para copiar para o painel da Meta. A chave fica guardada cifrada e nunca volta a aparecer. Se o token se perder, dá para gerar outro na mesma tela — ela avisa antes que o novo precisa ser colado na Meta.

A tela de Conexões e o primeiro acesso passam a apontar para esse lugar, em vez de mandar configurar o servidor.

Você não precisa fazer nada. Quem já tem a chave e o token no arquivo de configuração continua funcionando como está: o arquivo segue valendo como reserva, e só deixa de ser usado quando alguém salvar pela tela.

A guarda da credencial na instalação é contribuição de @webtecnica.
