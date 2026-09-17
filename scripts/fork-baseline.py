#!/usr/bin/env python3
"""Regera supabase/baseline.sql = baseline do upstream + apendice do fork.

O apendice entra ANTES do bloco "VARREDURA anon", nunca no fim: aquele bloco
cura as funcoes que nascem expostas a anon pelo ALTER DEFAULT PRIVILEGES do
corpo do baseline, e so alcanca o que vem antes dele. Apendice depois da
varredura = funcao do modulo financeiro alcancavel pela anon key, que vai para
o browser, com o gate verde.

Idempotente: rode quantas vezes quiser.
"""
import sys
import pathlib

MARCA = "-- ---- VARREDURA anon:"
# primeira linha do apendice do fork, literal (com acento, como esta no arquivo)
INICIO = "-- ---- catálogo financeiro"

raiz = pathlib.Path(__file__).resolve().parent.parent
base = raiz / "supabase" / "baseline.sql"
ap = raiz / "supabase" / "fork-apendice.sql"

b = base.open(encoding="utf-8", newline="").read()
j = b.find(MARCA)
if j < 0:
    sys.exit("bloco da VARREDURA anon nao existe no baseline - o upstream mudou de forma")

i = b.find(INICIO, 0, j)
if i >= 0:                       # ja havia apendice: tira so ele, nao o resto
    b = b[:i].rstrip("\n") + "\n\n" + b[j:]
    j = b.find(MARCA)

texto = ap.open(encoding="utf-8", newline="").read().rstrip("\n")
base.open("w", encoding="utf-8", newline="").write(b[:j] + texto + "\n\n" + b[j:])
print("baseline regerado:", texto.count("\n") + 1, "linhas de apendice, antes da varredura")
