test(e2e): a spec do inbox em tempo real passa a discriminar o conserto do realtime

Ela media só a saída (o texto na tela, que tem dois caminhos por causa do
`refetchOnWindowFocus`) e ficava verde com o canal mudo. Agora assere o que trafega
no socket — `phx_join` com token do usuário e o frame `postgres_changes` com o corpo
da mensagem — e por isso reprova quando o conserto do #327 não está no bundle.
