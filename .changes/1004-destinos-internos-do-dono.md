---
impacto: capacidade_nova
secao: adicionado
titulo: Endereços da rede interna liberados por quem administra a instalação
---
Quem administra a instalação agora consegue apontá-la para um serviço que roda na rede do próprio servidor — um Whisper, um gateway compatível com a API da OpenAI — pela tela **Administração › Destinos internos**, declarando o IP ou a faixa. Sem essa declaração nada muda: o sistema continua recusando `localhost`, `10.`, `192.168.` e as demais faixas internas, tanto no texto do endereço quanto no endereço que o nome resolve. A liberação vale só para o que a INSTALAÇÃO configura (hoje, o serviço de transcrição): o endereço que uma empresa escolhe no painel dela continua sem poder apontar para dentro, esteja liberado ou não, e a chave da instalação continua sem poder sair para um endereço escolhido por ela. E ela dispensa só a recusa por endereço interno — `https` em produção e os protocolos aceitos continuam valendo. Quem já tinha a lista no `.env` (`IA_DESTINOS_INTERNOS_PERMITIDOS`) não precisa fazer nada: ela segue valendo como piso enquanto a tela nunca for usada. Quando a recusa acontece, o aviso na Central diz onde se libera.
