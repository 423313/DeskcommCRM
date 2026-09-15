---
impacto: nada_mudou
secao: corrigido
titulo: Foto ou áudio que o provedor de IA recusou passa a abrir aviso na Central
---
O aviso "O agente não conseguiu ler uma foto ou áudio que o cliente enviou" já aparecia na Central quando o modelo escolhido não enxerga imagens, quando o provedor não está disponível nesta instalação ou quando falta a chave para transcrever áudio. Quando a falha vinha da própria chamada ao provedor — chave recusada, modelo que a conta não pode usar, tempo esgotado — ou do download do arquivo, o sistema tentava cinco vezes e desistia sem avisar ninguém. Agora essa desistência abre o mesmo aviso, com a frase de erro do provedor, que diferencia chave errada de modelo não liberado. No mesmo momento a Central recebe também o aviso de processamento que parou de tentar; numa pane, fica no máximo um de cada aberto por organização.
