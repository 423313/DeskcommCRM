---
impacto: capacidade_nova
secao: adicionado
titulo: Endereços da rede interna liberados por quem opera o servidor
---
Quem opera o servidor agora consegue apontar a instalação para um serviço na própria rede — um Whisper, um gateway compatível com a API da OpenAI — declarando o endereço em `IA_DESTINOS_INTERNOS_PERMITIDOS` no `.env`. Sem essa declaração nada muda: o app continua recusando `localhost`, `10.`, `192.168.` e as demais faixas internas, tanto no texto do endereço quanto no IP que o nome resolve. A lista aceita nomes, IPs e faixas CIDR, e vale para o endereço DA INSTALAÇÃO (o serviço de transcrição e o binding de visão): o endereço que uma empresa escolhe no painel continua passando pela mesma régua, e a chave da instalação continua sem poder sair para um endereço escolhido por ela. Quando a recusa acontece, o aviso na Central passa a dizer qual é a variável e que quem a edita é quem opera o servidor.
