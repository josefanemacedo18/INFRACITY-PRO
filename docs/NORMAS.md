# Normas e parâmetros do URBIS

Documento gerado automaticamente a partir de `app/core/norms/brasil.js` (`node scripts/gen-normas-doc.js`).

Status: **confirmado** (conferido em pesquisa durante o desenvolvimento), **referência** (valor da norma citada, a conferir no documento oficial), **prática** (prática corrente de projeto, ajustável).

## Parâmetros

| Grupo | Parâmetro | Valor | Fonte | Status |
|---|---|---|---|---|
| Geometria | Atrito transversal máximo f (30 a 120 km/h) | 0,2 / 0,18 / 0,16 / 0,15 / 0,15 / 0,14 / 0,14 / 0,13 / 0,12 / 0,11 | DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999) | referência |
| Geometria | Raio com superelevação dispensável (m) | 450 / 800 / 1250 / 1800 / 2450 / 3200 / 4050 / 5000 | DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999) | confirmado |
| Geometria | Distância de visibilidade de parada mínima (m) | 30 / 45 / 60 / 75 / 90 / 110 / 130 / 155 / 180 / 205 | DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999) | referência |
| Geometria | K mínimo convexa | 2 / 5 / 9 / 14 / 20 / 29 / 41 / 58 / 79 / 102 | DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999) | referência |
| Geometria | K mínimo côncava | 4 / 7 / 11 / 15 / 19 / 24 / 29 / 36 / 43 / 50 | DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999) | referência |
| Geometria | Rampa relativa máxima borda/eixo (%) | 0,75 / 0,7 / 0,65 / 0,6 / 0,55 / 0,5 / 0,47 / 0,44 / 0,41 / 0,38 | AASHTO - A Policy on Geometric Design of Highways and Streets (referência complementar) | referência |
| Geometria | Comprimento mínimo de curva vertical | L ≥ 0,6·V | DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999) | referência |
| Geometria | Rampa mínima | 0,5% | DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999) | referência |
| Trânsito | Velocidades máximas (trânsito rápido / arterial / coletora / local) | 80 / 60 / 40 / 30 km/h | Lei 9.503/1997 - Código de Trânsito Brasileiro, art. 61 | confirmado |
| Seção transversal | Abaulamento de pista asfáltica | 0,02 | DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999) | referência |
| Seção transversal | Declividade de acostamento | 0,05 | DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999) | referência |
| Seção transversal | Faixa livre mínima do passeio (m) | 1,2 | ABNT NBR 9050:2020 - Acessibilidade | confirmado |
| Seção transversal | Faixa de serviço mínima (m) | 0,7 | ABNT NBR 9050:2020 - Acessibilidade | confirmado |
| Seção transversal | Inclinação transversal máxima da faixa livre | 0,03 | ABNT NBR 9050:2020 - Acessibilidade | confirmado |
| Seção transversal | Inclinação máxima do rebaixamento de calçada | 0,0833 | ABNT NBR 9050:2020 - Acessibilidade | confirmado |
| Seção transversal | Largura mínima do rebaixamento (m) | 1,5 | ABNT NBR 9050:2020 - Acessibilidade | confirmado |
| Seção transversal | Talude de corte (H:V) | 1 | DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999) | prática |
| Seção transversal | Talude de aterro (H:V) | 1,5 | DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999) | prática |
| Drenagem | Lâmina máxima na sarjeta (guia 15 cm) | 0,13 m | DNIT - Manual de Drenagem de Rodovias (IPR-724, 2006) | confirmado |
| Drenagem | Diâmetros comerciais de tubos (m) | 0,3 / 0,4 / 0,5 / 0,6 / 0,7 / 0,8 / 0,9 / 1 / 1,1 / 1,2 / 1,5 / 2 | ABNT NBR 8890 - Tubo de concreto para águas pluviais e esgoto | referência |
| Drenagem | Diâmetro mínimo de galeria (m) | 0,4 | DNIT - Manual de Drenagem de Rodovias (IPR-724, 2006) | prática |
| Drenagem | Lâmina máxima y/D | 0,85 | DNIT - Manual de Drenagem de Rodovias (IPR-724, 2006) | prática |
| Drenagem | Velocidade mínima (m/s) | 0,75 | DNIT - Manual de Drenagem de Rodovias (IPR-724, 2006) | prática |
| Drenagem | Velocidade máxima em tubo de concreto (m/s) | 5 | DNIT - Manual de Drenagem de Rodovias (IPR-724, 2006) | prática |
| Drenagem | Recobrimento mínimo da galeria (m) | 1 | DNIT - Manual de Drenagem de Rodovias (IPR-724, 2006) | prática |
| Drenagem | Velocidade máxima na sarjeta (m/s) | 3 | DNIT - Manual de Drenagem de Rodovias (IPR-724, 2006) | prática |
| Drenagem | Tempo de concentração mínimo (min) | 10 | DNIT - Manual de Hidrologia Básica para Estruturas de Drenagem (IPR-715, 2005) | prática |
| Drenagem | Área máxima para o método racional (km²) | 3 | DNIT - Manual de Hidrologia Básica para Estruturas de Drenagem (IPR-715, 2005) | prática |
| Pavimentação | Espessura total (DNER/1981) | Ht = 77,67·N^0,0482·CBR^-0,598 (cm) | DNER - Método de Projeto de Pavimentos Flexíveis (Souza, 1981), IPR-719 (2006) | confirmado |
| Pavimentação | Revestimento mínimo por N | ≤10⁶: TS; ≤5·10⁶: 5 cm; ≤10⁷: 7,5 cm; ≤5·10⁷: 10 cm; >5·10⁷: 12,5 cm | DNER - Método de Projeto de Pavimentos Flexíveis (Souza, 1981), IPR-719 (2006) | confirmado |
| Sinalização | Largura de linhas longitudinais | 0,10 m (V < 80) / 0,15 m (V ≥ 80) | CONTRAN - Manual Brasileiro de Sinalização de Trânsito, Vol. IV (Res. 236/2007) | confirmado |
| Sinalização | Cadência de linhas seccionadas | 2/4 m (V ≤ 60) / 4/12 m (V > 60) | CONTRAN - Manual Brasileiro de Sinalização de Trânsito, Vol. IV (Res. 236/2007) | referência |
| Sinalização | Placa R-1 (lado, urbana / rodovia) | 0,35 / 0,50 m (mín. 0,25 / 0,40 m) | CONTRAN - Manual Brasileiro de Sinalização de Trânsito, Vol. I (Res. 180/2005) | confirmado |
| Parcelamento | Área mínima de lote (m²) | 125 | Lei 6.766/1979 - Parcelamento do Solo Urbano (alterada pela Lei 13.913/2019) | confirmado |
| Parcelamento | Frente mínima de lote (m) | 5 | Lei 6.766/1979 - Parcelamento do Solo Urbano (alterada pela Lei 13.913/2019) | confirmado |
| Parcelamento | Faixa não edificável ao longo de rodovias e ferrovias (m, cada lado) | 15 | Lei 6.766/1979 - Parcelamento do Solo Urbano (alterada pela Lei 13.913/2019) | confirmado |
| Parcelamento | APP de nascentes (raio, m) | 50 | Lei 12.651/2012 - Código Florestal, art. 4º | referência |
| Parcelamento | APP de lagos naturais em zona urbana (m) | 30 | Lei 12.651/2012 - Código Florestal, art. 4º | referência |

## Classes de via (valores padrão)

| Classe | V (km/h) | Faixa (m) | Faixas por sentido | Acostamento (m) | emax | Rampa máx. | Passeio (m) |
|---|---|---|---|---|---|---|---|
| Via urbana local | 30 | 3.00 | 1 | 0.00 | 4% | 15.0% | 2.50 |
| Via urbana coletora | 40 | 3.30 | 1 | 0.00 | 4% | 12.0% | 3.00 |
| Via urbana arterial | 60 | 3.50 | 2 | 0.00 | 6% | 8.0% | 3.00 |
| Via urbana de trânsito rápido | 80 | 3.60 | 2 | 2.50 | 8% | 6.0% | 0.00 |
| Rodovia classe I | 80 | 3.60 | 1 | 2.50 | 10% | 4.5% | 0.00 |
| Rodovia classe II | 70 | 3.50 | 1 | 2.50 | 8% | 5.0% | 0.00 |
| Rodovia classe III | 60 | 3.30 | 1 | 2.00 | 8% | 6.0% | 0.00 |
| Rodovia classe IV | 40 | 3.00 | 1 | 1.00 | 8% | 8.0% | 0.00 |

## Placas (dimensão característica, m)

| Forma | Urbana | Rodovia | Mínimo urbano | Mínimo rodovia | Status |
|---|---|---|---|---|---|
| Octógono (R-1) (lado) | 0.35 | 0.50 | 0.25 | 0.40 | confirmado |
| Circular (regulamentação) (diâmetro) | 0.50 | 0.75 | 0.40 | 0.75 | referência |
| Triangular (R-2) (lado) | 0.75 | 0.90 | 0.75 | 0.90 | referência |
| Quadrada em losango (advertência) (lado) | 0.50 | 0.60 | 0.45 | 0.60 | referência |
| Retangular (indicação) (largura) | 1.00 | 2.00 | 0.50 | 1.00 | prática |

## Referências

- DNER/DNIT - Manual de Projeto Geométrico de Rodovias Rurais (IPR-706, 1999)
- DNIT - Manual de Projeto Geométrico de Travessias Urbanas (IPR-740, 2010)
- DNIT - Manual de Drenagem de Rodovias (IPR-724, 2006)
- DNIT - Manual de Hidrologia Básica para Estruturas de Drenagem (IPR-715, 2005)
- DNER - Método de Projeto de Pavimentos Flexíveis (Souza, 1981), IPR-719 (2006)
- Lei 9.503/1997 - Código de Trânsito Brasileiro, art. 61
- CONTRAN - Manual Brasileiro de Sinalização de Trânsito, Vol. I (Res. 180/2005)
- CONTRAN - Manual Brasileiro de Sinalização de Trânsito, Vol. II (Res. 243/2007)
- CONTRAN - Manual Brasileiro de Sinalização de Trânsito, Vol. IV (Res. 236/2007)
- ABNT NBR 9050:2020 - Acessibilidade
- ABNT NBR 8890 - Tubo de concreto para águas pluviais e esgoto
- ABNT NBR 13133 - Execução de levantamento topográfico
- Lei 6.766/1979 - Parcelamento do Solo Urbano (alterada pela Lei 13.913/2019)
- Lei 12.651/2012 - Código Florestal, art. 4º
- AASHTO - A Policy on Geometric Design of Highways and Streets (referência complementar)

## Observações

- Durante o desenvolvimento, os sites gov.br e dos DERs estavam bloqueados no ambiente de pesquisa. Por isso, parte dos valores está como "referência" e deve ser conferida nos manuais oficiais (DNIT IPR-706, IPR-740, IPR-724; CONTRAN MBST).
- Todos os valores podem ser ajustados no código do perfil normativo. Exigências estaduais ou municipais mais restritivas prevalecem.
