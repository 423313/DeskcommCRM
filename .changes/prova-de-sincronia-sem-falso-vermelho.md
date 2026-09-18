---
impacto: nada_mudou
secao: corrigido
titulo: A prova de sincronia do kit para de acusar chave inocente sob carga
---
A prova de sincronia do `hostgator-setup-kit/test-validators.sh` montava a lista de escrita num pipeline de três estágios e, quando a máquina estava saturada, às vezes recebia essa lista truncada — e então acusava chaves inocentes que o `install.sh` grava na linha seguinte, com conjunto de acusadas diferente a cada rodada sobre os mesmos arquivos. O piso anti-truncagem de 30 chaves não pegava a truncagem parcial: 30 é menos da metade das 67 chaves da régua real, então 67 caindo para 40 passava por baixo da guarda e saía como acusação.

Agora a mesma régua é contada duas vezes, por caminhos independentes — a lista do pipeline e uma contagem direta no `install.sh`, de um processo só, sem pipeline e logo sem leitura parcial — e a acusação só sai se as duas contas baterem. Divergindo, ou voltando o pipeline acima com status ≠ 0, o desfecho é inconclusivo e o teste diz isso com todas as letras, nunca "chave faltando". O piso fixo sai de cena: não sobra número escolhido à mão para envelhecer a cada chave nova.

Medido em 18/09/2026 na `main`: régua real com 67 chaves e piso de 30. Truncando a régua para 40 chaves — o corte que hoje passa por baixo do piso —, o código anterior acusou 24 chaves inocentes; cortes de 31 e 33 chaves acusaram 27 e 29, sobre os mesmos arquivos. Com o mesmo corte de 40, o código novo não acusa nenhuma: fecha inconclusivo com `40 chave(s) contra 67 na contagem direta`. Com a régua inteira, a suíte segue verde até "todos os validadores passaram". Nada muda para quem instala pelo kit — o teste fica mais difícil de ficar vermelho por engano e mais claro quando fica vermelho de verdade.
