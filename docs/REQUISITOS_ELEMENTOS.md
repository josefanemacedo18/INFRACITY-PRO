# Catálogo de requisitos: elementos viários que o URBIS precisa cobrir

Base: inventário de funções do plugin SinalizaBIM, usado **somente como lista de requisitos** (nenhum código é reaproveitado).
Status atual do URBIS: ✅ existe · 🟡 parcial · ⬜ falta.

Princípio que rege o catálogo: **todo elemento é paramétrico**. O projetista escolhe o tipo, ajusta as dimensões,
decide o tratamento de cada encontro e o sistema recalcula o que depende dele (quantitativos, sinalização, drenagem).

## 1. Sistema viário (seção e eixo)

| Requisito | Parâmetros que o projetista controla | Status |
|---|---|---|
| Seção transversal por componentes | Ordem, largura, declividade e altura de cada componente, lado a lado | 🟡 (template por lado, sem simetria por componente) |
| Faixas de rolamento | Quantidade por sentido, largura, sentido único/duplo | 🟡 |
| Faixas exclusivas e preferenciais de ônibus | Largura, fundo colorido, linha MFE, legenda ÔNIBUS repetida | ⬜ |
| Ciclofaixa / ciclovia | Largura, lado, segregação, pintura, símbolos | ⬜ |
| Faixa de estacionamento | Tipo de vaga (paralela, 30/45/60/90°, PcD, idoso, carga e descarga, moto), quantidade | ⬜ |
| Acostamento | Largura, pavimento, declividade | ✅ |
| Faixa de segurança / transição | Largura, zebrado | ⬜ |
| Canteiro central e laterais | Largura, físico ou pintado, grama, meio-fio | 🟡 |
| Hierarquia viária (CTB art. 60) | Classe por via, que governa raios, sinalização e quantitativos | ⬜ |
| Modelos de via salvos | Biblioteca de seções reutilizáveis entre projetos | ⬜ |
| Via por pontos com curvas concordadas | PIs, raio e espiral por ponto | ✅ |
| Emenda concordada entre vias | Pista, calçada, canteiro e linhas seguindo uma curva; transição de largura | ⬜ |
| Largura variável e recuos | Baias, aceleração, desaceleração, transição com aviso | ⬜ |
| Pavimento em camadas | Camadas, espessuras, materiais, uso nos quantitativos | ✅ (parcial nos quantitativos) |

## 2. Interseções e encontros

| Requisito | Parâmetros | Status |
|---|---|---|
| Cruzamento em X | Ângulo, raios de canto, faixas por ramo | ⬜ |
| Entroncamento em T | Lado do encontro, raios, ilha de canalização | ⬜ |
| Entroncamento em Y e múltiplos ramos | Ângulo de cada ramo | ⬜ |
| Interseção em ângulo oblíquo | Ângulo, raios assimétricos | ⬜ |
| Tipo de encontro na ponta | Continuação, emenda, cruzamento sem controle | ⬜ |
| Controle do encontro | Livre, PARE, dê a preferência, semáforo, preferência à direita | ⬜ |
| Controle por ramo | Controle independente em cada aproximação | ⬜ |
| Ilhas de canalização | Gota, bolsão de conversão à esquerda, faixa de conversão livre com ilha; físicas ou pintadas | ⬜ |
| Regras de conversão (CTB art. 207) | Linha central tracejada no miolo, proibição de conversão à esquerda com R-4a | ⬜ |
| Raios de esquina | Raio por esquina, com opção de ajustar em todas | ⬜ |
| Travessias de pedestre na interseção | Localização, largura, rampas (ver seção 6) | ⬜ |

## 3. Rotatórias

| Requisito | Parâmetros | Status |
|---|---|---|
| Tipos | Mini, compacta, 1 faixa, 2 faixas, turbo (divisores físicos), oval, com by-pass, elevada, ilha em calota rampada | ⬜ |
| Modo de integração | Completa, só o anel, só a ilha (sem refazer o cruzamento inteiro) | ⬜ |
| Ramos | Mão dupla ou única, travessia, ilha separadora (física, pintada ou nenhuma), raios, controle | ⬜ |
| Marcação do anel | LBO, LMS, setas de circulação, linhas de dê a preferência pela velocidade, LFO-3 | ⬜ |
| Placas da rotatória | R-2, R-33 ou R-24a, A-12 com velocidade, marcadores de alinhamento | ⬜ |
| Ajuste automático de encontros | Recalcular ramos quando a rotatória muda | ⬜ |

## 4. Cul-de-sac e pontas livres

| Requisito | Parâmetros | Status |
|---|---|---|
| Formas | Circular, excêntrico, gota, T, Y, L | ⬜ |
| Ilha central e linha de bordo | Diâmetro, ilha, linha de bordo | ⬜ |
| Fim livre | Tratamento da ponta sem saída | ⬜ |

## 5. Sinalização horizontal

| Requisito | Parâmetros | Status |
|---|---|---|
| Linhas longitudinais | LFO-1 a LFO-5, LMS-1/2, LBO, LCO, LRE, LDP, LRV, LCA, LPP, LMS-faixa exclusiva | 🟡 (LFO-1/2/3, LMS-2, LBO) |
| Largura e cadência | Largura conforme velocidade, traço e espaço das linhas seccionadas | 🟡 |
| Deslocamento e fase | Afastamento lateral, fase do tracejado, início, fim, centro | ⬜ |
| Recuos e inversão de lados | Recuo de linha, inversão de lados | ⬜ |
| Faixas de pedestres | FTP-1 zebrada e FTP-2 paralela, com linhas de retenção (distância ajustável) | 🟡 (FTP simples) |
| Linhas transversais | Retenção, espaçamento decrescente pela velocidade (MBST Vol. IV) | ⬜ |
| Zebrados | ZPA, zebrado rodoviário, chevron, área de conflito quadriculada, MAE, lombada, faixa PcD; com furos e ao longo de contorno | ⬜ |
| Canalização | MTL, MAO, MAP dimensionadas pela velocidade, com barras | ⬜ |
| Setas de circulação (PEM) | Frente, direita, esquerda, combinadas, retorno; comprimento 5,0 / 7,5 m ou livre; escala | ⬜ |
| Símbolos | SIA, bicicleta, dê a preferência, cruz de Santo André, saúde | ⬜ |
| Legendas no pavimento | PARE, ÔNIBUS, ESCOLA, TÁXI; fonte, letras alongadas, escala | ⬜ |
| Pintura de cor | Cor da marca e material, quantitativo por cor | ⬜ |

## 6. Travessias de pedestres e acessibilidade

| Requisito | Parâmetros | Status |
|---|---|---|
| Faixa de pedestres | Posição na via, largura, meia pista ou pista inteira | 🟡 |
| Rebaixamento de calçada (NBR 9050) | Largura, inclinação máxima 8,33 %, abas triangulares, rampa lateral, piso tátil de alerta, direcional | ⬜ |
| Rebaixamento total da calçada | Rampas laterais e guia rebaixada | ⬜ |
| Guia rebaixada de veículo | Largura, posição | ⬜ |
| Rota tátil (NBR 16537) | Barras direcionais e domos de alerta nas mudanças de direção, extremos e junções | ⬜ |
| Travessia elevada | Platô com zebrado e rampas nos dois lados | ⬜ |
| Refúgio em ilha | Largura mínima e travessia | ⬜ |

## 7. Moderação de tráfego

| Requisito | Parâmetros | Status |
|---|---|---|
| Ondulação transversal (quebra-mola) | Tipo A e B, altura, comprimento, espaçamento, pintura que acompanha o perfil | ⬜ |
| Lombada e lombada invertida | Altura, comprimento, recorte da pista | ⬜ |
| Almofada (speed cushion) | Uma por faixa, posição | ⬜ |
| Estreitamento de pista e chicanes | Largura reduzida, deslocamento | ⬜ |
| Sonorizadores | Posição (bordo, acostamento, eixo) | ⬜ |

## 8. Meios-fios, sarjetas e calçadas

| Requisito | Parâmetros | Status |
|---|---|---|
| Meio-fio | Altura (0,15, 0,12, alto, rebaixado), com sarjeta conjugada | ✅ (altura livre) |
| Sarjeta | Largura, declividade, perfil côncavo | 🟡 |
| Sarjetão (travessia de águas) | Perfil côncavo real que recorta a pista | ⬜ |
| Calçada | Faixa de serviço, faixa livre (≥ 1,20 m), faixa de acesso | 🟡 (largura única) |
| Extensão de calçada | Avanço sobre o estacionamento, travessia no meio da quadra, rampas | ⬜ |
| Calçada contornando esquina | Curvas reversas ou chanfro | ⬜ |
| Área de calçada por contorno | Esquinas, ilhas, parklets, cantos arredondados | ⬜ |
| Canteiros, jardineiras, grelhas de árvore | Dimensões, material | ⬜ |
| Gramado | Área por contorno ou ao longo de linha | 🟡 |
| Faixas de caminhada coloridas | Azul ou verde, padrão CET | ⬜ |

## 9. Drenagem superficial e pluvial

| Requisito | Parâmetros | Status |
|---|---|---|
| Sarjeta e captação | Tipo, espaçamento de bocas de lobo, capacidade | 🟡 |
| Boca de lobo | Tipo, grelha, posição (junto ao meio-fio ou sobre a sarjeta) | ⬜ |
| Galerias | Diâmetros comerciais, declividade mínima, recobrimento, PVs | ✅ |
| Rede em árvore | Trechos livres, sentido, ciclos, verificação de recobrimento | ⬜ |
| Método racional e IDF | Equação da localidade, tempo de recorrência, coeficientes | ✅ (equação de exemplo) |
| Área de contribuição | Escolhida pelo usuário, nunca lida em silêncio | ⬜ |
| Valeta de corte e de pé de aterro | Largura, profundidade | ✅ |
| Dispositivo de dissipação e deságue | Tipo, posição | ⬜ |

## 10. Mobiliário, dispositivos e elementos urbanos

| Requisito | Parâmetros | Status |
|---|---|---|
| Bloqueios físicos | Segregador tartaruga, tachão, balizador, cilindro, pilarete, prisma, separador contínuo, New Jersey, defensa metálica, esfera, floreira, gradil, cone, cavalete | ⬜ |
| Tachas e tachões | Espaçamento conforme MBST | ⬜ |
| Placas de sinalização vertical | Categorias: regulamentação, advertência, indicação, educativa, serviços, turística, obras; dimensão por velocidade e área rural/urbana | 🟡 (catálogo parcial) |
| Suportes | Coluna simples ou dupla, braço, semipórtico, pórtico; altura livre | ⬜ |
| Árvores, palmeiras, arbustos | Ponto único ou distribuído ao longo de caminho | ⬜ |
| Bancos, lixeiras, postes, abrigos de ônibus, paraciclos, hidrantes, semáforos | Posição, distância | ⬜ |
| Famílias do usuário | Inserção por clique ou ao longo de linha | ⬜ |

## 11. Vagas de estacionamento

| Requisito | Parâmetros | Status |
|---|---|---|
| Vaga paralela | Comprimento, largura, lado | ⬜ |
| Vaga em 30/45/60/90° | Ângulo, comprimento, lado | ⬜ |
| Vaga PcD com faixa zebrada e SIA | Quantidade, posição | ⬜ |
| Vaga idoso, moto, carga e descarga, ônibus, táxi, ambulância | Tipo, quantidade | ⬜ |
| Quantidade automática | Preenche o meio-fio disponível ou quantidade fixa | ⬜ |
| Recuo das vagas da esquina | Distância mínima de 5 m | ⬜ |

## 12. Terreno, terraplenagem e greide

| Requisito | Parâmetros | Status |
|---|---|---|
| Superfície do terreno (TIN) | Importação, linhas de quebra, bordas | ✅ |
| Greide | PIVs, rampas, curvas verticais, K | ✅ |
| Talude de corte e aterro | Inclinação, valeta, revestimento | ✅ |
| Volumes | Por estaca, malha, comparação com a terraplenagem aplicada | 🟡 |
| Superelevação | Taxa, transição, rampa relativa | ✅ |
| Verificação normativa | Limites informados pelo usuário com a fonte | 🟡 |

## 13. Lotes e parcelamento

| Requisito | Parâmetros | Status |
|---|---|---|
| Divisão de quadras | Frente, profundidade, divisão por linhas | ✅ |
| Mínimos de lote | Área e frente configuráveis | ✅ |
| Quadro de áreas | Sistema viário, lotes, institucional, verde | ✅ |
| Memorial de lotes | Vértices, azimutes, distâncias | ✅ |

## 14. Documentação, quantitativos e validação

| Requisito | Parâmetros | Status |
|---|---|---|
| Pranchas e memoriais | Formatos, escalas, carimbo | ✅ |
| Quantitativos por componente | Por via, por camada, por marca | 🟡 |
| Validação sem alterar o projeto | Severidade (erro, aviso, info) e confiança | 🟡 |
| Estado dos resultados | Atualizado ou desatualizado em relação ao modelo | ⬜ |

## Resumo do que falta

Para chegar ao nível que você descreveu, o URBIS precisa de quatro grandes blocos novos:

1. **Interseções e rotatórias** (seções 2, 3 e 4): é a maior lacuna.
2. **Sinalização completa** (seções 5 e 6), com zebrados, setas, legendas e canalização.
3. **Mobiliário, dispositivos e vagas** (seções 10 e 11).
4. **Moderação e acessibilidade** (seções 6 e 7), com rebaixamentos, rota tátil e lombadas.

Cada bloco precisa de três coisas: o elemento como objeto paramétrico, a regra normativa com fonte e o quantitativo ligado a ele.
