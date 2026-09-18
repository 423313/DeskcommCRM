---
impacto: nada_mudou
secao: corrigido
titulo: Rodar a suíte de testes numa VPS instalada deixa de acusar um erro que não existe
---

Quem instala o produto numa VPS copia o `.env.hostgator.example` para `.env` — é o
caminho normal da instalação. Um dos testes do projeto varre o disco procurando
repetições do endereço das imagens Docker, e esse arquivo copiado herda o mesmo
endereço que o exemplo já tem permissão de conter. Resultado: a suíte reprovava em
toda instalação de verdade, apontando para um arquivo que nem é versionado.

O `.env` e o `.env.local` são estado da máquina, não código do projeto; o teste
passou a ignorá-los, e continua reprovando qualquer arquivo versionado que repita
o endereço.
